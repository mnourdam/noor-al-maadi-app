/**
 * Daily notification priority rule.
 *
 * Two "one card per day" notification types exist:
 *   - today_in_history ("في مثل هذا اليوم")
 *   - daily_fact ("معلومة اليوم")
 *
 * Rule: Today-in-History always wins. If the current day has at least one
 * enabled Today-in-History event, the daily fact is NOT sent that day.
 */

import { Database } from "@/integrations/supabase/types";
import { selectDailyFact } from "./dailyFactEngine";

export interface DailyPriorityInput {
  /** Number of ENABLED today_in_history events matching today's UTC month/day. */
  todayInHistoryEventCount: number;
}

export type DailyFactDecision =
  | { send: true; fact: Database["public"]["Tables"]["daily_facts"]["Row"] | null }
  | { send: false; reason: "suppressed_by_today_in_history" | "no_facts_available" };

/**
 * Decides whether to send a daily fact and picks which one to send using
 * the deterministic selection engine.
 */
export function decideDailyFact(
  input: DailyPriorityInput,
  facts: Database["public"]["Tables"]["daily_facts"]["Row"][] = [],
  date: Date = new Date()
): DailyFactDecision {
  if (input.todayInHistoryEventCount > 0) {
    return { send: false, reason: "suppressed_by_today_in_history" };
  }

  const { runDate } = dailyKeyParts(date);
  const fact = selectDailyFact(facts, runDate);

  if (!fact) {
    return { send: false, reason: "no_facts_available" };
  }

  return { send: true, fact };
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
  // Note: facts passed as empty here because plannedDailyCards is only used 
  // for slot counting in legacy contexts; actual selection happens in the edge function.
  const fact = decideDailyFact({ todayInHistoryEventCount }).send ? 1 : 0;
  return tih + fact;
}
