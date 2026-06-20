import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Search, Lightbulb, Check, X, ChevronRight, Trophy } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { INVESTIGATIONS, ERAS, CAMPAIGNS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

const searchSchema = z.object({ id: z.string().optional(), mission: z.string().optional() });

export const Route = createFileRoute("/play/investigate")({
  head: () => ({ meta: [{ title: "التحقيق التاريخي" }] }),
  validateSearch: searchSchema,
  component: InvestigatePage,
});

function InvestigatePage() {
  const { id, mission } = useSearch({ from: "/play/investigate" });
  const { profile, completeInvestigation, completeMission, findArtifact, unlockCharacter } = useProfile();

  if (!id) return <PickInvestigation />;

  const inv = INVESTIGATIONS.find((i) => i.id === id);
  if (!inv) return <AppShell><div className="px-5 pt-20 text-center text-muted-foreground">القضية غير موجودة.</div></AppShell>;

  return <InvestigationGame key={id} inv={inv} onSolved={(reward) => {
    completeInvestigation(inv.id, reward);
    if (inv.unlocks?.artifact) findArtifact(inv.unlocks.artifact);
    if (inv.unlocks?.character) unlockCharacter(inv.unlocks.character);
    if (mission) {
      const m = CAMPAIGNS.flatMap((c) => c.missions).find((mm) => mm.id === mission);
      if (m) completeMission(m.id, m.reward);
    }
  }} />;
}

function PickInvestigation() {
  const { profile } = useProfile();
  return (
    <AppShell>
      <Screen title="التحقيق التاريخي" subtitle="تكشّف القرائن وحدّد الشخصية أو المعركة أو المدينة">
        <div className="space-y-3">
          {INVESTIGATIONS.map((inv) => {
            const done = profile.investigationsCompleted.includes(inv.id);
            return (
              <Link
                key={inv.id}
                to="/play/investigate"
                search={{ id: inv.id }}
                className={`flex items-center gap-3 rounded-2xl border p-4 ${done ? "border-gold/30 bg-gold/5" : "border-white/10 bg-surface"}`}
              >
                <div className="grid size-10 place-items-center rounded-xl bg-gold/15 text-gold"><Search className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-gold">{inv.categoryLabel} · {ERAS.find((e) => e.id === inv.era)?.name}</p>
                  <p className="font-display mt-0.5 truncate text-sm font-bold">قضية رقم {inv.id.replace("inv-", "")}</p>
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

function InvestigationGame({ inv, onSolved }: { inv: typeof INVESTIGATIONS[number]; onSolved: (reward: number) => void }) {
  const [revealed, setRevealed] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);

  const reward = Math.max(20, inv.reward - (revealed - 1) * 10);

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/play/investigate" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="size-4" /> كل القضايا
        </Link>

        <div className="mt-5 rounded-3xl border border-gold/20 bg-surface p-6 shadow-elegant">
          <div className="flex items-center gap-2 text-xs text-gold">
            <Search className="size-4" /> قضية: {inv.categoryLabel}
          </div>
          <p className="font-display mt-2 text-xl font-bold">حدّد {inv.categoryLabel} من القرائن</p>
          <p className="mt-1 text-xs text-muted-foreground">المكافأة الحالية: +{reward} نقطة</p>
        </div>

        <h3 className="font-display mt-6 mb-2 text-sm font-bold">القرائن</h3>
        <ol className="space-y-2">
          {inv.clues.slice(0, revealed).map((c, i) => (
            <li key={i} className="flex items-start gap-3 rounded-2xl border border-gold/20 bg-gold/5 p-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-gold text-[10px] font-bold text-primary-foreground">{i + 1}</span>
              <span>{c}</span>
            </li>
          ))}
        </ol>

        {revealed < inv.clues.length && !solved && (
          <button
            onClick={() => setRevealed((r) => r + 1)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/40 bg-transparent py-3 text-sm text-gold"
          >
            <Lightbulb className="size-4" /> اكشف قرينة أخرى (-10 نقاط)
          </button>
        )}

        <h3 className="font-display mt-6 mb-2 text-sm font-bold">من/ما هو؟</h3>
        <div className="grid grid-cols-1 gap-2">
          {inv.options.map((o, i) => {
            const isAnswer = i === inv.answerIndex;
            const isPicked = picked === i;
            const state = picked === null ? "idle" : isPicked ? (isAnswer ? "right" : "wrong") : isAnswer && solved ? "right" : "idle";
            return (
              <button
                key={i}
                disabled={solved}
                onClick={() => {
                  setPicked(i);
                  if (isAnswer) {
                    setSolved(true);
                    onSolved(reward);
                  }
                }}
                className={`flex items-center justify-between rounded-2xl border p-4 text-right text-sm transition ${
                  state === "right" ? "border-gold/60 bg-gold/15 text-gold" :
                  state === "wrong" ? "border-red-400/40 bg-red-400/10 text-red-300" :
                  "border-white/10 bg-surface hover:border-gold/40"
                }`}
              >
                <span>{o}</span>
                {state === "right" && <Check className="size-4" />}
                {state === "wrong" && <X className="size-4" />}
              </button>
            );
          })}
        </div>

        {solved && (
          <div className="mt-6 rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/15 to-transparent p-5 text-center">
            <Trophy className="mx-auto size-7 text-gold" />
            <p className="font-display mt-2 text-lg font-bold text-gold">قضية محلولة!</p>
            <p className="mt-1 text-xs text-muted-foreground">+{reward} نقطة {inv.unlocks?.character ? "· شخصية جديدة" : ""} {inv.unlocks?.artifact ? "· أثر جديد" : ""}</p>
            <Link to="/play/investigate" className="mt-4 inline-block text-sm text-gold">قضية أخرى</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}