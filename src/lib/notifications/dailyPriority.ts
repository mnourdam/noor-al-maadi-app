/**
 * Daily notification priority rule.
 *
 * Two "one card per day" notification types exist:
 *   - today_in_history ("في مثل هذا اليوم")
 *   - daily_fact ("معلومة اليوم")
 *
 * Rule: Today-in-History always wins. If the current day has at least one
 * enabled Today-in-History event, the daily fact is NOT sent that day.
 *
 * The day is resolved from UTC month/day — the exact same clock used by
 * `src/lib/today-in-history.ts` (UI) and the scheduler edge function, so a
 * server/device timezone difference can never produce a double send.
 *
 * This rule applies ONLY to these two types. Story unlocks, achievements
 * and personal notifications are never suppressed by it.
 */

export interface DailyPriorityInput {
  /** Number of ENABLED today_in_history events matching today's UTC month/day. */
  todayInHistoryEventCount: number;
}

export type DailyFactDecision =
  | { send: true }
  | { send: false; reason: "suppressed_by_today_in_history" };

export function decideDailyFact(input: DailyPriorityInput): DailyFactDecision {
  if (input.todayInHistoryEventCount > 0) {
    return { send: false, reason: "suppressed_by_today_in_history" };
  }
  return { send: true };
}

/** Canonical day key shared by scheduler + client (UTC). */
export function dailyKeyParts(date: Date = new Date()): { month: number; day: number; runDate: string } {
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    runDate: date.toISOString().slice(0, 10),
  };
}

/** Total number of daily "informational" notifications planned for a day. */
export function plannedDailyCards(todayInHistoryEventCount: number): number {
  const tih = Math.min(todayInHistoryEventCount, 4); // TIH_MAX_SLOTS
  const fact = decideDailyFact({ todayInHistoryEventCount }).send ? 1 : 0;
  return tih + fact;
}
