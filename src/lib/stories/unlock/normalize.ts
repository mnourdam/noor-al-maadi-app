// ============================================================
// Stories M3 — v1 → v2 compatibility reader
// ------------------------------------------------------------
// Reads any historical unlock spec and returns the frozen v2
// envelope { version:2, expr } in-memory only. Rows are never
// rewritten by this module.
//
// v1 vocabulary (historical):
//   { v:2, rule } | { v:1, ... } | bare node
//   logical: and / or / all_of / any_of  (children in "children")
//   leaves : always | never
//            campaign_completed{campaign_id} | campaign_complete
//            investigation_completed{investigation_id} | investigation_complete
//            story_completed{story_id} | story_complete
//            achievement_earned{achievement_id}  → achievement_unlocked
//
// Anything unrecognisable → NEVER (fail closed).
// ============================================================

import {
  ALWAYS_SPEC,
  NEVER_SPEC,
  type UnlockNode,
  type UnlockSpecV2,
} from "./spec";
import { validateUnlockSpec } from "./validate";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Convert a v1 (or already-frozen) node into a frozen v2 node. */
function convertNode(node: unknown): UnlockNode | null {
  if (!isObj(node)) return null;
  const type = typeof node.type === "string" ? node.type : "";
  switch (type) {
    case "always":
      return { type: "always" };
    // Legacy "never" is expressed as not(always) in the frozen vocabulary.
    case "never":
      return { type: "not", child: { type: "always" } };

    // Logical — accept legacy child fields (children) and legacy names.
    case "and":
    case "all_of":
    case "all":
    case "or":
    case "any_of":
    case "any": {
      const rawKids = Array.isArray(node.of)
        ? node.of
        : Array.isArray(node.children)
          ? node.children
          : [];
      const conv = rawKids.map(convertNode).filter((c): c is UnlockNode => c !== null);
      if (conv.length === 0) return null;
      const outType: "all" | "any" =
        type === "and" || type === "all_of" || type === "all" ? "all" : "any";
      return { type: outType, of: conv };
    }
    case "not": {
      const c = convertNode(node.child);
      if (!c) return null;
      return { type: "not", child: c };
    }

    // Leaves.
    case "story_complete":
    case "story_completed": {
      const id = typeof node.story_id === "string" ? node.story_id : "";
      if (!id) return null;
      return { type: "story_complete", story_id: id };
    }
    case "campaign_complete":
    case "campaign_completed": {
      const id = typeof node.campaign_id === "string" ? node.campaign_id : "";
      if (!id) return null;
      return { type: "campaign_complete", campaign_id: id };
    }
    case "campaign_chapter_complete": {
      const cid = typeof node.campaign_id === "string" ? node.campaign_id : "";
      const chid = typeof node.chapter_id === "string" ? node.chapter_id : "";
      if (!cid || !chid) return null;
      return { type: "campaign_chapter_complete", campaign_id: cid, chapter_id: chid };
    }
    case "investigation_complete":
    case "investigation_completed": {
      const id = typeof node.investigation_id === "string" ? node.investigation_id : "";
      if (!id) return null;
      return { type: "investigation_complete", investigation_id: id };
    }
    case "entity_discovered": {
      const id = typeof node.entity_id === "string" ? node.entity_id : "";
      if (!id) return null;
      return { type: "entity_discovered", entity_id: id };
    }
    case "entities_discovered": {
      const ids = Array.isArray(node.ids)
        ? (node.ids as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 0)
        : [];
      const min = typeof node.min === "number" && Number.isInteger(node.min) ? node.min : 0;
      if (ids.length === 0 || min < 1 || min > ids.length) return null;
      return { type: "entities_discovered", ids, min };
    }
    case "artifact_owned": {
      const id = typeof node.artifact_id === "string" ? node.artifact_id : "";
      if (!id) return null;
      return { type: "artifact_owned", artifact_id: id };
    }
    case "atlas_location_visited": {
      const id = typeof node.location_id === "string" ? node.location_id : "";
      if (!id) return null;
      return { type: "atlas_location_visited", location_id: id };
    }
    case "achievement_unlocked":
    case "achievement_earned": {
      const id = typeof node.achievement_id === "string" ? node.achievement_id : "";
      if (!id) return null;
      return { type: "achievement_unlocked", achievement_id: id };
    }
    case "player_level": {
      const min = typeof node.min === "number" && Number.isInteger(node.min) ? node.min : 0;
      if (min < 1) return null;
      return { type: "player_level", min };
    }
    case "date_window": {
      const start = typeof node.start === "string" ? node.start : undefined;
      const end = typeof node.end === "string" ? node.end : undefined;
      if (!start && !end) return null;
      const out: UnlockNode = { type: "date_window" };
      if (start) (out as { start?: string }).start = start;
      if (end) (out as { end?: string }).end = end;
      return out;
    }
    default:
      return null;
  }
}

/**
 * Normalise any historical unlock spec into a valid frozen v2 spec.
 *   * null/undefined       → ALWAYS
 *   * already-frozen v2    → returned as-is if valid, NEVER if malformed
 *   * legacy v1 envelope   → unwrap rule then convert
 *   * legacy bare node     → convert directly
 * Never throws. Never mutates.
 */
export function normalizeUnlockSpec(input: unknown): UnlockSpecV2 {
  if (input === null || input === undefined) return ALWAYS_SPEC;

  // Frozen envelope.
  if (isObj(input) && input.version === 2 && "expr" in input) {
    const check = validateUnlockSpec(input);
    return check.ok ? (input as unknown as UnlockSpecV2) : NEVER_SPEC;
  }

  // Legacy envelope {v:2|1, rule}
  if (isObj(input) && "rule" in input && (input.v === 2 || input.v === 1)) {
    const rule = convertNode(input.rule);
    if (!rule) return NEVER_SPEC;
    const wrapped: UnlockSpecV2 = { version: 2, expr: rule };
    const check = validateUnlockSpec(wrapped);
    return check.ok ? wrapped : NEVER_SPEC;
  }

  // Bare v1 root node.
  const expr = convertNode(input);
  if (!expr) return NEVER_SPEC;
  const wrapped: UnlockSpecV2 = { version: 2, expr };
  const check = validateUnlockSpec(wrapped);
  return check.ok ? wrapped : NEVER_SPEC;
}
