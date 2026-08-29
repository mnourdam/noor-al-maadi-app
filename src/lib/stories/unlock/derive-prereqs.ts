// ============================================================
// Stories — LOCAL prerequisite derivation (V16, client-only)
// ------------------------------------------------------------
// The authoritative RPC (`list_stories_v2`) returns a `prereqs`
// projection that powers the locked-story explainer. The local-first
// fallback path had no equivalent, so every locked story degraded to
// the generic "تابع رحلتك في إرث لفتحها" copy offline / on a slow
// cold start.
//
// The packaged baseline row ALREADY carries the canonical
// `unlock_spec`, so the requirement list can be derived on-device
// with the exact same semantics as the evaluator:
//
//   * leaves are collected in authoring order;
//   * `satisfied` is computed by running the CANONICAL evaluator on
//     that single leaf against the SAME local evidence used for the
//     unlock decision — never guessed;
//   * leaves under `not(...)` are omitted (a negative requirement has
//     no actionable player-facing phrasing);
//   * a row whose `unlock_spec` key is absent (redacted projection)
//     yields NO derived requirements — fail closed, never invent.
//
// Presentational only: unlock truth stays in the evaluator.
// ============================================================

import { evaluateUnlock } from "./evaluate";
import { validateUnlockSpec } from "./validate";
import { storyUnlockSpecOrNever } from "./story-row";
import { toUnlockContext, type PlayerUnlockState } from "./local";
import type { UnlockNode } from "./spec";

export interface DerivedPrereq {
  kind: string;
  ref: string;
  title: string | null;
  satisfied: boolean;
}

/** Resolves a human-readable title for a referenced entity, if known locally. */
export type PrereqTitleResolver = (kind: string, ref: string) => string | null;

/** Leaf `type` → the kind vocabulary understood by `LockedStoryDialog`. */
const KIND_MAP: Record<string, string> = {
  campaign_complete: "campaign_completed",
  campaign_chapter_complete: "campaign_chapter_complete",
  investigation_complete: "investigation_completed",
  story_complete: "story_completed",
  entity_discovered: "entity_discovered",
  entities_discovered: "entities_discovered",
  artifact_owned: "artifact_owned",
  atlas_location_visited: "atlas_location_visited",
  achievement_unlocked: "achievement_unlocked",
  player_level: "player_level",
  date_window: "date_window",
};

function leafRef(node: UnlockNode): string {
  const n = node as Record<string, unknown>;
  switch (node.type) {
    case "campaign_complete":          return String(n.campaign_id ?? "");
    case "campaign_chapter_complete":  return `${String(n.campaign_id ?? "")}::${String(n.chapter_id ?? "")}`;
    case "investigation_complete":     return String(n.investigation_id ?? "");
    case "story_complete":             return String(n.story_id ?? "");
    case "entity_discovered":          return String(n.entity_id ?? "");
    case "entities_discovered":        return (Array.isArray(n.ids) ? n.ids : []).join(",");
    case "artifact_owned":             return String(n.artifact_id ?? "");
    case "atlas_location_visited":     return String(n.location_id ?? "");
    case "achievement_unlocked":       return String(n.achievement_id ?? "");
    case "player_level":               return String(n.min ?? "");
    case "date_window":                return `${String(n.start ?? "")}..${String(n.end ?? "")}`;
    default:                           return "";
  }
}

/** Depth-first leaf collection; `not(...)` subtrees are skipped entirely. */
function collectLeaves(node: UnlockNode, out: UnlockNode[], depth = 0): void {
  if (!node || depth > 8) return;
  if (node.type === "all" || node.type === "any") {
    for (const child of node.of ?? []) collectLeaves(child, out, depth + 1);
    return;
  }
  if (node.type === "not") return; // no actionable phrasing
  if (node.type === "always") return;
  out.push(node);
}

/**
 * Derive the player-facing requirement list from a story ROW's
 * `unlock_spec`, using local evidence for `satisfied`.
 * Returns `[]` when nothing can be derived (fail closed).
 */
export function deriveStoryPrereqs(
  row: unknown,
  playerState: PlayerUnlockState = {},
  resolveTitle?: PrereqTitleResolver,
): DerivedPrereq[] {
  const spec = storyUnlockSpecOrNever(row);
  if (!validateUnlockSpec(spec).ok) return [];
  if (spec.expr.type === "always") return [];

  const leaves: UnlockNode[] = [];
  collectLeaves(spec.expr, leaves);
  if (leaves.length === 0) return [];

  const ctx = toUnlockContext(playerState);
  const seen = new Set<string>();
  const out: DerivedPrereq[] = [];

  for (const leaf of leaves) {
    const kind = KIND_MAP[leaf.type];
    if (!kind) continue;
    const ref = leafRef(leaf);
    const dedupe = `${kind}:${ref}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    // Canonical evaluator, single-leaf spec — never a heuristic.
    let satisfied = false;
    try {
      satisfied = evaluateUnlock({ version: 2, expr: leaf }, ctx);
    } catch { satisfied = false; }

    let title: string | null = null;
    if (resolveTitle && ref) {
      try { title = resolveTitle(kind, ref) ?? null; } catch { title = null; }
    }

    out.push({ kind, ref, title, satisfied });
  }

  return out;
}
