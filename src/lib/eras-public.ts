// ============================================================
// PUBLIC ERA TAXONOMY — the ONLY era vocabulary allowed in any
// player-facing surface (Encyclopedia hub, every category page:
// figures / cities / battles / events / landmarks / artifacts,
// state pages, worlds, atlas facets, filters, chips, counters).
//
// Rules enforced here (single source of truth):
//   1. The public era list is exactly the officially approved Irth
//      era taxonomy (`APPROVED_ERA_SLUGS` in taxonomy-labels.ts)
//      minus the hidden slugs below. No page may define its own list.
//   2. `buyid` / `fatimid` / `safavid` are NEVER shown as a category,
//      filter, era chip, world card, or grouping — even when the value
//      exists in the data. Their entities (figures, cities, battles,
//      events, artifacts) stay fully visible; only the *classification*
//      is suppressed.
//   3. Legacy / migration era values that are not part of the official
//      taxonomy (taifa, byzantine, crusades, modern, …) resolve either
//      to their approved parent era or to `null` (no era shown).
// ============================================================

import {
  APPROVED_ERA_SLUGS,
  ERA_LABELS_AR,
  canonicalEraSlug,
  type ApprovedEra,
} from "@/lib/taxonomy-labels";

/** Taxonomies that must never surface as a category / filter / world. */
export const HIDDEN_TAXONOMY_SLUGS = new Set<string>(["buyid", "fatimid", "safavid"]);

export function isHiddenTaxonomySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return HIDDEN_TAXONOMY_SLUGS.has(slug.trim().toLowerCase().replace(/_/g, "-"));
}

/** The official player-facing era order (approved − hidden). */
export const PUBLIC_ERA_ORDER: ApprovedEra[] = APPROVED_ERA_SLUGS.filter(
  (e) => !HIDDEN_TAXONOMY_SLUGS.has(e),
) as ApprovedEra[];

const PUBLIC_ERA_SET = new Set<string>(PUBLIC_ERA_ORDER);

// Legacy / non-official era values → approved parent, or dropped (null).
const LEGACY_TO_PUBLIC: Record<string, ApprovedEra | null> = {
  taifa: "andalus",
  "taifa-kingdoms": "andalus",
  byzantine: null,
  crusades: null,
  crusader: null,
  modern: null,
  contemporary: null,
};

/**
 * Public era for any raw value. Returns `null` when the value is hidden,
 * unknown, or not part of the official taxonomy — callers must then show
 * no era chip and exclude the row from era histograms.
 */
export function toPublicEra(raw: string | null | undefined): ApprovedEra | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
  if (key in LEGACY_TO_PUBLIC) return LEGACY_TO_PUBLIC[key];
  const canonical = canonicalEraSlug(key);
  if (!canonical) return null;
  if (!PUBLIC_ERA_SET.has(canonical)) return null; // hidden (buyid/fatimid/safavid)
  return canonical;
}

export function isPublicEra(raw: string | null | undefined): boolean {
  return toPublicEra(raw) !== null;
}

/** Arabic label for a public era. Empty string when not publicly shown. */
export function publicEraLabel(raw: string | null | undefined): string {
  const e = toPublicEra(raw);
  return e ? ERA_LABELS_AR[e] : "";
}

/** Chronological sort index inside the public era order. */
export function publicEraSortIndex(raw: string | null | undefined): number {
  const e = toPublicEra(raw);
  return e ? PUBLIC_ERA_ORDER.indexOf(e) : 9999;
}

/** Ready-made option list for every player-facing era filter. */
export const PUBLIC_ERA_OPTIONS: { id: ApprovedEra; label: string }[] =
  PUBLIC_ERA_ORDER.map((id) => ({ id, label: ERA_LABELS_AR[id] }));
