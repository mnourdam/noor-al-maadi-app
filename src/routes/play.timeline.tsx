import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ListOrdered, ArrowUp, ArrowDown, Check, Trophy, ChevronRight } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { TIMELINES, CAMPAIGNS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

const searchSchema = z.object({ id: z.string().optional(), mission: z.string().optional() });

export const Route = createFileRoute("/play/timeline")({
  head: () => ({ meta: [{ title: "ترتيب الخط الزمني" }] }),
  validateSearch: searchSchema,
  component: TimelinePlay,
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function TimelinePlay() {
  const { id, mission } = useSearch({ from: "/play/timeline" });
  const { profile, completeTimeline, completeMission } = useProfile();

  if (!id) {
    return (
      <AppShell>
        <Screen title="ترتيب الأحداث" subtitle="رتّب الأحداث على الخطّ الزمني الصحيح">
          <div className="space-y-3">
            {TIMELINES.map((t) => {
              const done = profile.timelinesCompleted.includes(t.id);
              return (
                <Link
                  key={t.id}
                  to="/play/timeline"
                  search={{ id: t.id }}
                  className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface"}`}
                >
                  <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold"><ListOrdered className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display truncate text-sm font-bold">{t.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t.events.length} أحداث · +{t.reward} نقطة</p>
                  </div>
                  {done ? <Check className="size-4 text-gold" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                </Link>
              );
            })}
          </div>
        </Screen>
      </AppShell>
    );
  }

  const challenge = TIMELINES.find((t) => t.id === id);
  if (!challenge) return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">التحدي غير موجود.</div></AppShell>;

  return <TimelineGame key={id} challenge={challenge} onSolved={() => {
    completeTimeline(challenge.id, challenge.reward);
    if (mission) {
      const m = CAMPAIGNS.flatMap((c) => c.missions).find((mm) => mm.id === mission);
      if (m) completeMission(m.id, m.reward);
    }
  }} />;
}

function TimelineGame({ challenge, onSolved }: { challenge: typeof TIMELINES[number]; onSolved: () => void }) {
  const [order, setOrder] = useState(() => shuffle(challenge.events));
  const [checked, setChecked] = useState(false);
  const [solved, setSolved] = useState(false);

  const correctIds = useMemo(() => [...challenge.events].sort((a, b) => a.year - b.year).map((e) => e.id), [challenge]);

  const move = (idx: number, dir: -1 | 1) => {
    if (solved) return;
    setChecked(false);
    setOrder((cur) => {
      const next = [...cur];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const check = () => {
    setChecked(true);
    const ok = order.every((e, i) => e.id === correctIds[i]);
    if (ok) { setSolved(true); onSolved(); }
  };

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/play/timeline" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> كل التحديات
        </Link>

        <div className="mt-5 rounded-3xl border border-gold/20 bg-surface p-6">
          <div className="flex items-center gap-2 text-xs text-gold"><ListOrdered className="size-4" /> ترتيب زمني</div>
          <h1 className="font-display mt-2 text-xl font-bold">{challenge.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">رتّب من الأقدم إلى الأحدث (الأعلى = الأقدم)</p>
        </div>

        <ol className="mt-5 space-y-2">
          {order.map((e, i) => {
            const correct = checked && e.id === correctIds[i];
            const wrong = checked && e.id !== correctIds[i];
            return (
              <li
                key={e.id}
                className={`flex items-center gap-2 rounded-2xl border p-3 ${
                  solved || correct ? "border-gold/40 bg-gold/10" : wrong ? "border-red-400/30 bg-red-400/5" : "border-white/10 bg-surface"
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold/15 text-xs font-bold text-gold">{i + 1}</span>
                <span className="flex-1 text-sm">{e.label}</span>
                {solved && <span className="text-[10px] text-gold">{e.year}م</span>}
                {!solved && (
                  <div className="flex flex-col gap-1">
                    <button onClick={() => move(i, -1)} className="grid size-6 place-items-center rounded-md bg-white/5 text-muted-foreground"><ArrowUp className="size-3" /></button>
                    <button onClick={() => move(i, 1)} className="grid size-6 place-items-center rounded-md bg-white/5 text-muted-foreground"><ArrowDown className="size-3" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {!solved && (
          <button onClick={check} className="mt-5 w-full rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold">
            تحقّق من الترتيب
          </button>
        )}

        {solved && (
          <div className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5 text-center">
            <Trophy className="mx-auto size-7 text-gold" />
            <p className="font-display mt-2 text-lg font-bold text-gold">ترتيب صحيح!</p>
            <p className="mt-1 text-xs text-muted-foreground">+{challenge.reward} نقطة</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}