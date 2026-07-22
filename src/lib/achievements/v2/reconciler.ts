/**
 * Unlock reconciler.
 *
 * Diffs evaluator output against the persisted `user_achievements` mirror
 * and produces:
 *   - `newlyUnlocked` — ids to send to `claim_achievements`
 *   - `newlyClaimed`  — ids whose rewards were just granted
 *
 * Pure diff only. Presentation is emitted by the engine after it has a
 * transition origin and, for signed-in users, a successful inserted claim.
 */

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
  void alreadyNotified;

  const newlyUnlocked: AchievementId[] = [];
  const newlyClaimed: AchievementId[] = [];

  for (const id of evaluation.unlockedIds) {
    const rec = persisted.get(id);
    const def = registry.byId.get(id);
    if (!def) continue;

    if (!rec) {
      // Fresh unlock. The engine decides whether this is historical repair
      // or a live gameplay transition; do not emit from this pure diff.
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
 * Deprecated no-op kept for API compatibility. Claim acknowledgements are
 * never a valid notification origin.
 */
export function dispatchClaimTransitions(
  registry: Registry,
  transitionedIds: readonly AchievementId[],
): void {
  void registry;
  void transitionedIds;
}
