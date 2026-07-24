// ============================================================
// Stories M3 — v1 → v2 compatibility reader
// ------------------------------------------------------------
// Reads any historical unlock_spec row and returns the frozen
// v2 shape *in memory only*. Rows are never rewritten by this
// module — migration/repair is a separate, opt-in step.
//
// v1 vocabulary (frozen historical):
//   always, and, or,
//   campaign_completed{campaign_id},
//   investigation_completed{investigation_id},
//   story_completed{story_id}
//
// Anything not recognisable becomes NEVER (fail-closed), so
// stories with corrupt rules stay locked instead of leaking.
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

/** Convert a v1 node (or already-v2 node) into a v2 node. Returns null on garbage. */
function convertNode(node: unknown): UnlockNode | null {
  if (!isObj(node)) return null;
  const type = typeof node.type === "string" ? node.type : "";
  switch (type) {
    // v2 native — pass through with re-conversion of children.
    case "always":
      return { type: "always" };
    case "never":
      return { type: "never" };
    case "all_of":
    case "any_of":
    case "and":
    case "or": {
      const kids = Array.isArray(node.children) ? node.children : [];
      const conv = kids.map(convertNode).filter((c): c is UnlockNode => c !== null);
      if (conv.length === 0) return null;
      const outType = type === "and" || type === "all_of" ? "all_of" : "any_of";
      return { type: outType, children: conv };
    }
    case "not": {
      const c = convertNode(node.child);
      if (!c) return null;
      return { type: "not", child: c };
    }
    // Leaves (both spellings).
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
    case "investigation_complete":
    case "investigation_completed": {
      const id = typeof node.investigation_id === "string" ? node.investigation_id : "";
      if (!id) return null;
      return { type: "investigation_complete", investigation_id: id };
    }
    case "achievement_earned": {
      const id = typeof node.achievement_id === "string" ? node.achievement_id : "";
      if (!id) return null;
      return { type: "achievement_earned", achievement_id: id };
    }
    default:
      return null;
  }
}

/**
 * Normalise any historical unlock_spec into a valid v2 spec.
 * Contract:
 *   * `null`/`undefined`   → ALWAYS
 *   * already a v2 spec    → returned as-is if valid, NEVER if malformed
 *   * v1 shape             → converted; missing/garbage → NEVER
 * Never throws. Never mutates the input.
 */
export function normalizeUnlockSpec(input: unknown): UnlockSpecV2 {
  if (input === null || input === undefined) return ALWAYS_SPEC;

  if (isObj(input) && input.v === 2 && "rule" in input) {
    const check = validateUnlockSpec(input);
    return check.ok ? (input as UnlockSpecV2) : NEVER_SPEC;
  }

  // Bare v1 root node — the historical column stored the node directly.
  const rule = convertNode(input);
  if (!rule) return NEVER_SPEC;
  const wrapped: UnlockSpecV2 = { v: 2, rule };
  const check = validateUnlockSpec(wrapped);
  return check.ok ? wrapped : NEVER_SPEC;
}
