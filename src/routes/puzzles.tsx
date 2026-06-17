import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lightbulb, Check, X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { PUZZLES, ERAS } from "@/lib/data";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/puzzles")({
  head: () => ({ meta: [{ title: "ألغاز تاريخية" }] }),
  component: PuzzlesPage,
});

function PuzzlesPage() {
  const { profile, markPuzzleSolved } = useProfile();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const p = PUZZLES[i];
  const era = ERAS.find((e) => e.id === p.era);
  const correct = picked === p.answerIndex;

  function choose(idx: number) {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === p.answerIndex) markPuzzleSolved(p.id);
  }

  function next() {
    setPicked(null); setHint(false);
    setI((x) => (x + 1) % PUZZLES.length);
  }
  function prev() {
    setPicked(null); setHint(false);
    setI((x) => (x - 1 + PUZZLES.length) % PUZZLES.length);
  }

  return (
    <AppShell>
      <Screen title="ألغاز تاريخية" subtitle={`لغز ${i + 1} من ${PUZZLES.length} · حللتَ ${profile.puzzlesSolved.length}`}>
        <div className="shadow-elegant rounded-3xl border border-white/10 bg-surface p-6">
          <div className="flex items-center justify-between text-xs">
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-gold">{era?.name}</span>
            <span className="text-muted-foreground">+١٥ نقطة</span>
          </div>
          <h2 className="font-display mt-5 text-xl font-bold leading-snug">{p.question}</h2>

          <div className="mt-6 space-y-2.5">
            {p.options.map((opt, idx) => {
              const isPicked = picked === idx;
              const isAnswer = idx === p.answerIndex;
              const reveal = picked !== null;
              const cls = !reveal
                ? "border-white/10 bg-surface-2 hover:border-gold/40"
                : isAnswer
                ? "border-emerald-400/50 bg-emerald-400/10"
                : isPicked
                ? "border-red-400/50 bg-red-400/10"
                : "border-white/10 bg-surface-2 opacity-60";
              return (
                <button
                  key={idx}
                  onClick={() => choose(idx)}
                  disabled={picked !== null}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-right text-sm transition ${cls}`}
                >
                  <span>{opt}</span>
                  {reveal && isAnswer && <Check className="size-4 text-emerald-400" />}
                  {reveal && isPicked && !isAnswer && <X className="size-4 text-red-400" />}
                </button>
              );
            })}
          </div>

          {!hint && picked === null && (
            <button onClick={() => setHint(true)} className="mt-5 flex items-center gap-1.5 text-xs text-gold">
              <Lightbulb className="size-3.5" /> أظهر تلميحًا
            </button>
          )}
          {hint && picked === null && (
            <p className="mt-5 rounded-xl border border-gold/20 bg-gold/5 p-3 text-xs text-gold">
              💡 {p.hint}
            </p>
          )}

          {picked !== null && (
            <div className={`mt-5 rounded-2xl p-4 text-sm ${correct ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}>
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="size-4" /> {correct ? "إجابة صحيحة!" : "إجابة غير صحيحة"}
              </div>
              <p className="mt-2 text-foreground/80">{p.explanation}</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button onClick={prev} className="flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronRight className="size-4" /> السابق
          </button>
          <button onClick={next} className="rounded-full bg-gradient-gold px-6 py-2 text-sm font-bold text-primary-foreground shadow-gold">
            {picked !== null ? "التالي" : "تخطّي"}
          </button>
          <button onClick={next} className="flex items-center gap-1 text-sm text-muted-foreground">
            التالي <ChevronLeft className="size-4" />
          </button>
        </div>
      </Screen>
    </AppShell>
  );
}