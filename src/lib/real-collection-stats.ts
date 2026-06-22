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
import { ARTIFACTS, CHARACTERS, CAMPAIGNS } from "./data";
// (registry localStorage is no longer an unlock source; see registryUnlockMigration.ts)
import { listRegistry } from "./contentRegistryStorage";
import { displayName } from "./display-names";
import { getPackEntity } from "./packs/registry";
import { supabase } from "@/integrations/supabase/client";

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

function kindFromType(t: string): UnifiedUnlock["kind"] {
  return TYPE_TO_KIND[t.toLowerCase()] ?? "حدث";
}

function useSupabaseCollection() {
  const [rows, setRows] = useState<
    Array<{ type: string; slug: string; unlockedAt: number }>
  >([]);
  const [validSlugs, setValidSlugs] = useState<Set<string> | null>(null);
  const [slugTitles, setSlugTitles] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) return;
        const [colRes, encRes] = await Promise.all([
          supabase
            .from("user_collection")
            .select("item_id,item_type,unlocked_at")
            .eq("user_id", uid),
          supabase
            .from("encyclopedia_entities")
            .select("slug,title")
            .eq("enabled", true),
        ]);
        if (cancelled) return;
        const slugSet = new Set<string>();
        const titleMap = new Map<string, string>();
        for (const r of (encRes.data ?? []) as Array<{ slug: string; title: string | null }>) {
          const s = String(r.slug ?? "").toLowerCase();
          if (!s) continue;
          slugSet.add(s);
          const t = (r.title ?? "").trim();
          // Prefer the first Arabic title encountered per slug.
          if (t && !titleMap.has(s) && HAS_ARABIC.test(t)) titleMap.set(s, t);
        }
        setValidSlugs(slugSet);
        setSlugTitles(titleMap);
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
  }, []);
  return { rows, validSlugs, slugTitles };
}

export function useRealCollectionStats() {
  const { profile } = useProfile();
  const { rows: supaRows, validSlugs } = useSupabaseCollection();

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
    for (const i of registry) m.set(i.id.toLowerCase(), i);
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
      const slugLower = r.slug.toLowerCase();
      // Route-resolvability guard: only surface rows whose slug exists in
      // the canonical content (pack registry OR Supabase encyclopedia_entities).
      // This filters out legacy/demo rows with malformed slugs (e.g.
      // `figure_salah_al_din`) that would lead to /encyclopedia/entity/<slug>
      // not-found pages.
      const inPack = !!getPackEntity(r.slug);
      const inEnc = validSlugs ? validSlugs.has(slugLower) : true; // be lenient until loaded
      if (!inPack && !inEnc) { logMissingTitle("supabase-route", r.slug); continue; }

      const regItem = registryById.get(slugLower);
      const dn = displayName(r.slug);
      const candidate =
        (isValidArabicTitle(regItem?.name) ? regItem!.name : null) ??
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
        to: `/encyclopedia/entity/${r.slug}`,
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
  }, [supaRows, validSlugs, registryById]);


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
    profile.investigationsCompleted.length;
  const battlesCompleted = useMemo(() => {
    const ids = new Set(profile.missionsCompleted);
    return CAMPAIGNS.flatMap((c) => c.missions).filter(
      (m) =>
        ids.has(m.id) &&
        (m.title.includes("معركة") || m.title.includes("غزوة") || m.title.includes("فتح")),
    ).length;
  }, [profile.missionsCompleted]);

  return {
    totalCollection,
    eventsDiscovered,
    battlesCompleted,
    recent,
    all,
  };
}
