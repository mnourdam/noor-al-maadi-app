import { useEffect, useState } from "react";
import { Lightbulb, Check, Sparkles } from "lucide-react";
import type { WhoAmIStage } from "@/lib/games/types";

interface Props {
  stage: WhoAmIStage;
  onComplete: (score: number) => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[ًٌٍَُِّْـ]/g, "").replace(/[إأآ]/g, "ا").replace(/[ى]/g, "ي").replace(/[ة]/g, "ه");
}

export function WhoAmIRenderer({ stage, onComplete }: Props) {
  const [revealed, setRevealed] = useState(1);
  const [guess, setGuess] = useState("");
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState(false);

  useEffect(() => { setRevealed(1); setGuess(""); setDone(false); setWrong(false); }, [stage]);

  const accepted = [stage.answer, ...(stage.acceptable ?? [])].map(normalize);

  const submit = () => {
    const g = normalize(guess);
    if (!g) return;
    if (accepted.some((a) => a === g || a.includes(g) || g.includes(a))) {
      setDone(true);
      // 100 if guessed at hint 1, 70 at 2, 50 at 3
      const score = revealed === 1 ? 100 : revealed === 2 ? 70 : 50;
      onComplete(score);
    } else {
      setWrong(true);
      setTimeout(() => setWrong(false), 800);
    }
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {stage.hints.slice(0, revealed).map((h, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-200">{i + 1}</span>
            <span className="text-sm leading-7 text-slate-100">{h}</span>
          </li>
        ))}
      </ul>

      {revealed < stage.hints.length && !done && (
        <button onClick={() => setRevealed(revealed + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
          <Lightbulb className="h-3.5 w-3.5" /> تلميح آخر
        </button>
      )}

      <div className="flex gap-2">
        <input
          dir="rtl"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={done}
          placeholder="اكتب الإجابة…"
          className={`flex-1 rounded-lg border bg-slate-950 p-3 text-sm text-slate-100 focus:outline-none ${
            wrong ? "border-red-500/60 animate-pulse" : "border-slate-700 focus:border-amber-400"
          } ${done ? "border-emerald-500/40" : ""}`}
        />
        <button onClick={submit} disabled={done}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
          {done ? <><Sparkles className="h-4 w-4" /> صحيح</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
      </div>

      {done && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          الإجابة: <span className="font-bold">{stage.answer}</span>
        </p>
      )}
    </div>
  );
}
