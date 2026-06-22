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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Lock, MapPin, Crown, Swords, Landmark, Users, Sparkles,
  AlertTriangle, CalendarClock,
} from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
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
import { listCampaigns } from "@/lib/campaignStorage";

import { CollectibleRevealDialog, type CollectibleRevealItem } from "@/components/CollectibleRevealDialog";

export const Route = createFileRoute("/collection")({
  head: () => ({ meta: [{ title: "المتحف · أرشيفك التاريخي" }] }),
  component: CollectionPage,
});

// ───── Rarity presentation ─────────────────────────────────────
type Rarity = "common" | "rare" | "epic" | "legendary";
const RARITY_META: Record<Rarity, { label: string; ring: string; chip: string; glow: string }> = {
  common:    { label: "عادي",    ring: "ring-white/10",       chip: "bg-white/10 text-white/70",                glow: "" },
  rare:      { label: "نادر",    ring: "ring-sky-400/40",     chip: "bg-sky-400/15 text-sky-200",               glow: "shadow-[0_0_24px_-8px_oklch(0.78_0.14_240/35%)]" },
  epic:      { label: "ملحمي",   ring: "ring-fuchsia-400/45", chip: "bg-fuchsia-400/15 text-fuchsia-200",       glow: "shadow-[0_0_28px_-8px_oklch(0.7_0.2_320/40%)]" },
  legendary: { label: "أسطوري",  ring: "ring-gold/60",        chip: "bg-gradient-gold text-primary-foreground", glow: "shadow-gold" },
};

type RevealItem = CollectibleRevealItem;

// ───── Museum sections ─────────────────────────────────────────
type SectionId = "figures" | "artifacts" | "landmarks" | "cities" | "battles" | "events";
interface SectionDef {
  id: SectionId;
  label: string;
  icon: any;
  type: string;            // matches encyclopedia_entities.entity_type
  glyph: string;           // default emoji for locked/empty cards
  registryTypes?: string[]; // imported-registry types merged into this tab
}
const SECTIONS: SectionDef[] = [
  { id: "figures",   label: "شخصيات", icon: Users,          type: "figure",   glyph: "👤", registryTypes: ["figure", "scholar"] },
  { id: "artifacts", label: "آثار",   icon: Crown,          type: "artifact", glyph: "🏺", registryTypes: ["artifact"] },
  { id: "landmarks", label: "معالم",  icon: Landmark,       type: "landmark", glyph: "🏛️" },
  { id: "cities",    label: "مدن",    icon: MapPin,         type: "city",     glyph: "🌆", registryTypes: ["city"] },
  { id: "battles",   label: "معارك",  icon: Swords,         type: "battle",   glyph: "⚔️",  registryTypes: ["battle"] },
  { id: "events",    label: "أحداث",  icon: CalendarClock,  type: "event",    glyph: "📜" },
];

// ───── Supabase user_collection hook ───────────────────────────
function useUserCollectionByType() {
  const [rows, setRows] = useState<Array<{ type: string; slug: string; unlockedAt: string | null }>>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from("user_collection")
          .select("item_id,item_type,unlocked_at")
          .eq("user_id", uid);
        if (cancelled || error || !data) return;
        setRows(data.map((r: any) => ({ type: r.item_type, slug: r.item_id, unlockedAt: r.unlocked_at ?? null })));
      } catch { /* noop */ }
    })();
    const bump = () => setRefreshTick(t => t + 1);
    window.addEventListener("focus", bump);
    return () => { cancelled = true; window.removeEventListener("focus", bump); };
  }, [refreshTick]);
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
function Card({ unlocked, rarity, icon, title, subtitle, footer, onClick }: {
  unlocked: boolean; rarity: Rarity; icon: React.ReactNode; title: string;
  subtitle: string; footer?: string; onClick: () => void;
}) {
  const meta = RARITY_META[rarity];
  return (
    <button
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-white/10 bg-surface text-right transition-all duration-300 hover:-translate-y-0.5
        ${unlocked ? `ring-1 ${meta.ring} ${meta.glow}` : "opacity-70"}`}
    >
      {unlocked && (
        <div className={`pointer-events-none absolute inset-0 opacity-60
          ${rarity === "legendary" ? "bg-gradient-to-br from-gold/15 via-gold/0 to-transparent" :
            rarity === "epic"      ? "bg-gradient-to-br from-fuchsia-400/15 via-fuchsia-400/0 to-transparent" :
            rarity === "rare"      ? "bg-gradient-to-br from-sky-400/15 via-sky-400/0 to-transparent" :
                                     "bg-gradient-to-br from-white/5 to-transparent"}`} />
      )}
      {!unlocked && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/40" />
      )}
      <div className="relative p-3">
        <div className="flex items-start justify-between gap-2">
          <div className={`relative grid size-12 place-items-center overflow-hidden rounded-xl text-2xl
            ${unlocked ? "bg-black/30 ring-1 ring-white/10" : "bg-black/50 ring-1 ring-white/5"}`}>
            {unlocked ? icon : (
              <>
                <span className="select-none text-2xl opacity-20 blur-[3px] grayscale">{icon}</span>
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
  const r = meta?.rarity;
  return (r === "common" || r === "rare" || r === "epic" || r === "legendary") ? r : fallback;
}
function defaultRarity(type: string): Rarity {
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
  useEffect(() => {
    pullAllFromCloud().then(() => setRefreshTick(t => t + 1)).catch(() => {});
    const bump = () => setRefreshTick(t => t + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  // ── Supabase entity lists (one per museum section) ──────────
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

  // ── Imported registry items (also real content) ─────────────
  const importedByType = useMemo(() => {
    const m: Record<string, Array<ContentRegistryItem & { unlocked: boolean }>> = {};
    for (const s of SECTIONS) {
      const all: Array<ContentRegistryItem & { unlocked: boolean }> = [];
      for (const t of s.registryTypes ?? []) {
        all.push(...getImportedRegistryItemsByType(t as any));
      }
      m[s.id] = all;
    }
    return m;
  }, [refreshTick]);

  // ── User collection (Supabase) ──────────────────────────────
  const userCollectionResult = useUserCollectionByType();
  const userCollection = userCollectionResult.byType;
  const userUnlockedAt = userCollectionResult.unlockedAt;

  // ── Imported registry unlocks (raw "type:slug" strings) ─────
  const importedUnlockSet = useMemo(() => new Set(getUnlockedRegistryIds()), [refreshTick]);
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
      const entities = supByType[s.type].data ?? [];
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
  }, [supFigures.data, supArtifacts.data, supLandmarks.data, supCities.data, supBattles.data, supEvents.data, importedByType, userCollection, importedUnlockSet, profile]);

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


  // ── Render section ──────────────────────────────────────────
  const current = SECTIONS.find(s => s.id === section)!;
  const rawCurrentEntities = supByType[current.type].data ?? [];
  const rawCurrentImported = importedByType[current.id] ?? [];
  const currentLoading  = supByType[current.type].isLoading;
  const stats = sectionStats[current.id];

  // Hide cards with no resolved Arabic title (no English slugs in public UI).
  const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
  const currentEntities = useMemo(() => {
    const items = rawCurrentEntities
      .filter((e: any) => !!e.title && hasArabic(e.title))
      .map((e: any) => {
        const open = isEntityUnlocked(current.type, e.slug, e.metadata);
        const ts = open ? unlockedAtFor(current.type, e.slug, e.metadata) : 0;
        return { e, open, ts };
      });
    items.sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      if (a.open && b.open) {
        if (a.ts !== b.ts) return b.ts - a.ts;
      }
      return (a.e.title ?? "").localeCompare(b.e.title ?? "", "ar");
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCurrentEntities, userCollection, userUnlockedAt, importedUnlockSet, profile, current.type]);

  const currentImported = useMemo(() => {
    const items = rawCurrentImported.filter(i => !!i.name && hasArabic(i.name));
    items.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (a.name ?? "").localeCompare(b.name ?? "", "ar");
    });
    return items;
  }, [rawCurrentImported]);

  const openEntityReveal = (e: any, isOpen: boolean) => {
    const rarity = rarityFromMetadata(e.metadata, defaultRarity(current.type));
    const raw = `${current.type}:${e.slug}`;
    if (!isOpen) {
      // Locked: never leak summary/details. Show locked preview only.
      const sourceCid = unlockSources.get(raw);
      const sourceTitle = sourceCid ? campaignTitleById.get(sourceCid) : undefined;
      setReveal({
        rarity,
        icon: current.glyph,
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
      icon: current.glyph,
      title: e.title ?? e.slug,
      subtitle: e.subtitle ?? current.label,
      lines: e.summary ? [e.summary] : ["عنصر من الموسوعة. افتحه لقراءة تفاصيله الكاملة."],
      sourceLabel: sourceLabelFor(raw),
      alreadyOwned: true,
      onOpenEncyclopedia: () => navigate({ to: "/encyclopedia/entity/$id", params: { id: e.slug } }),
    });
  };



  return (
    <AppShell>
      <Screen title="المتحف">
        {/* Prestige header */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/15 via-gold/5 to-transparent p-4">
          <div className="pointer-events-none absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 15% 20%, oklch(0.82 0.14 82 / 0.4), transparent 35%), radial-gradient(circle at 85% 80%, oklch(0.82 0.14 82 / 0.25), transparent 40%)",
          }} />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[10px] tracking-[0.2em] text-gold/80">أرشيفك التاريخي</p>
              <h1 className="font-display shimmer-text mt-1 text-2xl font-extrabold">إرثٌ يكبر معك</h1>
              <p className="mt-1 text-[11px] text-muted-foreground">كلّ قطعةٍ مكتشفة تُضيف فصلًا لمتحفك الخاص.</p>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl font-extrabold text-gold">{prestige}%</p>
              <p className="text-[10px] text-muted-foreground">{totalDone}/{totalAll}</p>
            </div>
          </div>
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/30">
            <div className="bg-gradient-gold h-full rounded-full" style={{ width: `${prestige}%` }} />
          </div>
        </div>

        {/* Recent unlocks — "آخر المقتنيات" */}
        <RecentUnlocks />

        {missingUnlockIds.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex-1 space-y-0.5">
              {missingUnlockIds.map((mid) => (
                <p key={mid} className="font-mono text-[10px]">
                  عنصر مفتوح بلا صفحة موسوعية: <span className="font-bold">{mid}</span>
                </p>
              ))}
            </div>
          </div>
        )}


        {/* Section pills */}
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SECTIONS.map(s => {
            const active = section === s.id;
            const Icon = s.icon;
            const c = sectionStats[s.id];
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all
                  ${active ? "border-gold/50 bg-gold/15 text-gold shadow-gold" : "border-white/10 bg-surface text-muted-foreground"}`}>
                <Icon className="size-3.5" />
                <span className="font-medium">{s.label}</span>
                <span className="text-[10px] opacity-70">{c.done}/{c.total}</span>
              </button>
            );
          })}
        </div>

        {/* Selected section */}
        <SectionBar icon={current.icon} title={current.label} done={stats.done} total={stats.total} />

        {currentLoading && currentEntities.length === 0 && currentImported.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            جارٍ تحميل الموسوعة…
          </div>
        ) : currentEntities.length === 0 && currentImported.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-xs text-muted-foreground">
            لا توجد عناصر في هذه الفئة بعد
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {currentEntities.map(({ e, open }) => {
              const rarity = rarityFromMetadata(e.metadata, defaultRarity(current.type));
              return (
                <Card
                  key={`enc-${e.id ?? e.slug}`}
                  unlocked={open}
                  rarity={rarity}
                  icon={current.glyph}
                  title={e.title ?? e.slug}
                  subtitle={e.subtitle ?? current.label}
                  footer={e.summary?.slice(0, 80)}
                  onClick={() => openEntityReveal(e, open)}
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
  type Recent = { key: string; icon: string; kind: string; title: string; subtitle: string };
  const ALLOWED_TYPES = new Set(["figure", "scholar", "artifact", "landmark", "city", "battle"]);
  // state handled separately below via metadata.collectible.

  const supaArtifacts = useEncyclopediaSupabaseList("artifact");
  const supaLandmarks = useEncyclopediaSupabaseList("landmark");
  const supaFigures   = useEncyclopediaSupabaseList("figure");
  const supaCities    = useEncyclopediaSupabaseList("city");
  const supaBattles   = useEncyclopediaSupabaseList("battle");
  const supaStates    = useEncyclopediaSupabaseList("state");

  const [supaRecents, setSupaRecents] = useState<Recent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (!uid) { if (!cancelled) setSupaRecents([]); return; }
        const { data, error } = await supabase
          .from("user_collection")
          .select("item_id,item_type,unlocked_at,source_campaign_id")
          .eq("user_id", uid)
          .order("unlocked_at", { ascending: false })
          .limit(30);
        if (error || !data || cancelled) { if (!cancelled) setSupaRecents([]); return; }

        const campaigns = listCampaigns();
        const campaignTitle = (cid: string | null) => {
          if (!cid) return "";
          const c = campaigns.find(x => x.id === cid);
          if (c) return `من حملة ${c.title}`;
          if (cid === "prophetic-mission") return "من حملة البعثة النبوية";
          return "من حملة";
        };

        const kindLabel: Record<string, string> = {
          figure: "شخصية", scholar: "شخصية", artifact: "أثر",
          battle: "معركة", city: "مدينة", landmark: "معلم", state: "دولة",
        };
        const iconFor = (t: string): string => ({
          figure: "👤", scholar: "👤", artifact: "💎",
          battle: "⚔️", city: "🌆", landmark: "🏛️", state: "📜",
        } as Record<string, string>)[t] ?? "✨";

        const lookupEntity = (t: string, slug: string): any => {
          const probe = (m: { bySlug: Map<string, any> }) => m.bySlug.get(slug.toLowerCase());
          if (t === "figure" || t === "scholar") return probe(supaFigures);
          if (t === "artifact") return probe(supaArtifacts);
          if (t === "landmark") return probe(supaLandmarks);
          if (t === "city")     return probe(supaCities) ?? probe(supaLandmarks);
          if (t === "battle")   return probe(supaBattles);
          if (t === "state")    return probe(supaStates);
          return null;
        };

        const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

        const list: Recent[] = [];
        for (const row of data as any[]) {
          const t = row.item_type;
          if (!ALLOWED_TYPES.has(t) && t !== "state") continue;
          const ent = lookupEntity(t, row.item_id);
          // State requires explicit metadata.collectible === true.
          if (t === "state" && !(ent?.metadata?.collectible === true)) continue;
          const title = ent?.title ?? (hasArabic(row.item_id) ? row.item_id : null);
          if (!title) continue; // Hide unresolved English slugs.
          const subtitleParts: string[] = [];
          if (ent?.metadata?.rarity) subtitleParts.push(ent.metadata.rarity);
          const src = campaignTitle(row.source_campaign_id);
          if (src) subtitleParts.push(src);
          list.push({
            key: `sup-${t}-${row.item_id}`,
            icon: iconFor(t),
            kind: kindLabel[t] ?? t,
            title,
            subtitle: subtitleParts.join(" · ") || (kindLabel[t] ?? "—"),
          });
          if (list.length >= 3) break;
        }
        if (!cancelled) setSupaRecents(list);
      } catch {
        if (!cancelled) setSupaRecents([]);
      }
    })();
    return () => { cancelled = true; };
  }, [supaArtifacts, supaLandmarks, supaFigures, supaCities, supaBattles, supaStates]);

  const recents: Recent[] = supaRecents ?? [];

  return (
    <div className="mb-5 rounded-2xl border border-gold/20 bg-surface/70 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-gold">
          <Sparkles className="size-3.5" /> آخر المقتنيات
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
        <div className="grid grid-cols-1 gap-2">
          {recents.map((r) => (
            <div key={r.key} className="flex items-center gap-2 rounded-xl border border-gold/20 bg-gradient-to-bl from-gold/10 via-surface to-transparent p-2.5">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/40 text-lg ring-1 ring-gold/30">{r.icon}</div>
              <div className="min-w-0">
                <p className="text-[9px] tracking-widest text-gold/80">{r.kind}</p>
                <p className="truncate font-display text-[12px] font-bold">{r.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">{r.subtitle}</p>
              </div>
            </div>
          ))}
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
    <img
      src={imageUrl}
      alt={item.name}
      loading="lazy"
      className="absolute inset-0 size-full object-cover"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
  ) : (
    <span aria-hidden>{emoji}</span>
  );
  const revealIcon: React.ReactNode = imageUrl ? (
    <img src={imageUrl} alt={item.name} className="size-full rounded-2xl object-cover" />
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

