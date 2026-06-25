// Atlas Coverage — "Needs Placement" queue.
//
// New workflow: every eligible Encyclopedia entity gets an Atlas draft
// auto-created on demand (see RPC ensure_atlas_drafts_for_encyclopedia).
// The Needs Placement queue is simply the list of atlas_entities drafts
// whose APS coordinates are still NULL. Placing one UPDATES that draft
// with coords — we never auto-verify and never auto-publish.
//
// The Atlas remains a pure spatial layer: drafts only store the link to
// the encyclopedia entity (+ a non-authoritative display name copied from
// title for list rendering). No historical content is duplicated.
import { supabase } from "@/integrations/supabase/client";
import {
  updateAtlasEntity,
  type AtlasEntityKind,
  type AtlasEntityRow,
} from "@/lib/atlas-entities";

export type PlacementEligibleType = "state" | "city" | "battle" | "landmark" | "event";

export const ELIGIBLE_ENCYCLOPEDIA_TYPES: PlacementEligibleType[] = [
  "state", "city", "battle", "landmark", "event",
];

export const ELIGIBLE_TYPE_LABEL_AR: Record<PlacementEligibleType, string> = {
  state: "دولة",
  city: "مدينة",
  battle: "معركة",
  landmark: "معلم",
  event: "حدث",
};

/** atlas pin kind → human-readable encyclopedia type label fallback. */
const KIND_TO_LABEL_AR: Partial<Record<AtlasEntityKind, string>> = {
  region: "دولة",
  place: "مدينة",
  battle: "معركة",
  artifact_site: "معلم",
  event: "حدث",
};

export type NeedsPlacementRow = {
  /** atlas_entities.id — the draft being placed. */
  id: string;
  slug: string;
  kind: AtlasEntityKind;
  title: string;
  kind_label: string;
  encyclopedia_entity_id: string | null;
};

/** Every atlas_entities draft that still has no APS coordinates. */
export async function listNeedsPlacement(): Promise<NeedsPlacementRow[]> {
  const { data, error } = await supabase
    .from("atlas_entities")
    .select("id,slug,kind,name_ar,encyclopedia_entity_id")
    .or("aps_x.is.null,aps_y.is.null")
    .order("name_ar", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    kind: r.kind as AtlasEntityKind,
    title: r.name_ar,
    kind_label: KIND_TO_LABEL_AR[r.kind as AtlasEntityKind] ?? r.kind,
    encyclopedia_entity_id: r.encyclopedia_entity_id,
  }));
}

/** Bulk-create missing draft atlas rows for every eligible encyclopedia entity. */
export async function ensureAtlasDraftsForEncyclopedia(): Promise<{ inserted: number }> {
  const { data, error } = await supabase.rpc("ensure_atlas_drafts_for_encyclopedia");
  if (error) throw error;
  const inserted = ((data as any)?.inserted as number) ?? 0;
  return { inserted };
}

/** Set APS coordinates on an existing draft. No auto-verify, no auto-publish. */
export async function placeAtlasDraft(args: {
  atlasId: string;
  aps: { x: number; y: number };
}): Promise<AtlasEntityRow> {
  return updateAtlasEntity(args.atlasId, {
    aps_x: Math.round(args.aps.x),
    aps_y: Math.round(args.aps.y),
  });
}

export { updateAtlasEntity };
