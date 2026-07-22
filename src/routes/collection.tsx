// ============================================================
// Museum / Collection
// ------------------------------------------------------------
// SOURCE-OF-TRUTH RULES (museum cleanup):
//
//   1. Every visible card MUST correspond to a real, enabled
//      row in Supabase `encyclopedia_entities`. No fake or
//      placeholder hardcoded items, no invented poetic names.
//
//   2. Six museum categories (in this exact order):
//        شخصيات · آثار · معالم · مدن · معارك · أحداث
//      → entity_types: figure, artifact, landmark, city,
//        battle, event.
//      "دول" was removed from the museum on purpose; states
//      live in the encyclopedia under "دول وحضارات" instead.
//
//   3. "Unlocked" for an entity is determined by ANY of:
//        a) a row in Supabase `user_collection` for this user
//           with (item_type, item_id) = (type, slug);
//        b) an imported-campaign registry unlock whose raw id
//           is `${type}:${slug}` OR `${type}:${legacy_id}`;
//        c) a legacy profile array hit when the entity's
//           `metadata.legacy_id` (or slug) matches an id the
//           player has already discovered locally (only used
//           for figures/artifacts, never to invent items).
//
//   4. Counts and "إرثٌ يكبر معك" prestige percentage are
//      computed exclusively from the Supabase-backed visible
//      lists + the unlocked-imported-registry items rendered
//      in each tab. Legacy hidden items do not count.
//
//   5. Empty categories show a friendly empty state, never
//      placeholder fake cards.
// ============================================================

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useStashOrigin } from "@/lib/navigation";
import { FeedbackCTA } from "@/components/feedback/FeedbackCTA";
import { CachedImage } from "@/components/CachedImage";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Lock, Swords, Landmark, Users, Sparkles,
  AlertTriangle, CalendarClock, Gem, ScrollText, Building2,
  Trophy, Star, Award, Compass,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CinematicPageBackdrop } from "@/components/CinematicPageBackdrop";
import museumHeaderArt from "@/assets/hero/14-andalusian-palace.jpg?url";
import { useProfile } from "@/lib/profile";

import {
  getImportedRegistryItemsByType,
  getMissingRegistryUnlockIds,
  getUnlockedRegistryIds,
  getUnlockSourcesMap,
  registryItemIcon,
  registryItemImageUrl,
  registryItemRarity,
} from "@/lib/importedUnlocks";
import { pullAllFromCloud } from "@/lib/cloudSync";

import type { ContentRegistryItem } from "@/types/contentRegistry";
import { useEncyclopediaSupabaseList } from "@/lib/encyclopedia-source";
import { useLatestMuseumAcquisitions } from "@/lib/playerDiscoveries";
import { listCampaigns } from "@/lib/campaignStorage";

import { CollectibleRevealDialog, type CollectibleRevealItem } from "@/components/CollectibleRevealDialog";
import { classifyArtifact, fetchCampaignArtifactRefSet } from "@/lib/museumVisibility";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";
import {
  RARITY_STYLE as RARITY_META,
  RARITY_ORDER,
  normalizeRarity,
  rarityFromMetadata as canonicalRarityFromMetadata,
  type ArtifactRarity as Rarity,
} from "@/lib/rarity";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "المتحف · أرشيفك التاريخي" }] }),
  component: CollectionPage,
});

type RevealItem = CollectibleRevealItem;

// ───── Museum sections ─────────────────────────────────────────
type SectionId = "figures" | "artifacts" | "landmarks" | "cities" | "battles" | "events";
type LucideGlyph = ComponentType<{ className?: string }>;
interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideGlyph;            // section pill / bar icon
  glyphIcon: LucideGlyph;       // visual glyph used inside cards & reveals
  type: string;                 // matches encyclopedia_entities.entity_type
  glyph: string;                // legacy emoji kept for back-compat in reveal payloads
  registryTypes?: string[];     // imported-registry types merged into this tab
}
const SECTIONS: SectionDef[] = [
  { id: "figures",   label: "شخصيات", icon: Users,         glyphIcon: Users,        type: "figure",   glyph: "👤", registryTypes: ["figure", "scholar"] },
  { id: "artifacts", label: "آثار",   icon: Gem,           glyphIcon: Gem,          type: "artifact", glyph: "🏺", registryTypes: ["artifact"] },
  { id: "landmarks", label: "معالم",  icon: Landmark,      glyphIcon: Landmark,     type: "landmark", glyph: "🏛️" },
  { id: "cities",    label: "مدن",    icon: Building2,     glyphIcon: Building2,    type: "city",     glyph: "🌆", registryTypes: ["city"] },
  { id: "battles",   label: "معارك",  icon: Swords,        glyphIcon: Swords,       type: "battle",   glyph: "⚔️", registryTypes: ["battle"] },
  { id: "events",    label: "أحداث",  icon: CalendarClock, glyphIcon: ScrollText,   type: "event",    glyph: "📜" },
];

// ───── Supabase user_collection hook (offline-cached) ─────────
// The rows are mirrored to localStorage so the museum still shows the
// player's unlocks after a cold restart without connectivity. On a
// successful Supabase fetch we overwrite the cache; on failure (offline,
// signed-out, etc.) we keep whatever the cache already had.
type CachedCollectionRow = { type: string; slug: string; unlockedAt: string | null };
const USER_COLLECTION_CACHE_KEY = "irth.user_collection.v1";
function readUserCollectionCache(): CachedCollectionRow[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(USER_COLLECTION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CachedCollectionRow[]) : [];
  } catch { return []; }
}
function writeUserCollectionCache(rows: CachedCollectionRow[]) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(USER_COLLECTION_CACHE_KEY, JSON.stringify(rows)); } catch {}
}

function useUserCollectionByType() {
  // Hydrate synchronously from cache so the museum is populated on the
  // very first render — required for offline cold-start.
  const [rows, setRows] = useState<CachedCollectionRow[]>(() => readUserCollectionCache());
  const [refreshTick, setRefreshTick] = useState(0);
  const disableGlobalFocusBlur = isAndroidFocusABDisabled("disableGlobalFocusBlur");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        const { data, error } = await supabase
          .from("user_collection")
          .select("item_id,item_type,unlocked_at")
          .eq("user_id", uid);
        if (cancelled || error || !data) return;
        const next: CachedCollectionRow[] = data.map((r: any) => ({
          type: r.item_type, slug: r.item_id, unlockedAt: r.unlocked_at ?? null,
        }));
        setRows(next);
        writeUserCollectionCache(next);
      } catch { /* offline / signed-out — keep cached rows */ }
    })();
    const bump = () => setRefreshTick(t => t + 1);
    if (!disableGlobalFocusBlur) window.addEventListener("focus", bump);
    return () => { cancelled = true; if (!disableGlobalFocusBlur) window.removeEventListener("focus", bump); };
  }, [refreshTick, disableGlobalFocusBlur]);
  const byType = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of rows) {
      const s = m.get(r.type) ?? new Set<string>();
      s.add(r.slug); m.set(r.type, s);
    }
    return m;
  }, [rows]);
  const unlockedAt = useMemo(() => {
    const m = new Map<string, string>(); // key `${type}:${slug}` → ISO
    for (const r of rows) if (r.unlockedAt) m.set(`${r.type}:${r.slug}`, r.unlockedAt);
    return m;
  }, [rows]);
  return { byType, unlockedAt, rows };
}



// ───── Reusable card ───────────────────────────────────────────
function Card({ unlocked, rarity, icon, title, subtitle, footer, onClick, unlockedAt }: {
  unlocked: boolean; rarity: Rarity; icon: React.ReactNode; title: string;
  subtitle: string; footer?: string; onClick: () => void; unlockedAt?: string | null;
}) {
  const meta = RARITY_META[rarity];
  const isFresh = unlocked && !!unlockedAt && (Date.now() - new Date(unlockedAt).getTime() < 24 * 60 * 60 * 1000);
  return (
    <button
      onClick={onClick}
      className={`motion-tap group relative w-full overflow-hidden rounded-2xl border text-right transition-all duration-300 hover:-translate-y-0.5
        ${unlocked
          ? `${rarity === "legendary" ? "border-gold/40" : rarity === "epic" ? "border-fuchsia-400/30" : rarity === "rare" ? "border-sky-400/30" : "border-white/10"} bg-surface ring-1 ${meta.ring} ${meta.glow} ${isFresh ? "motion-unlock-glow" : ""}`
          : "border-white/10 bg-surface/70 opacity-75"}`}
    >
      {unlocked && (
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta.frame} opacity-70`} />
      )}
      {unlocked && rarity === "legendary" && (
        <div className="pointer-events-none absolute -inset-px rounded-2xl"
          style={{ background: "radial-gradient(120% 60% at 50% -10%, oklch(0.82 0.14 82 / 0.35), transparent 60%)" }} />
      )}
      {!unlocked && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
      )}
      <div className="relative p-3">
        <div className="flex items-start justify-between gap-2">
          <div className={`relative grid size-12 place-items-center overflow-hidden rounded-xl
            ${unlocked ? "bg-black/30 ring-1 ring-gold/20" : "bg-black/50 ring-1 ring-white/5"}`}>
            {unlocked ? (
              <span className="grid size-full place-items-center [&_svg]:size-6 [&_img]:size-full text-gold">
                {icon}
              </span>
            ) : (
              <>
                <span className="grid size-full place-items-center opacity-15 blur-[2px] grayscale [&_svg]:size-6">
                  {icon}
                </span>
                <Lock className="absolute size-3.5 text-gold/70" />
              </>
            )}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide
            ${unlocked ? meta.chip : "bg-black/40 text-gold/70 ring-1 ring-gold/20"}`}>
            {unlocked ? meta.label : "غير مكتشف"}
          </span>
        </div>
        <p className={`font-display mt-2 line-clamp-1 text-sm font-bold ${unlocked ? "" : "text-foreground/70"}`}>
          {title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-[10px] text-gold/80">{subtitle}</p>
        {footer && (
          <p className="mt-1 line-clamp-2 min-h-[28px] text-[10px] leading-snug text-muted-foreground">{footer}</p>
        )}
      </div>
    </button>
  );
}

// ───── Section bar ─────────────────────────────────────────────
function SectionBar({ icon: Icon, title, done, total }: { icon: any; title: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-gold" />
          <h2 className="font-display text-sm font-bold">{title}</h2>
        </div>
        <span className="text-[10px] text-muted-foreground">{done}/{total} · {pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="bg-gradient-gold h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ───── Entity → display helpers ────────────────────────────────
function rarityFromMetadata(meta: any, fallback: Rarity): Rarity {
  return canonicalRarityFromMetadata(meta, fallback);
}
function defaultRarity(type: string): Rarity {
  // Non-artifact types keep their prior default (rarity is authored on
  // artifacts; for other entity types this is a display fallback only).
  if (type === "artifact") return "common";
  return ["figure", "landmark", "battle"].includes(type) ? "epic" : "rare";
}

// ───── Main page ───────────────────────────────────────────────
function CollectionPage() {
  const { profile } = useProfile();
  const [section, setSection] = useState<SectionId>("figures");
  const [reveal, setReveal] = useState<RevealItem | null>(null);
  const navigate = useNavigate();


  // Re-pull cloud data once on mount so newly unlocked items show up.
  const [refreshTick, setRefreshTick] = useState(0);
  const disableGlobalFocusBlur = isAndroidFocusABDisabled("disableGlobalFocusBlur");
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    pullAllFromCloud().then(() => setRefreshTick(t => t + 1)).catch(() => {});
    const bump = () => setRefreshTick(t => t + 1);
    if (!disableGlobalFocusBlur) window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      if (!disableGlobalFocusBlur) window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, [disableGlobalFocusBlur]);

  // ── Local-first entity lists (one per museum section) ───────
  const supFigures   = useEncyclopediaSupabaseList("figure");
  const supArtifacts = useEncyclopediaSupabaseList("artifact");
  const supLandmarks = useEncyclopediaSupabaseList("landmark");
  const supCities    = useEncyclopediaSupabaseList("city");
  const supBattles   = useEncyclopediaSupabaseList("battle");
  const supEvents    = useEncyclopediaSupabaseList("event");
  const supByType: Record<string, typeof supFigures> = {
    figure: supFigures, artifact: supArtifacts, landmark: supLandmarks,
    city: supCities, battle: supBattles, event: supEvents,
  };

  // ── Museum runtime visibility for artifacts ─────────────────
  // Hide legacy/demo artifacts that are not admin-imported,
  // not campaign-referenced, and not museum_enabled=true.
  // No deletes; runtime filtering only.
  const [campaignArtifactRefs, setCampaignArtifactRefs] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    fetchCampaignArtifactRefSet()
      .then(s => { if (!cancelled) setCampaignArtifactRefs(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const isArtifactVisible = (slug: string, metadata: any, legacyId?: string | null) => {
    const hasRef = campaignArtifactRefs.has(slug.toLowerCase()) ||
      (legacyId ? campaignArtifactRefs.has(String(legacyId).toLowerCase()) : false);
    return classifyArtifact(metadata, hasRef).visible;
  };

  // ── Imported registry items: museum reads encyclopedia snapshot. ───
  // Keep the shape so downstream consumers (rendering, counts)
  // continue to work without legacy registry fallback.
  const importedByType = useMemo(() => {
    const m: Record<string, Array<ContentRegistryItem & { unlocked: boolean }>> = {};
    for (const s of SECTIONS) m[s.id] = [];
    return m;
  }, []);


  // ── User collection (Supabase) ──────────────────────────────
  const userCollectionResult = useUserCollectionByType();
  const userCollection = userCollectionResult.byType;
  const userUnlockedAt = userCollectionResult.unlockedAt;

  // ── Imported registry unlocks (raw "type:slug" strings) ─────
  // ── Imported registry unlocks: no legacy fallback shown to players ──
  const importedUnlockSet = useMemo(() => new Set<string>(), []);

  const unlockSources = useMemo(() => getUnlockSourcesMap(), [refreshTick]);

  // ── Campaign-title lookup for source label ──────────────────
  const campaignTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of listCampaigns()) m.set(c.id, c.title);
    if (!m.has("prophetic-mission")) m.set("prophetic-mission", "البعثة النبوية");
    return m;
  }, [refreshTick]);
  const sourceLabelFor = (rawId: string): string => {
    const cid = unlockSources.get(rawId);
    if (!cid) return "من الموسوعة";
    const title = campaignTitleById.get(cid);
    return title ? `من حملة ${title}` : "من الموسوعة";
  };

  // ── Per-entity unlock check ─────────────────────────────────
  function isEntityUnlocked(type: string, slug: string, metadata: any): boolean {
    if (userCollection.get(type)?.has(slug)) return true;
    if (importedUnlockSet.has(`${type}:${slug}`)) return true;
    const legacyId = (metadata?.legacy_id as string | undefined) ?? null;
    if (legacyId && userCollection.get(type)?.has(legacyId)) return true;
    if (legacyId && importedUnlockSet.has(`${type}:${legacyId}`)) return true;
    // Aliases declared on the canonical entity (e.g. landmark with artifact alias).
    const aliases: string[] = Array.isArray(metadata?.aliases) ? metadata.aliases : [];
    for (const a of aliases) {
      if (userCollection.get(type)?.has(a)) return true;
      if (importedUnlockSet.has(a)) return true;
      const [at, ...rest] = a.split(":");
      const aSlug = rest.join(":") || at;
      if (at && aSlug && userCollection.get(at)?.has(aSlug)) return true;
    }
    if (type === "figure" && (profile.charactersUnlocked.includes(slug) || (legacyId && profile.charactersUnlocked.includes(legacyId)))) return true;
    if (type === "artifact" && (profile.artifactsFound.includes(slug) || (legacyId && profile.artifactsFound.includes(legacyId)))) return true;
    return false;
  }

  // Resolve the most recent unlock timestamp across direct + alias matches.
  function unlockedAtFor(type: string, slug: string, metadata: any): number {
    const candidates: string[] = [`${type}:${slug}`];
    const legacyId = (metadata?.legacy_id as string | undefined) ?? null;
    if (legacyId) candidates.push(`${type}:${legacyId}`);
    const aliases: string[] = Array.isArray(metadata?.aliases) ? metadata.aliases : [];
    for (const a of aliases) {
      candidates.push(a);
      candidates.push(`${type}:${a}`);
    }
    let best = 0;
    for (const k of candidates) {
      const v = userUnlockedAt.get(k);
      if (v) {
        const t = Date.parse(v);
        if (Number.isFinite(t) && t > best) best = t;
      }
    }
    return best;
  }


  // ── Build per-section counts ────────────────────────────────
  const sectionStats = useMemo(() => {
    const out: Record<SectionId, { done: number; total: number }> = {} as any;
    for (const s of SECTIONS) {
      let entities = supByType[s.type].data ?? [];
      if (s.type === "artifact") {
        entities = entities.filter((e: any) =>
          isArtifactVisible(e.slug, e.metadata, e.metadata?.legacy_id),
        );
      }
      const entityDone = entities.filter(e => isEntityUnlocked(s.type, e.slug, e.metadata)).length;
      const imported   = importedByType[s.id] ?? [];
      const importedDone = imported.filter(i => i.unlocked).length;
      out[s.id] = {
        done:  entityDone + importedDone,
        total: entities.length + imported.length,
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supFigures.data, supArtifacts.data, supLandmarks.data, supCities.data, supBattles.data, supEvents.data, importedByType, userCollection, importedUnlockSet, profile, campaignArtifactRefs]);

  const totalDone = Object.values(sectionStats).reduce((s, c) => s + c.done, 0);
  const totalAll  = Object.values(sectionStats).reduce((s, c) => s + c.total, 0);
  const prestige  = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;

  // ── Missing-registry warning (canonical resolver) ────────────
  // Build pool of all loaded enabled entities across the 6 museum types,
  // plus state. We treat a raw id as resolved when it maps to ANY entity
  // by (type+slug), bare slug across types, or metadata.aliases.
  const allLoadedEntities = useMemo(() => {
    return [
      ...(supFigures.data ?? []),
      ...(supArtifacts.data ?? []),
      ...(supLandmarks.data ?? []),
      ...(supCities.data ?? []),
      ...(supBattles.data ?? []),
      ...(supEvents.data ?? []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supFigures.data, supArtifacts.data, supLandmarks.data, supCities.data, supBattles.data, supEvents.data]);

  const rawMissingUnlockIds = useMemo(() => getMissingRegistryUnlockIds(), [refreshTick]);
  const missingUnlockIds = useMemo(() => {
    return rawMissingUnlockIds.filter(raw => {
      const trimmed = (raw ?? "").trim();
      if (!trimmed) return false;
      const [t, ...rest] = trimmed.split(":");
      const slug = (rest.join(":") || t).toLowerCase();
      for (const e of allLoadedEntities) {
        const meta = (e.metadata as any) ?? {};
        if (e.slug === slug) return false;
        if (meta.legacy_id === slug) return false;
        const aliases: string[] = Array.isArray(meta.aliases) ? meta.aliases : [];
        if (aliases.includes(trimmed) || aliases.includes(slug)) return false;
      }
      return true;
    });
  }, [rawMissingUnlockIds, allLoadedEntities]);

  useEffect(() => {
    if (missingUnlockIds.length > 0 && typeof console !== "undefined") {
      console.warn(
        "[museum] unresolved unlock ids (hidden from players):",
        missingUnlockIds,
      );
    }
  }, [missingUnlockIds]);


  // ── Render section ──────────────────────────────────────────
  const current = SECTIONS.find(s => s.id === section)!;
  const rawCurrentEntities = supByType[current.type].data ?? [];
  const rawCurrentImported = importedByType[current.id] ?? [];
  const currentLoading  = supByType[current.type].isLoading;
  const stats = sectionStats[current.id];

  // Hide cards with no resolved Arabic title (no English slugs in public UI).
  const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
  const currentEntities = useMemo(() => {
    // Museum shows ONLY items the player has actually unlocked through
    // gameplay/rewards. Encyclopedia remains the place to browse the rest.
    const items = rawCurrentEntities
      .filter((e: any) => !!e.title && hasArabic(e.title))
      .filter((e: any) =>
        current.type !== "artifact"
          ? true
          : isArtifactVisible(e.slug, e.metadata, e.metadata?.legacy_id),
      )
      .map((e: any) => {
        const open = isEntityUnlocked(current.type, e.slug, e.metadata);
        const ts = open ? unlockedAtFor(current.type, e.slug, e.metadata) : 0;
        return { e, open, ts };
      })
      .filter(({ open }) => open);
    items.sort((a, b) => {
      if (a.ts !== b.ts) return b.ts - a.ts;
      return (a.e.title ?? "").localeCompare(b.e.title ?? "", "ar");
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCurrentEntities, userCollection, userUnlockedAt, importedUnlockSet, profile, current.type, campaignArtifactRefs]);

  const currentImported = useMemo(() => {
    return rawCurrentImported
      .filter(i => !!i.name && hasArabic(i.name) && i.unlocked)
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ar"));
  }, [rawCurrentImported]);

  const openEntityReveal = (e: any, isOpen: boolean) => {
    const rarity = rarityFromMetadata(e.metadata, defaultRarity(current.type));
    const raw = `${current.type}:${e.slug}`;
    const GlyphIcon = current.glyphIcon;
    const revealIcon = <GlyphIcon className="size-10 text-gold" />;
    if (!isOpen) {
      const sourceCid = unlockSources.get(raw);
      const sourceTitle = sourceCid ? campaignTitleById.get(sourceCid) : undefined;
      setReveal({
        rarity,
        icon: revealIcon,
        title: e.title ?? "مقتنى غامض",
        subtitle: current.label,
        lines: [],
        locked: true,
        lockedHint: sourceTitle
          ? `ينفتح عند إكمال: ${sourceTitle}`
          : "تابع رحلتك في الحملات لاكتشاف هذا المقتنى.",
      });
      return;
    }
    setReveal({
      rarity,
      icon: revealIcon,
      title: e.title ?? e.slug,
      subtitle: e.subtitle ?? current.label,
      lines: e.summary ? [e.summary] : ["عنصر من الموسوعة. افتحه لقراءة تفاصيله الكاملة."],
      sourceLabel: sourceLabelFor(raw),
      alreadyOwned: true,
      onOpenEncyclopedia: () => navigate({ to: "/encyclopedia/entity/$id", params: { id: e.slug } }),
    });
  };

  // ── Hero stats: rarity tally + latest unlock across all sections ──
  const heroStats = useMemo(() => {
    const tally: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let latest: { title: string; section: SectionDef; ts: number } | null = null;
    for (const s of SECTIONS) {
      const list = supByType[s.type].data ?? [];
      for (const e of list) {
        const meta = (e.metadata as any) ?? {};
        if (s.type === "artifact" && !isArtifactVisible(e.slug, meta, meta.legacy_id)) continue;
        if (!isEntityUnlocked(s.type, e.slug, e.metadata)) continue;
        const r = rarityFromMetadata(e.metadata, defaultRarity(s.type));
        tally[r] += 1;
        const ts = unlockedAtFor(s.type, e.slug, e.metadata);
        if (ts && (!latest || ts > latest.ts) && e.title && /[\u0600-\u06FF]/.test(e.title)) {
          latest = { title: e.title, section: s, ts };
        }
      }
    }
    return { tally, latest };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supFigures.data, supArtifacts.data, supLandmarks.data, supCities.data, supBattles.data, supEvents.data, userCollection, userUnlockedAt, importedUnlockSet, profile, campaignArtifactRefs]);

  return (
    <AppShell>
      <CinematicPageBackdrop image={museumHeaderArt} alt="قاعة متحف تاريخي" />
      <div className="px-5 pt-6">

        <Breadcrumbs
          items={[
            { label: "الرئيسية", to: "/" },
            { label: "المتحف" },
          ]}
        />
      </div>
      <Screen title="المتحف">
        {/* ── Cinematic Museum Hero ───────────────────────────── */}
        <div className="relative mb-5 overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-[oklch(0.18_0.04_70)] via-surface to-background p-5 shadow-gold">
          {/* Arabesque + warm lighting layers */}
          <div className="pointer-events-none absolute inset-0 opacity-60" style={{
            backgroundImage:
              "radial-gradient(circle at 15% 0%, oklch(0.82 0.14 82 / 0.35), transparent 45%)," +
              "radial-gradient(circle at 90% 100%, oklch(0.82 0.14 82 / 0.22), transparent 50%)",
          }} />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, oklch(0.82 0.14 82 / 0.6) 0 1px, transparent 1px 14px)," +
              "repeating-linear-gradient(-45deg, oklch(0.82 0.14 82 / 0.5) 0 1px, transparent 1px 14px)",
          }} />
          <div className="pointer-events-none absolute -top-10 left-1/2 size-40 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />

          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] tracking-[0.25em] text-gold/85">
                  <Trophy className="size-3" /> أرشيفك التاريخي
                </p>
                <h1 className="font-display shimmer-text mt-1 text-2xl font-extrabold">المتحف الخاص بك</h1>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  كلّ قطعةٍ مكتشفة تُضيف فصلًا لمتحفك الخاص.
                </p>
              </div>
              <div className="shrink-0 text-center">
                <p className="font-display text-4xl font-extrabold text-gold drop-shadow-[0_2px_10px_oklch(0.82_0.14_82/45%)]">{prestige}%</p>
                <p className="text-[10px] text-muted-foreground">اكتمال المتحف</p>
              </div>
            </div>

            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-gold/20">
              <div className="bg-gradient-gold h-full rounded-full transition-all duration-700" style={{ width: `${prestige}%` }} />
            </div>

            {/* Stats grid */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-gold/15 bg-black/30 p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-gold">{totalDone}</p>
                <p className="text-[9px] tracking-wider text-muted-foreground">مقتنيات</p>
              </div>
              <div className="rounded-xl border border-gold/15 bg-black/30 p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-gold">{totalAll - totalDone}</p>
                <p className="text-[9px] tracking-wider text-muted-foreground">بانتظار الاكتشاف</p>
              </div>
              <div className="rounded-xl border border-gold/15 bg-black/30 p-2.5 text-center">
                <p className="font-display text-lg font-extrabold text-gold">{SECTIONS.length}</p>
                <p className="text-[9px] tracking-wider text-muted-foreground">قاعات عرض</p>
              </div>
            </div>

            {/* Rarity tally */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(["legendary", "epic", "rare", "common"] as Rarity[]).map(r => (
                <span key={r} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${RARITY_META[r].chip}`}>
                  {r === "legendary" ? <Star className="size-3" /> :
                   r === "epic"      ? <Award className="size-3" /> :
                   r === "rare"      ? <Sparkles className="size-3" /> :
                                       <Compass className="size-3" />}
                  {RARITY_META[r].label} · {heroStats.tally[r]}
                </span>
              ))}
            </div>

            {/* Latest unlock */}
            {heroStats.latest && (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-l from-gold/15 via-surface to-transparent p-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-black/40 ring-1 ring-gold/40">
                  {(() => { const I = heroStats.latest.section.glyphIcon; return <I className="size-5 text-gold" />; })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] tracking-[0.2em] text-gold/80">آخر مقتنى</p>
                  <p className="truncate font-display text-sm font-bold">{heroStats.latest.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{heroStats.latest.section.label}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent unlocks — "آخر المقتنيات" */}
        <RecentUnlocks />

        {/* Broken unlock references are never shown to players.
            They are silently logged for admins via the integrity audit
            route at /admin/unlock-integrity. */}
        {missingUnlockIds.length > 0 && import.meta.env.DEV && (
          <div className="mb-3 hidden">{missingUnlockIds.join(",")}</div>
        )}

        {/* Exhibition Halls — section pills with progress */}
        <p className="mb-2 flex items-center gap-1.5 text-[10px] tracking-[0.25em] text-gold/80">
          <Landmark className="size-3" /> قاعات العرض
        </p>
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SECTIONS.map(s => {
            const active = section === s.id;
            const Icon = s.icon;
            const c = sectionStats[s.id];
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`relative flex shrink-0 flex-col items-start gap-1 overflow-hidden rounded-2xl border px-3 py-2 text-xs transition-all min-w-[110px]
                  ${active ? "border-gold/50 bg-gold/15 text-gold shadow-gold" : "border-white/10 bg-surface text-muted-foreground"}`}>
                <div className="flex items-center gap-1.5">
                  <Icon className="size-3.5" />
                  <span className="font-display font-bold">{s.label}</span>
                </div>
                <span className="text-[10px] opacity-70">{c.done}/{c.total} · {pct}%</span>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-black/40">
                  <div className={`h-full ${active ? "bg-gradient-gold" : "bg-gold/40"}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected section */}
        <SectionBar icon={current.icon} title={current.label} done={stats.done} total={stats.total} />

        {currentLoading && currentEntities.length === 0 && currentImported.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            جارٍ التحميل…
          </div>
        ) : currentEntities.length === 0 && currentImported.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gold/25 bg-surface/40 p-6 text-center">
            <p className="font-display text-sm font-bold text-gold">لم تكتشف عناصر في هذه الفئة بعد</p>
            <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
              تُفتح عناصر المتحف عند إكمال الحملات والتحقيقات والمكافآت. تصفّح الموسوعة الآن للاطلاع على المحتوى المتاح.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {currentEntities.map(({ e, open }) => {
              const rarity = rarityFromMetadata(e.metadata, defaultRarity(current.type));
              const GlyphIcon = current.glyphIcon;
              const ua = userUnlockedAt.get(`${current.type}:${e.slug}`) ?? null;
              return (
                <Card
                  key={`enc-${e.id ?? e.slug}`}
                  unlocked={open}
                  rarity={rarity}
                  icon={<GlyphIcon className="size-6" />}
                  title={e.title ?? e.slug}
                  subtitle={e.subtitle ?? current.label}
                  footer={e.summary?.slice(0, 80)}
                  onClick={() => openEntityReveal(e, open)}
                  unlockedAt={ua}
                />
              );
            })}

            {currentImported.map(item => (
              <ImportedCard key={`imp-${item.id}`} item={item} setReveal={setReveal} />
            ))}
          </div>
        )}

        {totalDone === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            متحفك في انتظارك. ابدأ بحملةٍ لتكشف أوّل قطعة.
          </div>
        )}
        <FeedbackCTA context={{ title: "المتحف" }} />
      </Screen>
      <CollectibleRevealDialog item={reveal} onClose={() => setReveal(null)} />
    </AppShell>

  );
}

// ============================================================
// Recent unlocks ribbon — "آخر المقتنيات"
// Only museum-style collectible types are included. Events,
// badges, achievements, and notifications are filtered out.
// State entries appear ONLY when explicitly marked
// `metadata.collectible === true` in the encyclopedia.
// ============================================================
function RecentUnlocks() {
  type Recent = { key: string; type: string; slug: string; kind: string; title: string; subtitle: string; rarity: Rarity };
  // Museum → Entity origin: rendered inside CollectionPage but needs its
  // own hook call — the earlier declaration is out of scope here.
  const stashOrigin = useStashOrigin();
  const stashEntity = (id: string) =>
    stashOrigin(`/encyclopedia/entity/${id}`, { route: "/collection" as const });


  const supaArtifacts = useEncyclopediaSupabaseList("artifact");
  const supaLandmarks = useEncyclopediaSupabaseList("landmark");
  const supaFigures   = useEncyclopediaSupabaseList("figure");
  const supaCities    = useEncyclopediaSupabaseList("city");
  const supaBattles   = useEncyclopediaSupabaseList("battle");
  const supaStates    = useEncyclopediaSupabaseList("state");

  // Museum "آخر الكنوز" consumes ONLY the canonical museum acquisitions
  // feed from playerDiscoveries.ts. Reading an entity in the encyclopedia
  // does not appear here — ownership stays distinct from discovery.
  const acquisitions = useLatestMuseumAcquisitions(30);

  const recents: Recent[] = useMemo(() => {
    const kindLabel: Record<string, string> = {
      figure: "شخصية", scholar: "شخصية", artifact: "أثر",
      battle: "معركة", city: "مدينة", landmark: "معلم", state: "دولة",
    };
    type EntShape = { slug?: string; title?: string; metadata?: { rarity?: Rarity; collectible?: boolean } };
    const lookupEntity = (t: string, slug: string): EntShape | null => {
      const probe = (m: { bySlug: Map<string, unknown> }): EntShape | null => {
        const raw = m.bySlug.get(slug.toLowerCase());
        return (raw ?? null) as EntShape | null;
      };
      if (t === "figure" || t === "scholar") return probe(supaFigures);
      if (t === "artifact") return probe(supaArtifacts);
      if (t === "landmark") return probe(supaLandmarks);
      if (t === "city")     return probe(supaCities) ?? probe(supaLandmarks);
      if (t === "battle")   return probe(supaBattles);
      if (t === "state")    return probe(supaStates);
      return null;
    };
    const list: Recent[] = [];
    for (const a of acquisitions) {
      const t = a.entityType;
      const ent = lookupEntity(t, a.slug);
      if (t === "state" && !(ent?.metadata?.collectible === true)) continue;
      const subtitleParts: string[] = [];
      if (a.subtitle) subtitleParts.push(a.subtitle);
      const r = (ent?.metadata?.rarity ?? "rare") as Rarity;
      const rarity: Rarity = (["common","rare","epic","legendary"] as Rarity[]).includes(r) ? r : "rare";
      list.push({
        key: a.key,
        type: t,
        slug: ent?.slug ?? a.slug,
        kind: kindLabel[t] ?? t,
        title: a.title,
        subtitle: subtitleParts.join(" · ") || (kindLabel[t] ?? "—"),
        rarity,
      });
      if (list.length >= 3) break;
    }
    return list;
  }, [acquisitions, supaArtifacts, supaLandmarks, supaFigures, supaCities, supaBattles, supaStates]);

  const iconFor = (t: string): LucideGlyph => {
    if (t === "figure" || t === "scholar") return Users;
    if (t === "artifact") return Gem;
    if (t === "landmark") return Landmark;
    if (t === "city") return Building2;
    if (t === "battle") return Swords;
    if (t === "state") return ScrollText;
    return Sparkles;
  };

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-gold/20 bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-gold">
          <Sparkles className="size-3.5" /> آخر الكنوز
        </div>
        {recents.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{recents.length} اكتشاف حديث</span>
        )}
      </div>
      {recents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-background/30 p-4 text-center text-[11px] text-muted-foreground">
          لا توجد مقتنيات بعد — ابدأ حملةً ليبدأ متحفك في النمو.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {recents.map((r) => {
            const Icon = iconFor(r.type);
            const meta = RARITY_META[r.rarity];
            return (
              <Link
                key={r.key}
                to="/encyclopedia/entity/$id"
                params={{ id: r.slug }}
                onClick={() => stashEntity(r.slug)}
                className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-gradient-to-bl from-gold/10 via-surface to-transparent p-3 transition hover:border-gold/60
                  ${r.rarity === "legendary" ? "border-gold/40 " + meta.glow :
                    r.rarity === "epic"      ? "border-fuchsia-400/30" :
                    r.rarity === "rare"      ? "border-sky-400/30" :
                                               "border-gold/20"}`}>
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-bl ${meta.frame} opacity-50`} />
                <div className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-black/40 ring-1 ring-gold/30">
                  <Icon className="size-6 text-gold" />
                </div>
                <div className="relative min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[9px] tracking-widest text-gold/80">{r.kind}</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${meta.chip}`}>{meta.label}</span>
                  </div>
                  <p className="mt-0.5 truncate font-display text-[13px] font-bold">{r.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{r.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Imported-registry card (real admin-imported content)
// ============================================================
function ImportedCard({
  item,
  setReveal,
}: {
  item: ContentRegistryItem & { unlocked: boolean };
  setReveal: (r: RevealItem | null) => void;
}) {
  const rarity = registryItemRarity(item);
  const emoji = registryItemIcon(item);
  const imageUrl = registryItemImageUrl(item);

  const cardIcon: React.ReactNode = imageUrl ? (
    <CachedImage
      src={imageUrl}
      alt={item.name}
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
      fallback={<span aria-hidden>{emoji}</span>}
    />
  ) : (
    <span aria-hidden>{emoji}</span>
  );
  const revealIcon: React.ReactNode = imageUrl ? (
    <CachedImage src={imageUrl} alt={item.name} className="size-full rounded-2xl object-cover" fallback={<span aria-hidden>{emoji}</span>} />
  ) : (
    <span aria-hidden>{emoji}</span>
  );

  const subtitle = item.subtitle ?? item.historicalPeriod ?? item.category ?? "مستورد";
  const footer = item.description?.slice(0, 80);
  return (
    <Card
      unlocked={item.unlocked}
      rarity={rarity as Rarity}
      icon={cardIcon}
      title={item.unlocked ? item.name : (item.name || "مقتنى غامض")}
      subtitle={subtitle}
      footer={item.unlocked ? footer : undefined}
      onClick={() => {
        if (!item.unlocked) {
          setReveal({
            rarity: rarity as Rarity,
            icon: revealIcon,
            title: item.name || "مقتنى غامض",
            subtitle,
            lines: [],
            locked: true,
            lockedHint: "تابع رحلتك في الحملات لاكتشاف هذا المقتنى.",
          });
          return;
        }
        setReveal({
          rarity: rarity as Rarity,
          icon: revealIcon,
          title: item.name,
          subtitle,
          lines: [
            item.description ?? "عنصرٌ مستورد من حملةٍ إدارية.",
            ...(item.historicalPeriod ? [`الحقبة: ${item.historicalPeriod}`] : []),
          ],
          alreadyOwned: true,
        });
      }}
    />
  );
}

