// ============================================================
// Official Irth identity mapping — Emblems only.
//
// RULE (frozen): no new icons/glyphs may be drawn for any surface.
// Every visual identity slot must reuse an emblem that already
// exists in the official Premium Emblems library.
//
// This file is the single mapping table from a domain key
// (world slug, atlas entity kind) to its official emblem id.
// ============================================================

/** عوالم إرث — one official emblem per world hub. */
export const WORLD_EMBLEM_ID: Record<string, string> = {
  prophetic: "banner_prophetic",
  rashidun: "banner_rashidun",
  umayyad: "banner_umayyad",
  andalus: "banner_andalus",
  abbasid: "banner_abbasid",
  fatimid: "crescent_medallion",
  seljuk: "banner_seljuk",
  zengid: "banner_zengid",
  "ayyubid-state": "ayyubid_eagle",
  "mamluk-sultanate": "mamluk_blazon",
  mongols: "war_bow",
  timurid: "eight_point_star",
  ottoman: "banner_ottoman",
  safavid: "persian_carpet",
};

/** Fallback keeps the identity library as the only visual source. */
export const DEFAULT_WORLD_EMBLEM_ID = "star";

export function worldEmblemId(slug: string | null | undefined): string {
  return (slug && WORLD_EMBLEM_ID[slug]) || DEFAULT_WORLD_EMBLEM_ID;
}

/**
 * Atlas entity kinds — dedicated Premium emblems for region / city / battle
 * (rendered in the same museum style as the Profile Emblems), and existing
 * library emblems for the remaining kinds. Never a new drawing in code.
 */
export const ATLAS_KIND_EMBLEM_ID: Record<string, string> = {
  region: "atlas_region",
  place: "atlas_city",
  battle: "atlas_battle",
  event: "royal_firman",
  figure_marker: "scholar",
  artifact_site: "incense_burner",
  route_point: "caravan_pack",
};

export function atlasKindEmblemId(kind: string): string {
  return ATLAS_KIND_EMBLEM_ID[kind] ?? DEFAULT_WORLD_EMBLEM_ID;
}

