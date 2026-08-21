// ============================================================
// Timeline Journey — رحلة عبر الزمن
//
// Single source of truth: encyclopedia_entities (Supabase live,
// offline snapshot fallback). Atlas/campaign linkage is layered
// on top from atlas_entities + entity metadata.
//
// Ordering chain (deterministic, never created_at):
//   1. timeline_order
//   2. metadata.chronological_order
//   3. metadata.sort_year
//   4. timeline_start_year / metadata.start_year
//   5. timeline_year / parsed metadata.period
// ============================================================
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCollection } from "@/lib/offline-snapshot";
import { ensureLocalSnapshotLoaded, localAtlasEntities } from "@/lib/local-first-store";

export type EraId =
  | "pre_islam" | "prophetic" | "rashidun" | "umayyad" | "abbasid"
  | "andalus" | "seljuk" | "zengid" | "ayyubid" | "mamluk" | "ottoman";

export type EraDef = {
  id: EraId;
  label: string;
  startCE: number;
  endCE: number;
  /** One-line poetic description shown in the era hero band. */
  description: string;
  /** Tailwind gradient for era accent band. */
  accent: string;
  /** Strings that may appear in metadata.era / metadata.bridges.era. */
  aliases: string[];
};

export const ERAS: EraDef[] = [
  { id: "pre_islam", label: "ما قبل الإسلام", startCE: -3000, endCE: 610,
    description: "ممالك العرب وحضارات الجزيرة قبل البعثة.",
    accent: "from-amber-300/25 via-amber-500/10 to-transparent",
    aliases: ["pre-islam", "preislam", "jahiliyya", "pre_islamic"] },
  { id: "prophetic", label: "العصر النبوي", startCE: 610, endCE: 632,
    description: "نزول الوحي وبناء الأمة في مكة والمدينة.",
    accent: "from-emerald-300/25 via-emerald-500/10 to-transparent",
    aliases: ["prophetic", "seerah", "nabawi"] },
  { id: "rashidun", label: "الخلافة الراشدة", startCE: 632, endCE: 661,
    description: "خلفاء الهداية وفتوحات الأرض الأولى.",
    accent: "from-yellow-300/25 via-yellow-500/10 to-transparent",
    aliases: ["rashidun", "rashidoon"] },
  { id: "umayyad", label: "الدولة الأموية", startCE: 661, endCE: 750,
    description: "أمّةٌ تمتد من السند إلى الأندلس.",
    accent: "from-sky-300/25 via-sky-500/10 to-transparent",
    aliases: ["umayyad", "umayyads"] },
  { id: "abbasid", label: "الدولة العباسية", startCE: 750, endCE: 1258,
    description: "بغداد، والعلم، والعصر الذهبي.",
    accent: "from-rose-300/25 via-rose-500/10 to-transparent",
    aliases: ["abbasid", "abbasids"] },
  { id: "andalus", label: "الأندلس", startCE: 711, endCE: 1492,
    description: "قرطبة وغرناطة: علمٌ وعمران ونور.",
    accent: "from-orange-300/25 via-orange-500/10 to-transparent",
    aliases: ["andalus", "al-andalus", "andalusi"] },
  { id: "seljuk", label: "الدولة السلجوقية", startCE: 1037, endCE: 1194,
    description: "حُماةُ الخلافة في وجه الفرنجة والباطنية.",
    accent: "from-indigo-300/25 via-indigo-500/10 to-transparent",
    aliases: ["seljuk", "seljuks", "seljuq"] },
  { id: "zengid", label: "الدولة الزنكية", startCE: 1127, endCE: 1250,
    description: "نور الدين وتوحيد الشام لمقارعة الصليبيين.",
    accent: "from-teal-300/25 via-teal-500/10 to-transparent",
    aliases: ["zengid", "zengids", "zankid"] },
  { id: "ayyubid", label: "الدولة الأيوبية", startCE: 1171, endCE: 1260,
    description: "صلاح الدين وتحرير القدس.",
    accent: "from-lime-300/25 via-lime-500/10 to-transparent",
    aliases: ["ayyubid", "ayyubids"] },
  { id: "mamluk", label: "دولة المماليك", startCE: 1250, endCE: 1517,
    description: "كاسرو المغول وحُماةُ الحرمين.",
    accent: "from-fuchsia-300/25 via-fuchsia-500/10 to-transparent",
    aliases: ["mamluk", "mamluks", "mamluke"] },
  { id: "ottoman", label: "الدولة العثمانية", startCE: 1299, endCE: 1924,
    description: "خلافةُ ستة قرون من الأناضول إلى القسطنطينية.",
    accent: "from-cyan-300/25 via-cyan-500/10 to-transparent",
    aliases: ["ottoman", "ottomans", "uthmani"] },
];

const ERA_BY_ALIAS = new Map<string, EraId>();
for (const e of ERAS) for (const a of e.aliases) ERA_BY_ALIAS.set(a.toLowerCase(), e.id);

type RawEntity = {
  id: string;
  entity_type: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  metadata: any;
  enabled?: boolean;
  timeline_order?: number | null;
  timeline_year?: number | null;
  timeline_start_year?: number | null;
  timeline_end_year?: number | null;
};

export type JourneyEntry = {
  id: string;
  slug: string;
  entityType: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  era: EraId;
  year: number | null;          // normalized Gregorian for sorting
  yearLabel: string;            // human display, e.g. "23 هـ / 644 م"
  isMajor: boolean;
  hasAtlas: boolean;
  campaignSlug: string | null;
  worldSlug: string | null;
  imageUrl: string | null;
};

const TIMELINE_TYPES = new Set([
  "event", "battle", "state", "city", "figure", "landmark", "artifact",
]);

function metaNum(meta: any, key: string): number | null {
  const v = meta?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const m = v.match(/-?\d{1,4}/);
    if (m) {
      const n2 = Number(m[0]);
      if (Number.isFinite(n2)) return n2;
    }
  }
  return null;
}

/** Convert any year-ish value to a Gregorian CE year for sorting/display. */
function toCE(y: number | null | undefined): number | null {
  if (typeof y !== "number" || !Number.isFinite(y)) return null;
  // Values <= 622 are almost certainly Hijri; convert with the standard offset.
  if (y > 0 && y <= 700) return Math.round(y * 0.970224 + 622);
  return Math.round(y);
}

function pickYearCE(r: RawEntity): number | null {
  const m = (r.metadata && typeof r.metadata === "object") ? r.metadata : {};
  // Prefer explicit Gregorian fields when present.
  const ce =
    metaNum(m, "year_ce") ??
    metaNum(m, "gregorian_year") ??
    metaNum(m, "year_g");
  if (ce != null) return Math.round(ce);
  return (
    toCE(r.timeline_year ?? null) ??
    toCE(r.timeline_start_year ?? null) ??
    toCE(metaNum(m, "year")) ??
    toCE(metaNum(m, "sort_year")) ??
    toCE(metaNum(m, "start_year"))
  );
}

function orderKey(r: RawEntity): number {
  if (typeof r.timeline_order === "number" && r.timeline_order !== 0) return r.timeline_order;
  const m = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  const chrono = metaNum(m, "chronological_order");
  if (chrono != null) return 1000 + chrono;
  const yCE = pickYearCE(r);
  if (yCE != null) return 1_000_000 + yCE;
  return Number.POSITIVE_INFINITY;
}

function eraOf(r: RawEntity, yearCE: number | null): EraId | null {
  const m = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  const candidates = [m.era, m.bridges?.era, m.world, m.worldSlug, m.world_slug];
  for (const c of candidates) {
    if (typeof c === "string") {
      const hit = ERA_BY_ALIAS.get(c.toLowerCase());
      if (hit) return hit;
    }
  }
  if (yearCE == null) return null;
  // Year-based fallback. Sequence preserves "main" eras; Andalus/Seljuk/
  // Zengid/Ayyubid require explicit metadata to override.
  if (yearCE < 610) return "pre_islam";
  if (yearCE < 632) return "prophetic";
  if (yearCE < 661) return "rashidun";
  if (yearCE < 750) return "umayyad";
  if (yearCE < 1258) return "abbasid";
  if (yearCE < 1517) return "mamluk";
  return "ottoman";
}

function yearLabel(r: RawEntity, yearCE: number | null): string {
  const m = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
  if (typeof m.period === "string" && m.period.trim()) return m.period.trim();
  const ty = r.timeline_year;
  const ts = r.timeline_start_year;
  const te = r.timeline_end_year;
  if (typeof ts === "number" && typeof te === "number") {
    const sCE = toCE(ts), eCE = toCE(te);
    if (sCE != null && eCE != null) return `${sCE} – ${eCE} م`;
  }
  if (typeof ty === "number" && ty <= 700 && yearCE != null) return `${ty} هـ / ${yearCE} م`;
  if (yearCE != null) return `${yearCE} م`;
  return "—";
}

const SELECT =
  "id,entity_type,slug,title,subtitle,summary,metadata,enabled," +
  "timeline_order,timeline_year,timeline_start_year,timeline_end_year";

async function fetchEntities(): Promise<RawEntity[]> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (online) {
    try {
      // Supabase caps responses at 1000 rows; paginate so the timeline
      // gets the full chronological dataset (currently ~1900+ entities)
      // instead of silently truncating the Prophetic/Abbasid/etc. eras.
      const PAGE = 1000;
      const all: RawEntity[] = [];
      for (let from = 0; ; from += PAGE) {
        const to = from + PAGE - 1;
        const { data, error } = await (supabase as any)
          .from("encyclopedia_entities")
          .select(SELECT)
          .eq("enabled", true)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) break;
        const chunk = (data as RawEntity[] | null) ?? [];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
        if (from > 50_000) break; // hard safety stop
      }
      if (all.length > 0) return all;
    } catch { /* fall through */ }
  }
  // Offline / failed: read bundled or local snapshot.
  const snap = await getCollection<RawEntity>("encyclopedia_entities");
  return (snap ?? []).filter((r) => r?.enabled !== false);
}

async function fetchAtlasIds(): Promise<Set<string>> {
  try {
    await ensureLocalSnapshotLoaded();
    const local = localAtlasEntities() as Array<{ encyclopedia_entity_id?: string | null }>;
    if (local.length > 0) {
      return new Set(local.map((r) => r.encyclopedia_entity_id).filter((id): id is string => !!id));
    }
  } catch { /* fall through */ }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new Set();
  try {
    const { data, error } = await (supabase as any)
      .from("atlas_entities")
      .select("encyclopedia_entity_id")
      .eq("status", "published")
      .not("encyclopedia_entity_id", "is", null);
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data.map((r: any) => r.encyclopedia_entity_id as string));
  } catch {
    return new Set();
  }
}

export type JourneyData = {
  entries: JourneyEntry[];
  byEra: Record<EraId, JourneyEntry[]>;
  totals: { all: number; major: number };
  noChronology: number;
};

const EMPTY_BY_ERA = (): Record<EraId, JourneyEntry[]> => {
  const o = {} as Record<EraId, JourneyEntry[]>;
  for (const e of ERAS) o[e.id] = [];
  return o;
};

export function useTimelineJourney() {
  const q = useQuery({
    queryKey: ["timeline-journey-v1"],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const [rows, atlasIds] = await Promise.all([fetchEntities(), fetchAtlasIds()]);
      return { rows, atlasIds };
    },
  });

  const data = useMemo<JourneyData>(() => {
    const out: JourneyEntry[] = [];
    let noChronology = 0;
    const rows = q.data?.rows ?? [];
    const atlasIds = q.data?.atlasIds ?? new Set<string>();
    for (const r of rows) {
      if (!TIMELINE_TYPES.has(r.entity_type)) continue;
      const yearCE = pickYearCE(r);
      const era = eraOf(r, yearCE);
      if (!era) { noChronology++; continue; }
      const m = r.metadata && typeof r.metadata === "object" ? r.metadata : {};
      const isMajor =
        m.is_major === true ||
        m.major === true ||
        r.entity_type === "state" ||
        r.entity_type === "battle" ||
        (typeof r.timeline_order === "number" && r.timeline_order > 0 && r.timeline_order < 100);
      out.push({
        id: r.id,
        slug: r.slug,
        entityType: r.entity_type,
        title: r.title,
        subtitle: r.subtitle ?? null,
        summary: r.summary ?? null,
        era,
        year: yearCE,
        yearLabel: yearLabel(r, yearCE),
        isMajor,
        hasAtlas: atlasIds.has(r.id),
        campaignSlug: typeof m.campaign_slug === "string" ? m.campaign_slug : null,
        worldSlug: typeof m.worldSlug === "string"
          ? m.worldSlug
          : typeof m.world_slug === "string"
            ? m.world_slug
            : typeof m.world === "string"
              ? m.world
              : null,
        imageUrl:
          (typeof m.hero_image === "string" && m.hero_image) ||
          (typeof m.image_url === "string" && m.image_url) ||
          (typeof m.image === "string" && m.image) ||
          (typeof m.cover === "string" && m.cover) ||
          (typeof m.cover_image === "string" && m.cover_image) ||
          (typeof m.thumbnail === "string" && m.thumbnail) ||
          null,
      });
    }
    out.sort((a, b) => {
      const ra = rows.find((x) => x.id === a.id)!;
      const rb = rows.find((x) => x.id === b.id)!;
      const ka = orderKey(ra), kb = orderKey(rb);
      if (ka !== kb) return ka - kb;
      return (a.title ?? "").localeCompare(b.title ?? "", "ar");
    });
    const byEra = EMPTY_BY_ERA();
    for (const e of out) byEra[e.era].push(e);
    return {
      entries: out,
      byEra,
      totals: { all: out.length, major: out.filter((e) => e.isMajor).length },
      noChronology,
    };
  }, [q.data]);

  return { ...data, isLoading: q.isLoading, isError: q.isError };
}
