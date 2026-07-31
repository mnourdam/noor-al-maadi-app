// Phase 3 — Atlas entity → world derivation + visual kind colors.
//
// The Atlas does NOT store world membership directly. Each entity carries an
// `era` tag (canonical, e.g. "ottoman"); the world it belongs to is derived
// from that. This keeps `encyclopedia_entities` as the single source of
// truth for content while the Atlas remains a pure visualization layer.
import type { AtlasEntityKind, AtlasEntityRow } from "@/lib/atlas-entities";
import { ERA_TO_WORLD } from "@/lib/worlds-progress";
import { WORLD_HUBS } from "@/lib/worlds";
import { isHiddenTaxonomySlug } from "@/lib/eras-public";

export { ERA_TO_WORLD };

export function worldForEntity(e: { era: string | null }): string | null {
  if (!e.era) return null;
  return ERA_TO_WORLD[e.era] ?? null;
}

/** Stable color per atlas-entity kind. Used by pins AND the legend. */
// Aged historical palette — muted metallic / earth tones.
// Designed to read on parchment without competing with it.
export const KIND_COLOR: Record<AtlasEntityKind, string> = {
  region:         "oklch(0.66 0.11 78)",   // aged gold — states / empires
  place:          "oklch(0.45 0.05 240)",  // iron blue — cities
  battle:         "oklch(0.42 0.14 25)",   // burgundy — battles
  event:          "oklch(0.48 0.06 60)",   // parchment brown — events
  figure_marker:  "oklch(0.42 0.08 145)",  // dark green — landmarks
  artifact_site:  "oklch(0.52 0.09 55)",   // bronze — artifacts
  route_point:    "oklch(0.36 0.11 22)",   // dark burgundy — campaigns
};

export function worldFacets(entities: AtlasEntityRow[]) {
  const counts = new Map<string, number>();
  for (const e of entities) {
    const w = worldForEntity(e);
    // Hidden classifications (buyid / fatimid / safavid) never surface as a
    // facet, world chip or grouping — their entities still render on the map.
    if (!w || isHiddenTaxonomySlug(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const orderIndex = new Map(WORLD_HUBS.map((h, i) => [h.slug, i]));
  return Array.from(counts.entries())
    .map(([id, count]) => ({
      id,
      count,
      glyph: WORLD_HUBS.find((h) => h.slug === id)?.glyph ?? "",
    }))
    .sort(
      (a, b) =>
        (orderIndex.get(a.id) ?? 99) - (orderIndex.get(b.id) ?? 99),
    );
}

/** Arabic display label per world slug (mirrors hub Arabic titles). */
export const WORLD_LABEL_AR: Record<string, string> = {
  prophetic: "العهد النبوي",
  rashidun: "الراشدة",
  umayyad: "الأمويون",
  andalus: "الأندلس",
  abbasid: "العباسيون",
  seljuk: "السلاجقة",
  zengid: "الزنكيون",
  "ayyubid-state": "الأيوبيون",
  "mamluk-sultanate": "المماليك",
  ottoman: "العثمانيون",
};

/**
 * Historical periods — broader time periods that GROUP worlds.
 * World ≠ Era. Era is the wider container; each era contains 1..N worlds.
 * "era" tag on entities still encodes world membership (legacy); the period
 * is derived from that world via WORLD_TO_PERIOD.
 */
export type HistoricalPeriodId =
  | "prophetic-era"
  | "rashidun-era"
  | "umayyad-era"
  | "islamic-golden-age"
  | "islamic-middle-ages"
  | "ottoman-era";

export const HISTORICAL_PERIODS: {
  id: HistoricalPeriodId;
  label_ar: string;
  worlds: string[];
}[] = [
  { id: "prophetic-era",       label_ar: "العهد النبوي",        worlds: ["prophetic"] },
  { id: "rashidun-era",        label_ar: "الخلافة الراشدة",     worlds: ["rashidun"] },
  { id: "umayyad-era",         label_ar: "العصر الأموي",        worlds: ["umayyad"] },
  { id: "islamic-golden-age",  label_ar: "العصر الذهبي الإسلامي", worlds: ["abbasid", "andalus"] },
  { id: "islamic-middle-ages", label_ar: "العصور الوسطى الإسلامية", worlds: ["seljuk", "zengid", "ayyubid-state", "mamluk-sultanate"] },
  { id: "ottoman-era",         label_ar: "العصر العثماني",      worlds: ["ottoman"] },
];

export const WORLD_TO_PERIOD: Record<string, HistoricalPeriodId> = (() => {
  const out: Record<string, HistoricalPeriodId> = {};
  for (const p of HISTORICAL_PERIODS) for (const w of p.worlds) out[w] = p.id;
  return out;
})();

export function periodForEntity(e: { era: string | null }): HistoricalPeriodId | null {
  const w = worldForEntity(e);
  return w ? WORLD_TO_PERIOD[w] ?? null : null;
}

/**
 * Chronological sort for Atlas rows.
 * year_start (Gregorian/Hijri unified — older = smaller) ascending; rows
 * without year fall to the end alphabetically by name_ar. Stable.
 */
export function sortAtlasEntitiesChronological(
  entities: AtlasEntityRow[],
): AtlasEntityRow[] {
  return [...entities].sort((a, b) => {
    const ay = a.year_start;
    const by = b.year_start;
    if (ay != null && by != null) {
      if (ay !== by) return ay - by;
    } else if (ay != null) {
      return -1;
    } else if (by != null) {
      return 1;
    }
    return a.name_ar.localeCompare(b.name_ar, "ar");
  });
}
