// ============================================================
// Memory Engine — Rewards (XP with idempotency)
// ------------------------------------------------------------
// A memory review grants XP only. No dinars, no hearts, no unlocks,
// no writes to campaign/investigation progress. Guarded by an
// attemptId so a reload / duplicate call is a no-op.
// ============================================================

import { hasGranted, markGranted } from "./history";

export function computeReviewXp(originalXp: number): number {
  const raw = originalXp > 0 ? Math.round(originalXp * 0.25) : 5;
  return Math.max(3, Math.min(10, raw));
}

export interface GrantResult {
  granted: boolean;
  xp: number;
}

/**
 * Idempotent XP grant. `apply(xp)` is only called when this attempt
 * has never been granted before. Returns the amount actually
 * awarded (0 on replay).
 */
export function grantReviewXp(
  attemptId: string,
  originalXp: number,
  apply: (xp: number) => void,
): GrantResult {
  if (hasGranted(attemptId)) return { granted: false, xp: 0 };
  const xp = computeReviewXp(originalXp);
  try { apply(xp); }
  catch { return { granted: false, xp: 0 }; }
  markGranted(attemptId);
  return { granted: true, xp };
}
