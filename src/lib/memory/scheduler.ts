// ============================================================
// Memory Engine — Scheduler
// ------------------------------------------------------------
// Decides WHERE (which activity to inject after) and WHETHER a
// review is allowed for a given chapter. Pure function of the
// chapter's authored activity ids + the owner's daily counter.
// ============================================================

import { dailyCap, dailyCount } from "./history";

export interface ScheduleDecision {
  insertionAfterActivityId: string | null;
  reason: "ok" | "chapter-too-short" | "daily-cap-reached";
}

export function decideInsertion(
  originalActivityIds: string[],
  now: number,
): ScheduleDecision {
  // Rule: insert after the 3rd successful activity, but only when at
  // least one authored activity still follows it — the review must
  // NEVER be the last thing the player sees in the chapter.
  if (originalActivityIds.length < 4) {
    return { insertionAfterActivityId: null, reason: "chapter-too-short" };
  }
  if (dailyCount(now) >= dailyCap()) {
    return { insertionAfterActivityId: null, reason: "daily-cap-reached" };
  }
  return { insertionAfterActivityId: originalActivityIds[2], reason: "ok" };
}
