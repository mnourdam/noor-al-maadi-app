// Atlas Coverage — "Needs Placement" workspace data source.
//
// Returns encyclopedia entities that are ELIGIBLE to appear on the Atlas
// but do not yet have a linked atlas_entities row. The Atlas remains a
// pure visualization layer: this helper never copies titles/summaries —
// it only surfaces (id, slug, title, type) so the admin can click-to-place.
import { supabase } from "@/integrations/supabase/client";
import {
  createAtlasEntity,
  updateAtlasEntity,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";

export type PlacementEligibleType = "state" | "city" | "battle" | "landmark" | "event";

export const ELIGIBLE_ENCYCLOPEDIA_TYPES: PlacementEligibleType[] = [
  "state",
  "city",
  "battle",
  "landmark",
  "event",
];

export const ELIGIBLE_TYPE_LABEL_AR: Record<PlacementEligibleType, string> = {
  state: "دولة",
  city: "مدينة",
  battle: "معركة",
  landmark: "معلم",
  event: "حدث",
};

/** encyclopedia entity_type → atlas pin kind. */
export const ENTITY_TYPE_TO_ATLAS_KIND: Record<PlacementEligibleType, AtlasEntityKind> = {
  state:    "region",
  city:     "place",
  battle:   "battle",
  landmark: "artifact_site",
  event:    "event",
};

export type NeedsPlacementRow = {
  id: string;            // encyclopedia_entities.id
  slug: string;
  entity_type: PlacementEligibleType;
  title: string;
  subtitle: string | null;
};

/**
 * Fetch every enabled, eligible encyclopedia entity that has no linked
 * atlas_entities row. The Atlas table stays spatial-only; no text is copied.
 */
export async function listNeedsPlacement(): Promise<NeedsPlacementRow[]> {
  // 1) Pull eligible encyclopedia rows (minimal projection).
  const { data: ency, error: e1 } = await supabase
    .from("encyclopedia_entities")
    .select("id,slug,entity_type,title,subtitle")
    .in("entity_type", ELIGIBLE_ENCYCLOPEDIA_TYPES as readonly string[])
    .eq("enabled", true)
    .limit(2000);
  if (e1) throw e1;
  if (!ency || ency.length === 0) return [];

  // 2) Pull existing atlas links so we can exclude already-placed rows.
  const { data: linked, error: e2 } = await supabase
    .from("atlas_entities")
    .select("encyclopedia_entity_id")
    .not("encyclopedia_entity_id", "is", null)
    .limit(5000);
  if (e2) throw e2;
  const linkedIds = new Set(
    (linked ?? []).map((r) => r.encyclopedia_entity_id as string).filter(Boolean),
  );

  return ency
    .filter((r) => !linkedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      entity_type: r.entity_type as PlacementEligibleType,
      title: r.title,
      subtitle: r.subtitle,
    }));
}

/**
 * Create a draft atlas_entities row at the given APS for an encyclopedia
 * entity. Slug is derived from the encyclopedia slug, suffixed if a clash
 * with an existing atlas row is detected. Atlas-side text fields are kept
 * minimal (just name_ar = title) so we never duplicate historical content.
 */
export async function placeEncyclopediaEntity(args: {
  row: NeedsPlacementRow;
  aps: { x: number; y: number };
}): Promise<AtlasEntityRow> {
  const kind = ENTITY_TYPE_TO_ATLAS_KIND[args.row.entity_type];
  let baseSlug = args.row.slug || args.row.id.slice(0, 8);
  if (!/^[a-z0-9-]+$/.test(baseSlug)) baseSlug = baseSlug.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  let slug = baseSlug;
  // Probe up to 3 alternates if needed.
  for (let i = 0; i < 4; i++) {
    const { data: clash } = await supabase
      .from("atlas_entities")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${i + 2}`;
  }
  return createAtlasEntity({
    slug,
    kind,
    name_ar: args.row.title,
    aps_x: Math.round(args.aps.x),
    aps_y: Math.round(args.aps.y),
    encyclopedia_entity_id: args.row.id,
  });
}

export { updateAtlasEntity };
