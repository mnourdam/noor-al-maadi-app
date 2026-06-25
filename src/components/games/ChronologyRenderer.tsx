import { useEffect, useMemo, useState } from "react";
import { Check, X, Sparkles, ChevronUp, ChevronDown, Hourglass } from "lucide-react";
import type { ChronologyStage } from "@/lib/games/types";
import { sfx } from "./sfx";

interface Props {
  stage: ChronologyStage;
  onComplete: (score: number) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ChronologyRenderer({ stage, onComplete }: Props) {
  const initial = useMemo(() => shuffle(stage.events.map((_, i) => i)), [stage]);
  const [order, setOrder] = useState<number[]>(initial);
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const [done, setDone] = useState(false);
  const [snapKey, setSnapKey] = useState(0);

  useEffect(() => { setOrder(initial); setChecked(null); setDone(false); }, [initial]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = order.slice();
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setOrder(next);
    setChecked(null);
    setSnapKey((k) => k + 1);
    sfx("timeline_snap");
  };

  const check = () => {
    const correctOrder = stage.events
      .map((e, i) => ({ i, year: e.year }))
      .sort((a, b) => a.year - b.year)
      .map((x) => x.i);
    const results = order.map((id, idx) => id === correctOrder[idx]);
    setChecked(results);
    const allRight = results.every(Boolean);
    if (allRight && !done) {
      setDone(true);
      sfx("correct");
      sfx("gold_unlock");
      const score = Math.round(100 * results.filter(Boolean).length / results.length);
      onComplete(score);
    } else if (!allRight) {
      sfx("wrong");
    }
  };

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-300/80">
          <Hourglass className="h-3.5 w-3.5" />
          الخط الزمني
        </div>
        {stage.prompt && <span className="text-[11px] text-slate-400">{stage.prompt}</span>}
      </div>

      {/* Timeline rail */}
      <ol className="relative space-y-2 ps-8">
        <span className="absolute right-3 top-2 bottom-2 w-px bg-gradient-to-b from-amber-500/60 via-amber-500/25 to-amber-500/60" aria-hidden />
        {order.map((id, idx) => {
          const ev = stage.events[id];
          const status = checked?.[idx];
          return (
            <li key={`${id}-${snapKey}-${idx}`}
                className={`irth-snap relative flex items-center gap-3 rounded-lg border p-3 ${
                  status === undefined ? "border-slate-700 bg-slate-900/60"
                    : status ? "border-emerald-500/40 bg-emerald-500/10 irth-gold-glow"
                    : "border-red-500/40 bg-red-500/10 irth-shake"
                }`}>
              <span className="absolute -right-[26px] grid h-5 w-5 place-items-center rounded-full border border-amber-500/60 bg-slate-950 text-[10px] font-bold text-amber-200 shadow-[0_0_0_3px_rgba(2,6,23,1)]">
                {idx + 1}
              </span>
              <div className="flex-1">
                <div className="text-sm text-slate-100">{ev.label}</div>
                {checked && (
                  <div className="mt-0.5 text-[11px] text-amber-300/80">
                    {ev.year < 0 ? `${-ev.year} ق.م` : `${ev.year}م`}{ev.era ? ` · ${ev.era}` : ""}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="grid h-6 w-6 place-items-center rounded border border-slate-700 text-slate-300 transition disabled:opacity-30 hover:border-amber-400 hover:text-amber-200">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1}
                  className="grid h-6 w-6 place-items-center rounded border border-slate-700 text-slate-300 transition disabled:opacity-30 hover:border-amber-400 hover:text-amber-200">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={check} disabled={done}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50">
          {done ? <><Sparkles className="h-4 w-4" /> اكتمل التسلسل</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
        {checked && !done && (
          <span className="inline-flex items-center gap-1 text-xs text-red-300">
            <X className="h-3 w-3" /> أعد ترتيب البطاقات.
          </span>
        )}
      </div>
    </div>
  );
}
