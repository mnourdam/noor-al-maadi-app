// ============================================================
// Historical Calendar (Supabase-only)
// ------------------------------------------------------------
// Events are sourced exclusively from `today_in_history_events`.
// Legacy pack/registry resolution has been removed.
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CalendarType =
  | "state" | "battle" | "figure" | "scholar" | "city" | "event" | "landmark";

export const CALENDAR_TYPE_LABELS: Record<CalendarType, string> = {
  state: "الدول", battle: "المعارك", figure: "الشخصيات", scholar: "العلماء",
  city: "المدن", event: "الأحداث", landmark: "المعالم",
};

export const CALENDAR_TYPE_GLYPHS: Record<CalendarType, string> = {
  state: "🏛️", battle: "⚔️", figure: "🪶", scholar: "📚",
  city: "🏙️", event: "📜", landmark: "🕌",
};

export type Importance = 1 | 2 | 3;

export interface CalendarEvent {
  id: string;
  month: number;
  day: number;
  year: string;
  era: string;
  type: CalendarType;
  title: string;
  description: string;
  importance: Importance;
  hijriDay?: number;
  hijriMonth?: number;
  hijriMonthName?: string;
  relatedEntityIds?: string[];
  source?: string;
  imagePlaceholder?: string;
  deepLink?: string | null;
}

export const HIJRI_MONTHS = [
  "محرّم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة",
  "رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة",
];

const MONTHS_AR = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];

export const MONTH_NAMES = MONTHS_AR;

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  3: "حدث محوري",
  2: "حدث رئيسي",
  1: "حدث ملحوظ",
};

export function gregorianLabel(e: Pick<CalendarEvent, "month" | "day">): string {
  return `${e.day} ${MONTHS_AR[e.month - 1]}`;
}

export function hijriLabel(e: Pick<CalendarEvent, "hijriDay" | "hijriMonth" | "hijriMonthName">): string | null {
  if (!e.hijriDay) return null;
  const name = e.hijriMonthName ?? (e.hijriMonth ? HIJRI_MONTHS[e.hijriMonth - 1] : null);
  if (!name) return null;
  return `${e.hijriDay} ${name}`;
}

function byImportance(a: CalendarEvent, b: CalendarEvent): number {
  return b.importance - a.importance;
}

function rowToEvent(r: any): CalendarEvent {
  return {
    id: String(r.id),
    month: Number(r.month),
    day: Number(r.day),
    year: r.gregorian_year ?? r.hijri_year ?? "",
    era: "",
    type: "event",
    title: String(r.title),
    description: String(r.body ?? ""),
    importance: 2,
    deepLink: r.deep_link ?? null,
  };
}

/** React Query hook reading every enabled today-in-history event. */
export function useCalendarEvents() {
  const q = useQuery({
    queryKey: ["calendar", "today_in_history_events"],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from("today_in_history_events")
        .select("id,month,day,title,body,gregorian_year,hijri_year,deep_link,enabled")
        .eq("enabled", true);
      if (error) {
        console.warn("[historical-calendar] fetch failed:", error.message);
        return [];
      }
      return (data ?? []).map(rowToEvent);
    },
  });
  return { events: q.data ?? [], isLoading: q.isLoading };
}

export function filterByTypes(events: CalendarEvent[], types: CalendarType[] | null): CalendarEvent[] {
  if (!types || types.length === 0) return events;
  const set = new Set(types);
  return events.filter(e => set.has(e.type));
}

export function eventsForDay(all: CalendarEvent[], month: number, day: number): CalendarEvent[] {
  return all.filter(e => e.month === month && e.day === day).sort(byImportance);
}
export function eventsForMonth(all: CalendarEvent[], month: number): CalendarEvent[] {
  return all.filter(e => e.month === month).sort((a, b) => a.day - b.day || byImportance(a, b));
}
export function eventsForYear(all: CalendarEvent[]): CalendarEvent[] {
  return [...all].sort((a, b) => a.month - b.month || a.day - b.day || byImportance(a, b));
}
export function todayEvents(all: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const exact = eventsForDay(all, now.getMonth() + 1, now.getDate());
  if (exact.length) return exact;
  const idx = now.getMonth() * 31 + now.getDate();
  const sorted = all
    .map(e => ({ e, delta: ((e.month - 1) * 31 + e.day - idx + 372) % 372 }))
    .sort((a, b) => a.delta - b.delta || byImportance(a.e, b.e));
  const nearest = sorted[0]?.e;
  return nearest ? [nearest] : [];
}

export function calendarStats(all: CalendarEvent[]) {
  const covered = new Set(all.map(e => `${e.month}-${e.day}`));
  return {
    total: all.length,
    daysCovered: covered.size,
    months: new Set(all.map(e => e.month)).size,
    withHijri: all.filter(e => !!e.hijriDay).length,
    withRelations: all.filter(e => (e.relatedEntityIds?.length ?? 0) > 0).length,
  };
}

/** Legacy resolver — now Supabase-only; returns the deep link if any. */
export function primaryHref(event: CalendarEvent): string | null {
  return event.deepLink ?? null;
}

/** Legacy resolver — pack-based related entities removed. */
export function resolveEntities(_event: CalendarEvent): Array<{ id: string; title: string }> {
  return [];
}
