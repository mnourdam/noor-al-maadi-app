/**
 * Single source of truth for "في مثل هذا اليوم".
 *
 * All UI surfaces (Adventure page card/tile, Today in History page) AND
 * the automatic notification edge function must resolve today's event
 * the same way: from public.today_in_history_events, enabled rows
 * matching today's month/day, deterministic ordering by created_at ASC,
 * pick the first.
 *
 * No fake/legacy/demo fallbacks. If no row exists, return null and the
 * UI must hide itself.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAndroidUltraStableMode } from "./androidFreezeDiagnostics";

export interface TodayInHistoryEvent {
  id: string;
  month: number;
  day: number;
  title: string;
  body: string;
  hijri_year: string | null;
  gregorian_year: string | null;
  deep_link: string | null;
  enabled: boolean;
  created_at: string;
}

/** Returns {month, day} in UTC, matching the edge-function logic. */
export function todayMonthDay(date: Date = new Date()): { month: number; day: number } {
  return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Shared selection helper. Fetches all enabled events for the given
 * date and returns the canonical "selected" one plus the rest.
 *
 * Selection rule: deterministic — order by created_at ASC, pick first.
 * The edge function applies the identical rule so notification and UI
 * agree on the same event.
 */
export async function fetchTodayInHistory(
  date: Date = new Date(),
): Promise<{ selected: TodayInHistoryEvent | null; others: TodayInHistoryEvent[] }> {
  const { month, day } = todayMonthDay(date);
  // Local-first: read today's events from the bundled offline snapshot
  // so the card works without network. Refresh from Supabase only when the
  // snapshot has nothing for this date.
  try {
    const { ensureLocalSnapshotLoaded, localTihForMonthDay } = await import("./local-first-store");
    await ensureLocalSnapshotLoaded();
    const local = localTihForMonthDay(month, day) as unknown as TodayInHistoryEvent[];
    if (local.length > 0) return { selected: local[0], others: local.slice(1) };
  } catch { /* ignore */ }

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { selected: null, others: [] };
  }

  try {
    const { data, error } = await supabase
      .from("today_in_history_events" as any)
      .select("*")
      .eq("enabled", true)
      .eq("month", month)
      .eq("day", day)
      .order("created_at", { ascending: true });
    if (error || !data || data.length === 0) return { selected: null, others: [] };
    const rows = data as unknown as TodayInHistoryEvent[];
    return { selected: rows[0], others: rows.slice(1) };
  } catch {
    return { selected: null, others: [] };
  }
}

/** React hook wrapping fetchTodayInHistory. */
export function useTodayInHistoryEvent(date?: Date) {
  const [state, setState] = useState<{
    loading: boolean;
    selected: TodayInHistoryEvent | null;
    others: TodayInHistoryEvent[];
  }>({ loading: true, selected: null, others: [] });

  useEffect(() => {
    if (isAndroidUltraStableMode()) {
      setState({ loading: false, selected: null, others: [] });
      return;
    }
    let alive = true;
    fetchTodayInHistory(date).then((r) => {
      if (!alive) return;
      setState({ loading: false, selected: r.selected, others: r.others });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date?.toDateString()]);

  return state;
}
