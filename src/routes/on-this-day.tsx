import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { ON_THIS_DAY, todayOnThisDay, ERAS } from "@/lib/data";

export const Route = createFileRoute("/on-this-day")({
  head: () => ({ meta: [{ title: "في مثل هذا اليوم" }] }),
  component: OnThisDayPage,
});

function OnThisDayPage() {
  const today = todayOnThisDay();
  const rest = ON_THIS_DAY.filter((e) => e.id !== today.id);

  return (
    <AppShell>
      <Screen title="في مثل هذا اليوم" subtitle="أحداث من تاريخنا في كل يوم">
        <div className="shadow-elegant relative overflow-hidden rounded-3xl border border-gold/30 bg-surface p-6">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-gold">
              <Calendar className="size-3.5" /> اليوم
            </div>
            <p className="mt-2 text-xs text-gold">{today.year}</p>
            <h2 className="font-display mt-1 text-2xl font-bold">{today.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{today.detail}</p>
            <span className="mt-4 inline-block rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] text-gold">
              {ERAS.find((e) => e.id === today.era)?.name}
            </span>
          </div>
        </div>

        <h3 className="font-display mt-7 mb-3 text-base font-bold text-muted-foreground">أحداث أخرى</h3>
        <ol className="relative space-y-3 border-r-2 border-white/10 pr-5">
          {rest.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -right-[27px] top-1.5 size-3 rounded-full border-2 border-background bg-gold" />
              <div className="rounded-2xl border border-white/10 bg-surface p-4">
                <p className="text-xs text-gold">{e.year} · {e.monthDay.replace("-", "/")}</p>
                <p className="font-display mt-1 text-sm font-bold">{e.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{e.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Screen>
    </AppShell>
  );
}