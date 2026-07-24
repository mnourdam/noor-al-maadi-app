// ============================================================
// Stories M3 — Unlock Spec v2 evaluator (offline / reference)
// ------------------------------------------------------------
// Pure, deterministic, fail-closed evaluator for the FROZEN
// contract. Server-side SQL evaluator MUST agree.
// ============================================================

import { normalizeUnlockSpec } from "./normalize";
import {
  UNLOCK_LIMITS,
  type UnlockContext,
  type UnlockNode,
  type UnlockSpecV2,
} from "./spec";
import { validateUnlockSpec } from "./validate";

function chapterKey(campaign_id: string, chapter_id: string): string {
  return `${campaign_id}::${chapter_id}`;
}

function inDateWindow(nowIso: string | undefined, start?: string, end?: string): boolean {
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  if (!Number.isFinite(now)) return false;
  if (start) {
    const s = Date.parse(start);
    if (!Number.isFinite(s) || now < s) return false;
  }
  if (end) {
    const e = Date.parse(end);
    if (!Number.isFinite(e) || now > e) return false;
  }
  return true;
}

function evalNode(node: UnlockNode, ctx: UnlockContext, depth: number): boolean {
  if (depth > UNLOCK_LIMITS.MAX_DEPTH) return false;
  switch (node.type) {
    case "always":
      return true;
    case "all":
      for (const c of node.of) if (!evalNode(c, ctx, depth + 1)) return false;
      return true;
    case "any":
      for (const c of node.of) if (evalNode(c, ctx, depth + 1)) return true;
      return false;
    case "not":
      return !evalNode(node.child, ctx, depth + 1);
    case "story_complete":
      return ctx.completed_story_ids.has(node.story_id);
    case "campaign_complete":
      return ctx.completed_campaign_ids.has(node.campaign_id);
    case "campaign_chapter_complete":
      return ctx.completed_campaign_chapter_keys.has(chapterKey(node.campaign_id, node.chapter_id));
    case "investigation_complete":
      return ctx.completed_investigation_ids.has(node.investigation_id);
    case "entity_discovered":
      return ctx.discovered_entity_ids.has(node.entity_id);
    case "entities_discovered": {
      let hit = 0;
      for (const id of node.ids) if (ctx.discovered_entity_ids.has(id)) hit += 1;
      return hit >= node.min;
    }
    case "artifact_owned":
      return ctx.owned_artifact_ids.has(node.artifact_id);
    case "atlas_location_visited":
      return ctx.visited_atlas_location_ids.has(node.location_id);
    case "achievement_unlocked":
      return ctx.unlocked_achievement_ids.has(node.achievement_id);
    case "player_level":
      return typeof ctx.player_level === "number" && ctx.player_level >= node.min;
    case "date_window":
      return inDateWindow(ctx.now, node.start, node.end);
    /* c8 ignore next 2 */
    default:
      return false;
  }
}

export function evaluateUnlock(spec: UnlockSpecV2, ctx: UnlockContext): boolean {
  return evalNode(spec.expr, ctx, 1);
}

export function evaluateUnlockUnknown(input: unknown, ctx: UnlockContext): boolean {
  const spec = normalizeUnlockSpec(input);
  const check = validateUnlockSpec(spec);
  if (!check.ok) return false;
  return evaluateUnlock(spec, ctx);
}
