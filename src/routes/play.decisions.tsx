import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { GitBranch, Check, ChevronRight, ScrollText } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { DECISIONS, ERAS, CAMPAIGNS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

const searchSchema = z.object({ id: z.string().optional(), mission: z.string().optional() });

export const Route = createFileRoute("/play/decisions")({
  head: () => ({ meta: [{ title: "قرارات تاريخية" }] }),
  validateSearch: searchSchema,
  component: DecisionsPage,
});

function DecisionsPage() {
  const { id, mission } = useSearch({ from: "/play/decisions" });
  const { profile, completeDecision, completeMission } = useProfile();

  if (!id) {
    return (
      <AppShell>
        <Screen title="قرارات تاريخية" subtitle="ضع نفسك مكانهم، وقرّر، ثم اعرف ما حدث فعلًا">
          <div className="space-y-3">
            {DECISIONS.map((d) => {
              const done = profile.decisionsCompleted.includes(d.id);
              return (
                <Link
                  key={d.id}
                  to="/play/decisions"
                  search={{ id: d.id }}
                  className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface"}`}
                >
                  <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold"><GitBranch className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gold">{ERAS.find((e) => e.id === d.era)?.name} · {d.setting}</p>
                    <p className="font-display mt-0.5 line-clamp-1 text-sm font-bold">{d.scene}</p>
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

  const dec = DECISIONS.find((d) => d.id === id);
  if (!dec) return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">المشهد غير موجود.</div></AppShell>;

  return <DecisionScene key={id} dec={dec} onResolve={() => {
    completeDecision(dec.id, dec.reward);
    if (mission) {
      const m = CAMPAIGNS.flatMap((c) => c.missions).find((mm) => mm.id === mission);
      if (m) completeMission(m.id, m.reward);
    }
  }} />;
}

function DecisionScene({ dec, onResolve }: { dec: typeof DECISIONS[number]; onResolve: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);

  const handlePick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    onResolve();
  };

  const choice = picked !== null ? dec.choices[picked] : null;

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/play/decisions" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> كل المشاهد
        </Link>

        <div className="mt-5 overflow-hidden rounded-3xl border border-gold/20 bg-surface p-6 shadow-elegant">
          <div className="absolute -left-10 -top-10 size-40 rounded-full bg-gold/20 blur-3xl" />
          <p className="text-[10px] text-gold">{dec.setting}</p>
          <p className="font-display mt-2 text-lg font-bold leading-snug">{dec.scene}</p>
        </div>

        <h3 className="font-display mt-6 mb-2 text-sm font-bold">قرارك</h3>
        <div className="space-y-2">
          {dec.choices.map((c, i) => {
            const isPicked = picked === i;
            return (
              <button
                key={i}
                onClick={() => handlePick(i)}
                disabled={picked !== null}
                className={`block w-full rounded-2xl border p-4 text-right text-sm transition ${
                  isPicked
                    ? c.historical
                      ? "border-gold/60 bg-gold/15 text-gold"
                      : "border-red-400/40 bg-red-400/10 text-red-300"
                    : "border-white/10 bg-surface hover:border-gold/40"
                } ${picked !== null && !isPicked ? "opacity-50" : ""}`}
              >
                <p className="font-bold">{c.label}</p>
                {isPicked && <p className="mt-2 text-xs opacity-90">{c.outcome}</p>}
              </button>
            );
          })}
        </div>

        {choice && (
          <div className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5">
            <div className="flex items-center gap-2 text-xs text-gold">
              <ScrollText className="size-4" /> ما حدث فعلًا
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">{dec.historicalNote}</p>
            <p className="mt-3 text-xs text-gold">
              {choice.historical ? `+${dec.reward} نقطة — قرارٌ مطابق للتاريخ` : `+${Math.round(dec.reward / 2)} نقطة على المحاولة`}
            </p>
            <Link to="/play/decisions" className="mt-3 inline-block text-sm text-gold">مشهد آخر</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}