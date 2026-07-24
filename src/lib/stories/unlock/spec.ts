// ============================================================
// Stories M3 — Unlock Spec v2 (FROZEN CONTRACT)
// ------------------------------------------------------------
// Frozen envelope:   { version: 2, expr: <Node> }
// Frozen logical:    all / any (child field "of"), not (child field "child")
// Frozen leaves:     always, campaign_complete, campaign_chapter_complete,
//                    investigation_complete, entity_discovered,
//                    entities_discovered, artifact_owned,
//                    atlas_location_visited, achievement_unlocked,
//                    player_level, story_complete, date_window
// Any deviation → fail closed.
// ============================================================

export const UNLOCK_SPEC_VERSION = 2 as const;

/** Structural safety bounds. Enforced by validator + evaluator. */
export const UNLOCK_LIMITS = {
  MAX_DEPTH: 6,
  MAX_NODES: 64,
} as const;

/** Every legal node type. Anything else → fail closed. */
export const UNLOCK_NODE_TYPES = [
  // logical
  "all",
  "any",
  "not",
  // leaves
  "always",
  "campaign_complete",
  "campaign_chapter_complete",
  "investigation_complete",
  "entity_discovered",
  "entities_discovered",
  "artifact_owned",
  "atlas_location_visited",
  "achievement_unlocked",
  "player_level",
  "story_complete",
  "date_window",
] as const;

export type UnlockNodeType = (typeof UNLOCK_NODE_TYPES)[number];

/** Discriminated union of every legal node in the frozen contract. */
export type UnlockNode =
  // logical
  | { type: "all"; of: UnlockNode[] }
  | { type: "any"; of: UnlockNode[] }
  | { type: "not"; child: UnlockNode }
  // leaves
  | { type: "always" }
  | { type: "campaign_complete"; campaign_id: string }
  | { type: "campaign_chapter_complete"; campaign_id: string; chapter_id: string }
  | { type: "investigation_complete"; investigation_id: string }
  | { type: "entity_discovered"; entity_id: string }
  | { type: "entities_discovered"; ids: string[]; min: number }
  | { type: "artifact_owned"; artifact_id: string }
  | { type: "atlas_location_visited"; location_id: string }
  | { type: "achievement_unlocked"; achievement_id: string }
  | { type: "player_level"; min: number }
  | { type: "story_complete"; story_id: string }
  | { type: "date_window"; start?: string; end?: string };

export interface UnlockSpecV2 {
  version: 2;
  expr: UnlockNode;
}

/** Evaluator inputs — every set is authoritative and pre-materialised. */
export interface UnlockContext {
  completed_story_ids: ReadonlySet<string>;
  completed_campaign_ids: ReadonlySet<string>;
  completed_campaign_chapter_keys: ReadonlySet<string>; // key = `${campaign_id}::${chapter_id}`
  completed_investigation_ids: ReadonlySet<string>;
  discovered_entity_ids: ReadonlySet<string>;
  owned_artifact_ids: ReadonlySet<string>;
  visited_atlas_location_ids: ReadonlySet<string>;
  unlocked_achievement_ids: ReadonlySet<string>;
  player_level: number;
  /** ISO timestamp (UTC) evaluated against date_window. Defaults to now. */
  now?: string;
}

/** Validation error codes returned by `validateUnlockSpec`. */
export type UnlockValidationCode =
  | "not_an_object"
  | "wrong_version"
  | "missing_expr"
  | "not_an_object_node"
  | "missing_type"
  | "unknown_type"
  | "missing_of"
  | "of_not_array"
  | "empty_of_forbidden"
  | "missing_child"
  | "missing_id_field"
  | "id_not_string"
  | "id_empty"
  | "ids_not_array"
  | "ids_empty"
  | "ids_item_not_string"
  | "min_not_integer"
  | "min_out_of_range"
  | "date_window_empty"
  | "date_not_string"
  | "depth_exceeded"
  | "node_count_exceeded"
  | "extra_fields";

export interface UnlockValidationError {
  code: UnlockValidationCode;
  path: string; // dotted path from root, e.g. "$.expr.of[1].story_id"
  message: string;
}

export interface UnlockValidationResult {
  ok: boolean;
  errors: UnlockValidationError[];
  nodeCount: number;
  depth: number;
}

/** Deterministic "always" spec — used as the safe default. */
export const ALWAYS_SPEC: UnlockSpecV2 = { version: 2, expr: { type: "always" } };

/**
 * Fail-closed sentinel: not part of the frozen leaf vocabulary, so we
 * express "never" as an empty disjunction, which evaluates to false and
 * still validates structurally (any-of with one child that itself is
 * false). We use `not(always)` — the frozen vocabulary supports this.
 */
export const NEVER_SPEC: UnlockSpecV2 = {
  version: 2,
  expr: { type: "not", child: { type: "always" } },
};
