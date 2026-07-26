// ============================================================
// Real Collection Stats — single source of truth for homepage
// counters and "recently discovered" rails.
//
// Merges three unlock systems:
//   1. Local profile arrays (artifactsFound / charactersUnlocked /
//      missionsCompleted / storiesRead / timelinesCompleted /
//      investigationsCompleted)
//   2. Supabase `user_collection` rows
//   3. Imported-campaign registry unlocks (localStorage)
//
// Identical to the logic used by the museum (`/collection`), so
// numbers on the homepage match what the player sees there.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useProfile } from "./profile";
import { useCanonicalInvestigationProgress } from "./investigations/progress";
import { listRegistry } from "./contentRegistryStorage";
import { displayName } from "./display-names";
import { supabase } from "@/integrations/supabase/client";
import { isAndroidUltraStableMode } from "./androidFreezeDiagnostics";
import { safeKey } from "@/lib/text/safe-text";

/** Items whose Arabic title cannot be resolved are excluded from
 *  homepage rails. Their raw IDs are logged once so data owners can
 *  fix the underlying registry/Supabase content. */
const _missingTitlesLogged = new Set<string>();
function logMissingTitle(source: string, id: string) {
  const k = `${source}:${id}`;
  if (_missingTitlesLogged.has(k)) return;
  _missingTitlesLogged.add(k);
  // eslint-disable-next-line no-console
  console.warn(`[home] unresolved Arabic title (${source}): ${id}`);
}
/** Arabic regex: any letter in the Arabic Unicode block. */
const HAS_ARABIC = /[\u0600-\u06FF]/;
function isValidArabicTitle(s: string | null | undefined): s is string {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  return HAS_ARABIC.test(t);
}

export type UnifiedUnlock = {
  key: string;
  kind: "شخصية" | "أثر" | "مدينة" | "معركة" | "حدث" | "معلم" | "دولة" | "علم";
  title: string;
  subtitle?: string;
  icon: string;
  to: string;
  unlockedAt: number; // ms epoch (0 if unknown — sorts last)
};

const KIND_ICON: Record<UnifiedUnlock["kind"], string> = {
  شخصية: "👤",
  أثر: "🏺",
  مدينة: "🏛️",
  معركة: "⚔️",
  حدث: "📜",
  معلم: "🕌",
  دولة: "🏳️",
  علم: "📖",
};

const TYPE_TO_KIND: Record<string, UnifiedUnlock["kind"]> = {
  figure: "شخصية", character: "شخصية", scholar: "علم",
  artifact: "أثر", relic: "أثر",
  city: "مدينة", landmark: "معلم",
  battle: "معركة",
  event: "حدث",
  state: "دولة", dynasty: "دولة",
};

function kindFromType(t: unknown): UnifiedUnlock["kind"] {
  return TYPE_TO_KIND[safeKey(t)] ?? "حدث";
}

function useSupabaseCollection() {
  const [rows, setRows] = useState<
    Array<{ type: string; slug: string; unlockedAt: number }>
  >([]);
  const [validSlugs, setValidSlugs] = useState<Set<string> | null>(null);
  const [slugTitles, setSlugTitles] = useState<Map<string, string>>(new Map());
  const [canonicalSlugFor, setCanonicalSlugFor] = useState<Map<string, string>>(new Map());
  const [reloadTick, setReloadTick] = useState(0);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  // Track the signed-in user id so we can (a) refetch when it changes and
  // (b) hard-reset local state on sign-out so a subsequent sign-in never
  // shows the previous user's discoveries.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setCurrentUid(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUid(uid);
      if (event === "SIGNED_OUT") {
        setRows([]); // clear previous user immediately
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Whenever the durable outbox drains, refresh so a just-synced discovery
  // appears in "آخر اكتشافاتي" without a manual reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setReloadTick((n) => n + 1);
    window.addEventListener("irth:outbox:flushed", bump);
    window.addEventListener("online", bump);
    return () => {
      window.removeEventListener("irth:outbox:flushed", bump);
      window.removeEventListener("online", bump);
    };
  }, []);

  useEffect(() => {
    if (isAndroidUltraStableMode()) return;
    if (!currentUid) return;
    let cancelled = false;
    (async () => {
      try {
        const [colRes, encRes] = await Promise.all([
          supabase
            .from("user_collection")
            .select("item_id,item_type,unlocked_at")
            .eq("user_id", currentUid),
          supabase
            .from("encyclopedia_entities")
            .select("slug,title,metadata")
            .eq("enabled", true),
        ]);
        if (cancelled) return;
        const slugSet = new Set<string>();
        const titleMap = new Map<string, string>();
        const canonicalMap = new Map<string, string>();
        for (const r of (encRes.data ?? []) as Array<{ slug: string; title: string | null; metadata: any }>) {
          const s = String(r.slug ?? "").toLowerCase();
          if (!s) continue;
          slugSet.add(s);
          canonicalMap.set(s, s);
          const t = (r.title ?? "").trim();
          if (t && !titleMap.has(s) && HAS_ARABIC.test(t)) titleMap.set(s, t);
          const aliases = Array.isArray(r.metadata?.aliases) ? r.metadata.aliases : [];
          const legacyId = typeof r.metadata?.legacy_id === "string" ? r.metadata.legacy_id : null;
          for (const rawAlias of [legacyId, ...aliases]) {
            const a = String(rawAlias ?? "").toLowerCase().trim();
            if (!a) continue;
            slugSet.add(a);
            canonicalMap.set(a, s);
            if (t && HAS_ARABIC.test(t) && !titleMap.has(a)) titleMap.set(a, t);
          }
        }
        setValidSlugs(slugSet);
        setSlugTitles(titleMap);
        setCanonicalSlugFor(canonicalMap);
        setRows(
          (colRes.data ?? []).map((r: any) => ({
            type: String(r.item_type ?? ""),
            slug: String(r.item_id ?? ""),
            unlockedAt: r.unlocked_at ? new Date(r.unlocked_at).getTime() : 0,
          })),
        );
      } catch {
        /* offline / signed-out */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUid, reloadTick]);
  return { rows, validSlugs, slugTitles, canonicalSlugFor };
}

export function useRealCollectionStats() {
  const { profile } = useProfile();
  const canonicalInv = useCanonicalInvestigationProgress();
  const { rows: supaRows, validSlugs, slugTitles, canonicalSlugFor } = useSupabaseCollection();

  // Registry is consulted only for display metadata (Arabic name/image)
  // of Supabase rows. It is no longer an unlock source.
  const registry = useMemo(() => {
    try {
      return listRegistry();
    } catch {
      return [];
    }
  }, []);
  const registryById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof listRegistry>[number]>();
    // `registry` comes from localStorage (untrusted JSON): an item with a
    // missing/non-string `id` used to throw here and, because the bad row
    // survived force-close, produced a persistent crash loop on Home.
    for (const i of registry) {
      const key = safeKey((i as { id?: unknown } | null)?.id);
      if (!key) continue;
      m.set(key, i);
    }
    return m;
  }, [registry]);

  // ===== Merge into unified list =====
  const all = useMemo<UnifiedUnlock[]>(() => {
    const seen = new Set<string>();
    const out: UnifiedUnlock[] = [];

    const push = (u: UnifiedUnlock) => {
      if (seen.has(u.key)) return;
      seen.add(u.key);
      out.push(u);
    };

    // 1. Supabase user_collection — has reliable timestamps
    for (const r of supaRows) {
      const kind = kindFromType(r.type);
      const slugLower = safeKey(r.slug);
      if (!slugLower) continue;
      const canonicalSlug = canonicalSlugFor.get(slugLower) ?? slugLower;
      // Route-resolvability guard: only surface rows whose slug exists in
      // the canonical content (pack registry OR Supabase encyclopedia_entities).
      // This filters out legacy/demo rows with malformed slugs (e.g.
      // `figure_salah_al_din`) that would lead to /encyclopedia/entity/<slug>
      // not-found pages.
      const inEnc = validSlugs ? validSlugs.has(slugLower) : true; // be lenient until loaded
      if (!inEnc) { logMissingTitle("supabase-route", r.slug); continue; }

      const regItem = registryById.get(slugLower);
      const dn = displayName(r.slug);
      const encTitle = slugTitles.get(slugLower);
      const candidate =
        (isValidArabicTitle(regItem?.name) ? regItem!.name : null) ??
        (isValidArabicTitle(encTitle) ? encTitle! : null) ??
        (dn !== r.slug && isValidArabicTitle(dn) ? dn : null);
      if (!candidate) { logMissingTitle("supabase", r.slug); continue; }
      const img = (regItem?.image ?? "").trim();
      const icon = img && [...img].length === 1 ? img : KIND_ICON[kind];
      push({
        key: `sb:${r.type}:${r.slug}`,
        kind,
        title: candidate,
        subtitle: kind,
        icon,
        to: `/encyclopedia/entity/${canonicalSlug}`,
        unlockedAt: r.unlockedAt,
      });
    }

    // NOTE: Imported-registry unlocks (localStorage) are NO LONGER an
    // independent unlock source. They are migrated into Supabase
    // user_collection on boot / SIGNED_IN by registryUnlockMigration.ts.
    // The registry map is still consulted above to resolve Arabic
    // display names/images for Supabase rows.
    //
    // Legacy profile arrays (charactersUnlocked / artifactsFound) are
    // also intentionally NOT included — they contained demo/seed data
    // (e.g. Salah al-Din, Umar) and are not migrated.

    return out;
  }, [supaRows, validSlugs, slugTitles, canonicalSlugFor, registryById]);


  // Recently discovered: Supabase rows only, newest first.
  const recent = useMemo<UnifiedUnlock[]>(() => {
    return [...all]
      .sort((a, b) => b.unlockedAt - a.unlockedAt)
      .slice(0, 8);
  }, [all]);


  // ===== Aggregate counters =====
  const totalCollection = all.length;
  const eventsDiscovered =
    profile.storiesRead.length +
    profile.timelinesCompleted.length +
    canonicalInv.count;
  const battlesCompleted = profile.missionsCompleted.length;

  return {
    totalCollection,
    eventsDiscovered,
    battlesCompleted,
    recent,
    all,
  };
}
