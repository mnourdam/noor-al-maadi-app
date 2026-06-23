import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  CALENDAR_TYPE_LABELS, CALENDAR_TYPE_GLYPHS,
  MONTH_NAMES, IMPORTANCE_LABEL,
  eventsForDay, eventsForMonth, eventsForYear, filterByTypes,
  todayEvents, gregorianLabel, hijriLabel, primaryHref,
  calendarStats, useCalendarEvents,
  type CalendarEvent, type CalendarType,
} from "@/lib/historical-calendar";

export const Route = createFileRoute("/history-calendar")({
  head: () => ({
    meta: [
      { title: "التقويم التاريخي — إرث" },
      { name: "description", content: "حدث في مثل هذا اليوم — تقويم تاريخي يضم أبرز أحداث التاريخ الإسلامي." },
    ],
  }),
  component: HistoryCalendarPage,
});

type View = "today" | "month" | "year";

function HistoryCalendarPage() {
  const now = new Date();
  const [view, setView] = useState<View>("today");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [types, setTypes] = useState<CalendarType[]>([]);

  const { events: allEvents, isLoading } = useCalendarEvents();

  const baseEvents = useMemo<CalendarEvent[]>(() => {
    if (view === "today") return todayEvents(allEvents);
    if (view === "month") return eventsForMonth(allEvents, month);
    return eventsForYear(allEvents);
  }, [view, month, allEvents]);

  const events = useMemo(
    () => filterByTypes(baseEvents, types.length ? types : null),
    [baseEvents, types]
  );

  const stats = calendarStats(allEvents);
  const todayTitle = useMemo(() => {
    const exact = eventsForDay(allEvents, now.getMonth() + 1, now.getDate());
    return exact.length > 0 ? "حدث في مثل هذا اليوم" : "أقرب يومٍ تاريخي";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents]);

  return (
    <AppShell>
      <Screen
        title="التقويم التاريخي"
        subtitle={`${stats.total} حدث · ${stats.daysCovered} يومًا`}
      >
        {/* View switch */}
        <div className="mb-4 inline-flex rounded-full border border-white/10 bg-surface p-1 text-xs">
          {(["today", "month", "year"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1.5 transition ${
                view === v ? "bg-gold/15 text-gold" : "text-muted-foreground"
              }`}
            >
              {v === "today" ? "اليوم" : v === "month" ? "الشهر" : "السنة"}
            </button>
          ))}
        </div>

        {view === "month" && <MonthSwitcher month={month} onChange={setMonth} />}

        <div className="my-3">
          <TypeFilters types={types} onChange={setTypes} />
        </div>

        {view === "today" && (
          <h2 className="font-display mb-2 text-sm font-bold text-gold/90">{todayTitle}</h2>
        )}

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">جاري التحميل…</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gold/30 bg-surface/40 p-8 text-center">
            <p className="font-display text-base font-bold text-gold">لا توجد أحداث متاحة</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ستظهر هنا أحداث التقويم فور إضافتها.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ul>
        )}
      </Screen>
    </AppShell>
  );
}

function MonthSwitcher({ month, onChange }: { month: number; onChange: (m: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-full border border-white/10 bg-surface/60 px-3 py-1.5">
      <button
        onClick={() => onChange(month === 1 ? 12 : month - 1)}
        aria-label="الشهر السابق"
        className="rounded-full p-1 text-gold/80 hover:text-gold"
      >
        <ChevronRight className="size-4" />
      </button>
      <span className="font-display text-sm font-bold">{MONTH_NAMES[month - 1]}</span>
      <button
        onClick={() => onChange(month === 12 ? 1 : month + 1)}
        aria-label="الشهر التالي"
        className="rounded-full p-1 text-gold/80 hover:text-gold"
      >
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}

function TypeFilters({
  types, onChange,
}: { types: CalendarType[]; onChange: (t: CalendarType[]) => void }) {
  const all = Object.keys(CALENDAR_TYPE_LABELS) as CalendarType[];
  const toggle = (t: CalendarType) =>
    onChange(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  return (
    <div className="-mr-5 flex items-center gap-2 overflow-x-auto pr-5 pb-1">
      <span className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
        <Filter className="size-3" /> فلتر
      </span>
      <button
        onClick={() => onChange([])}
        className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
          types.length === 0
            ? "border-gold/50 bg-gold/10 text-gold"
            : "border-white/10 text-muted-foreground"
        }`}
      >
        الكل
      </button>
      {all.map((t) => {
        const on = types.includes(t);
        return (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`shrink-0 rounded-full border px-3 py-1 text-[11px] transition ${
              on ? "border-gold/50 bg-gold/10 text-gold" : "border-white/10 text-muted-foreground"
            }`}
          >
            <span className="ml-1">{CALENDAR_TYPE_GLYPHS[t]}</span>
            {CALENDAR_TYPE_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const href = primaryHref(event);
  const hijri = hijriLabel(event);

  const inner = (
    <div className="shadow-elegant relative overflow-hidden rounded-2xl border border-white/10 bg-surface p-5 transition hover:border-gold/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] tracking-[0.2em] text-gold">
            {gregorianLabel(event)}{event.year ? ` · ${event.year}` : ""}
          </p>
          {hijri && <p className="mt-0.5 text-[10px] text-white/50">الموافق {hijri}</p>}
          <h3 className="font-display mt-1 text-base font-bold leading-snug">{event.title}</h3>
        </div>
        <ImportanceBadge importance={event.importance} />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{event.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
          {CALENDAR_TYPE_GLYPHS[event.type]} {CALENDAR_TYPE_LABELS[event.type]}
        </span>
      </div>

      {href && (
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-gold">
          اقرأ المزيد <ChevronLeft className="size-3" />
        </div>
      )}
    </div>
  );

  return <li>{href ? <a href={href}>{inner}</a> : inner}</li>;
}

function ImportanceBadge({ importance }: { importance: 1 | 2 | 3 }) {
  const tone =
    importance === 3
      ? "border-gold/60 bg-gold/15 text-gold"
      : importance === 2
      ? "border-white/20 bg-white/5 text-white/80"
      : "border-white/10 bg-white/5 text-white/60";
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${tone}`}>
      {IMPORTANCE_LABEL[importance]}
    </span>
  );
}
