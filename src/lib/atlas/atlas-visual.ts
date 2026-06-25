// Phase 3 — Atlas entity → world derivation + visual kind colors.
//
// The Atlas does NOT store world membership directly. Each entity carries an
// `era` tag (canonical, e.g. "ottoman"); the world it belongs to is derived
// from that. This keeps `encyclopedia_entities` as the single source of
// truth for content while the Atlas remains a pure visualization layer.
import type { AtlasEntityKind, AtlasEntityRow } from "@/lib/atlas-entities";
import { WORLD_HUBS, WORLD_ERA } from "@/lib/worlds";

/** era id → world hub slug. Reverse of WORLD_ERA. */
export const ERA_TO_WORLD: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [world, era] of Object.entries(WORLD_ERA)) out[era] = world;
  return out;
})();

export function worldForEntity(e: { era: string | null }): string | null {
  if (!e.era) return null;
  return ERA_TO_WORLD[e.era] ?? null;
}

/** Stable color per atlas-entity kind. Used by pins AND the legend. */
export const KIND_COLOR: Record<AtlasEntityKind, string> = {
  place:          "oklch(0.62 0.18 30)",   // terracotta
  battle:         "oklch(0.58 0.22 18)",   // crimson
  event:          "oklch(0.70 0.16 75)",   // amber
  figure_marker:  "oklch(0.66 0.16 285)",  // violet
  artifact_site:  "oklch(0.68 0.14 165)",  // teal
  region:         "oklch(0.55 0.10 250)",  // slate-indigo
  route_point:    "oklch(0.72 0.12 110)",  // olive
};

export function worldFacets(entities: AtlasEntityRow[]) {
  const counts = new Map<string, number>();
  for (const e of entities) {
    const w = worldForEntity(e);
    if (!w) continue;
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
