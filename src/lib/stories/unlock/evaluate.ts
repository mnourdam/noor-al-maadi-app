// ============================================================
// Stories M3 — Unlock Spec v2 evaluator (offline / reference)
// ------------------------------------------------------------
// Pure, deterministic, fail-closed evaluator. Server-side SQL
// evaluator (`public.evaluate_unlock_spec_v2`) MUST produce the
// exact same boolean for the same inputs. Shared test vectors
// pin both implementations to the same behaviour.
//
// Fail-closed rules:
//   * Structurally invalid spec → false
//   * Depth or node budget exceeded → false
//   * Unknown node type → false
//   * Missing id field → false
// ============================================================

import { normalizeUnlockSpec } from "./normalize";
import {
  UNLOCK_LIMITS,
  type UnlockContext,
  type UnlockNode,
  type UnlockSpecV2,
} from "./spec";
import { validateUnlockSpec } from "./validate";

function evalNode(node: UnlockNode, ctx: UnlockContext, depth: number): boolean {
  if (depth > UNLOCK_LIMITS.MAX_DEPTH) return false;
  switch (node.type) {
    case "always":
      return true;
    case "never":
      return false;
    case "all_of":
      for (const c of node.children) if (!evalNode(c, ctx, depth + 1)) return false;
      return true;
    case "any_of":
      for (const c of node.children) if (evalNode(c, ctx, depth + 1)) return true;
      return false;
    case "not":
      return !evalNode(node.child, ctx, depth + 1);
    case "story_complete":
      return ctx.completed_story_ids.has(node.story_id);
    case "campaign_complete":
      return ctx.completed_campaign_ids.has(node.campaign_id);
    case "investigation_complete":
      return ctx.completed_investigation_ids.has(node.investigation_id);
    case "achievement_earned":
      return ctx.earned_achievement_ids.has(node.achievement_id);
    /* c8 ignore next 2 */
    default:
      return false;
  }
}

/**
 * Evaluate an already-validated v2 spec. Callers that hold raw
 * JSON from the DB should use {@link evaluateUnlockUnknown} which
 * runs normalization + validation first.
 */
export function evaluateUnlock(spec: UnlockSpecV2, ctx: UnlockContext): boolean {
  return evalNode(spec.rule, ctx, 1);
}

/**
 * Full pipeline: normalize (v1 → v2), validate, evaluate. Returns
 * `false` on any structural failure — never throws.
 */
export function evaluateUnlockUnknown(input: unknown, ctx: UnlockContext): boolean {
  const spec = normalizeUnlockSpec(input);
  const check = validateUnlockSpec(spec);
  if (!check.ok) return false;
  return evaluateUnlock(spec, ctx);
}
