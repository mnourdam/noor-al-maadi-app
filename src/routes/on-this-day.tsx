import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useTodayInHistoryEvent, type TodayInHistoryEvent } from "@/lib/today-in-history";

export const Route = createFileRoute("/on-this-day")({
  head: () => ({ meta: [{ title: "في مثل هذا اليوم" }] }),
  component: OnThisDayPage,
});

function OnThisDayPage() {
  const { loading, selected, others } = useTodayInHistoryEvent();

  return (
    <AppShell>
      <Screen title="في مثل هذا اليوم" subtitle="أحداث من تاريخنا في هذا اليوم">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-surface p-6 text-center text-sm text-muted-foreground">
            جارٍ التحميل…
          </div>
        ) : selected ? (
          <>
            <TodayCard entry={selected} />
            {others.length > 0 && (
              <>
                <h3 className="font-display mt-7 mb-3 text-base font-bold text-muted-foreground">
                  أحداث أخرى في نفس اليوم
                </h3>
                <ol className="relative space-y-3 border-r-2 border-white/10 pr-5">
                  {others.map((e) => (
                    <EntryRow key={e.id} entry={e} />
                  ))}
                </ol>
              </>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-surface p-6 text-center text-sm text-muted-foreground">
            لا يوجد حدث مسجل لهذا اليوم بعد
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function yearLabel(e: TodayInHistoryEvent): string {
  const parts: string[] = [];
  if (e.hijri_year) parts.push(`${e.hijri_year} هـ`);
  if (e.gregorian_year) parts.push(`${e.gregorian_year} م`);
  return parts.join(" / ");
}

function TodayCard({ entry }: { entry: TodayInHistoryEvent }) {
  return (
    <div className="shadow-elegant relative overflow-hidden rounded-3xl border border-gold/30 bg-surface p-6">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs text-gold">
          <Calendar className="size-3.5" /> اليوم
        </div>
        {yearLabel(entry) && <p className="mt-2 text-xs text-gold">{yearLabel(entry)}</p>}
        <h2 className="font-display mt-1 text-2xl font-bold">{entry.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{entry.body}</p>
      </div>
    </div>
  );
}

function EntryRow({ entry }: { entry: TodayInHistoryEvent }) {
  return (
    <li className="relative">
      <span className="absolute -right-[27px] top-1.5 size-3 rounded-full border-2 border-background bg-gold" />
      <div className="rounded-2xl border border-white/10 bg-surface p-4">
        {yearLabel(entry) && <p className="text-xs text-gold">{yearLabel(entry)}</p>}
        <p className="font-display mt-1 text-sm font-bold">{entry.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{entry.body}</p>
      </div>
    </li>
  );
}
