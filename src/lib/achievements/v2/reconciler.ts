/**
 * Unlock reconciler.
 *
 * Diffs evaluator output against the persisted `user_achievements` mirror
 * and produces:
 *   - `newlyUnlocked` — ids to send to `claim_achievements`
 *   - `newlyClaimed`  — ids whose rewards were just granted
 *
 * Emits event-bus hooks and analytics events through `events.ts`. This is
 * the ONLY place the engine talks to presentation and analytics.
 */

import { dispatchAchievementHook } from "./events";
import type { Registry } from "./registry";
import type {
  AchievementId,
  EvaluationResult,
  UserAchievementRecord,
} from "./types";

export interface ReconciliationInput {
  registry: Registry;
  evaluation: EvaluationResult;
  /** Server-authoritative mirror; keyed by achievement id. */
  persisted: ReadonlyMap<AchievementId, UserAchievementRecord>;
  /**
   * Local pending-claims that have already fired their local notification.
   * Prevents double-notify when offline unlocks are later confirmed.
   */
  alreadyNotified?: ReadonlySet<AchievementId>;
}

export interface ReconciliationOutput {
  newlyUnlocked: readonly AchievementId[];
  newlyClaimed: readonly AchievementId[];
}

export function reconcile(input: ReconciliationInput): ReconciliationOutput {
  const { registry, evaluation, persisted } = input;
  const alreadyNotified = input.alreadyNotified ?? new Set<AchievementId>();

  const newlyUnlocked: AchievementId[] = [];
  const newlyClaimed: AchievementId[] = [];

  for (const id of evaluation.unlockedIds) {
    const rec = persisted.get(id);
    const def = registry.byId.get(id);
    if (!def) continue;

    if (!rec) {
      // Fresh unlock. Fire onUnlocked once per id per device.
      if (!alreadyNotified.has(id)) {
        dispatchAchievementHook("onUnlocked", def);
      }
      newlyUnlocked.push(id);
    } else if (!rec.rewardsGrantedAt) {
      // Row exists but rewards were not granted yet — retry claim safely.
      newlyUnlocked.push(id);
    }
  }

  // Detect claim transitions by comparing persisted records against the
  // caller's memory of what was previously claimed. Callers pass a fresh
  // `persisted` map each cycle; the presence of `rewardsGrantedAt` flips
  // the view state from `unlocked` to `claimed` — a downstream hook.
  for (const [id, rec] of persisted) {
    if (!rec.rewardsGrantedAt) continue;
    const def = registry.byId.get(id);
    if (!def) continue;
    // Fire onClaimed only when this cycle's persisted record has a
    // rewards_granted_at but the previous cycle didn't. Callers wire that
    // through by tracking the previously-claimed set outside this module.
    // Here we simply expose the id so the caller can dispatch.
    newlyClaimed.push(id);
    // Note: caller is responsible for diffing against last cycle to avoid
    // re-firing onClaimed. Dispatch left to the caller for that reason.
    void rec;
  }

  return { newlyUnlocked, newlyClaimed };
}

/**
 * Fire onClaimed hooks for ids that transitioned from "unlocked" to
 * "claimed" during this cycle. Kept separate from `reconcile` so callers
 * can compare against last-cycle state.
 */
export function dispatchClaimTransitions(
  registry: Registry,
  transitionedIds: readonly AchievementId[],
): void {
  for (const id of transitionedIds) {
    const def = registry.byId.get(id);
    if (def) dispatchAchievementHook("onClaimed", def);
  }
}
