// ============================================================
// Stories — single source of truth for client-side unlock reads
// ------------------------------------------------------------
// Every client surface (card, list, route, reader, admin editors,
// offline fallbacks) MUST go through these helpers. The server RPCs
// (`list_stories_v3`, `get_story_bundle_v2`) remain authoritative
// whenever the device is online; these helpers exist for the offline
// snapshot path and for read-only admin display.
//
// Historical bug this file fixes: callers used
// `spec?.type === "always"` on a v2 envelope (`{version, expr}`),
// where `.type` is `undefined` — so EVERY v2-gated story was treated
// as "always unlocked" offline and on the online-locked fallback path.
// ============================================================

import { normalizeUnlockSpec } from "./normalize";
import { validateUnlockSpec } from "./validate";
import { evaluateUnlock } from "./evaluate";
import type { UnlockContext, UnlockSpecV2 } from "./spec";

/** Normalizes any legacy/v2 shape into the frozen v2 envelope. */
export function toUnlockSpecV2(input: unknown): UnlockSpecV2 {
  return normalizeUnlockSpec(input);
}

/**
 * True only when the (normalized) spec is unconditionally open.
 * Fail-closed: an invalid spec is NOT "always".
 */
export function isAlwaysUnlockSpec(input: unknown): boolean {
  const spec = normalizeUnlockSpec(input);
  if (!validateUnlockSpec(spec).ok) return false;
  return spec.expr.type === "always";
}

export type PlayerUnlockState = Partial<UnlockContext>;

const EMPTY = new Set<string>();

export function toUnlockContext(state: PlayerUnlockState): UnlockContext {
  return toContext(state);
}

function toContext(state: PlayerUnlockState): UnlockContext {
  return {
    completed_story_ids: state.completed_story_ids ?? EMPTY,
    completed_campaign_ids: state.completed_campaign_ids ?? EMPTY,
    completed_campaign_chapter_keys: state.completed_campaign_chapter_keys ?? EMPTY,
    completed_investigation_ids: state.completed_investigation_ids ?? EMPTY,
    discovered_entity_ids: state.discovered_entity_ids ?? EMPTY,
    owned_artifact_ids: state.owned_artifact_ids ?? EMPTY,
    visited_atlas_location_ids: state.visited_atlas_location_ids ?? EMPTY,
    unlocked_achievement_ids: state.unlocked_achievement_ids ?? EMPTY,
    player_level: state.player_level ?? 0,
    now: state.now,
  };
}

/**
 * Central evaluation used by cards, reader guards and admin previews.
 * Fail-closed on invalid specs.
 */
export function evaluateStoryUnlock(
  story: { unlock_spec?: unknown } | null | undefined,
  playerState: PlayerUnlockState = {},
): boolean {
  const spec = normalizeUnlockSpec(story?.unlock_spec);
  if (!validateUnlockSpec(spec).ok) return false;
  return evaluateUnlock(spec, toContext(playerState));
}
