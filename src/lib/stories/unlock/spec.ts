// ============================================================
// Stories M3 — Unlock Spec v2 (FROZEN vocabulary)
// ------------------------------------------------------------
// Single source of truth for the shape of unlock rules. The
// importer, admin builder, server evaluator (SQL), and offline
// evaluator MUST all speak this exact vocabulary. Extending it
// requires bumping `UNLOCK_SPEC_VERSION` and updating every
// call site plus the SQL evaluator in the same migration.
// ============================================================

export const UNLOCK_SPEC_VERSION = 2 as const;

/** Structural safety bounds. Enforced by validator + evaluator. */
export const UNLOCK_LIMITS = {
  MAX_DEPTH: 6,
  MAX_NODES: 64,
} as const;

/** Every legal node type. Anything else → fail closed. */
export const UNLOCK_NODE_TYPES = [
  "always",
  "never",
  "all_of",
  "any_of",
  "not",
  "story_complete",
  "campaign_complete",
  "investigation_complete",
  "achievement_earned",
] as const;

export type UnlockNodeType = (typeof UNLOCK_NODE_TYPES)[number];

/**
 * A single evaluator node. Discriminated on `type`; fields are
 * strictly typed per branch so the validator can reject any
 * deviation without ad-hoc string checks.
 */
export type UnlockNode =
  | { type: "always" }
  | { type: "never" }
  | { type: "all_of"; children: UnlockNode[] }
  | { type: "any_of"; children: UnlockNode[] }
  | { type: "not"; child: UnlockNode }
  | { type: "story_complete"; story_id: string }
  | { type: "campaign_complete"; campaign_id: string }
  | { type: "investigation_complete"; investigation_id: string }
  | { type: "achievement_earned"; achievement_id: string };

export interface UnlockSpecV2 {
  v: 2;
  rule: UnlockNode;
}

/** Evaluator inputs — every set is authoritative and pre-materialised. */
export interface UnlockContext {
  completed_story_ids: ReadonlySet<string>;
  completed_campaign_ids: ReadonlySet<string>;
  completed_investigation_ids: ReadonlySet<string>;
  earned_achievement_ids: ReadonlySet<string>;
}

/** Validation error codes returned by `validateUnlockSpec`. */
export type UnlockValidationCode =
  | "not_an_object"
  | "wrong_version"
  | "missing_rule"
  | "not_an_object_node"
  | "missing_type"
  | "unknown_type"
  | "missing_children"
  | "children_not_array"
  | "empty_children_forbidden"
  | "missing_child"
  | "missing_id_field"
  | "id_not_string"
  | "id_empty"
  | "depth_exceeded"
  | "node_count_exceeded"
  | "extra_fields";

export interface UnlockValidationError {
  code: UnlockValidationCode;
  path: string; // dotted path from root, e.g. "rule.children[1].story_id"
  message: string;
}

export interface UnlockValidationResult {
  ok: boolean;
  errors: UnlockValidationError[];
  /** Total node count (populated even on failure, for reporting). */
  nodeCount: number;
  /** Maximum observed depth. */
  depth: number;
}

/** Deterministic "always" spec — used as the safe default. */
export const ALWAYS_SPEC: UnlockSpecV2 = { v: 2, rule: { type: "always" } };

/** Deterministic "never" spec — used to lock content unconditionally. */
export const NEVER_SPEC: UnlockSpecV2 = { v: 2, rule: { type: "never" } };
