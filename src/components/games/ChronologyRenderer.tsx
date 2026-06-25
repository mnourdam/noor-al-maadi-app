import { useEffect, useMemo, useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import type { ChronologyStage } from "@/lib/games/types";

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

  useEffect(() => { setOrder(initial); setChecked(null); setDone(false); }, [initial]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = order.slice();
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setOrder(next);
    setChecked(null);
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
      const score = Math.round(100 * results.filter(Boolean).length / results.length);
      onComplete(score);
    }
  };

  return (
    <div className="space-y-3">
      {stage.prompt && <p className="text-sm text-slate-300">{stage.prompt}</p>}
      <ol className="space-y-2">
        {order.map((id, idx) => {
          const ev = stage.events[id];
          const status = checked?.[idx];
          return (
            <li key={id} className={`flex items-center gap-2 rounded-lg border p-3 ${
              status === undefined ? "border-slate-700 bg-slate-900/60"
                : status ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-red-500/40 bg-red-500/10"
            }`}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-200">{idx + 1}</span>
              <div className="flex-1">
                <div className="text-sm text-slate-100">{ev.label}</div>
                {checked && <div className="text-[11px] text-slate-400">{ev.year < 0 ? `${-ev.year} ق.م` : `${ev.year}م`}{ev.era ? ` · ${ev.era}` : ""}</div>}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="rounded border border-slate-700 px-2 text-xs text-slate-300 disabled:opacity-30 hover:border-amber-400">↑</button>
                <button onClick={() => move(idx, 1)} disabled={idx === order.length - 1}
                  className="rounded border border-slate-700 px-2 text-xs text-slate-300 disabled:opacity-30 hover:border-amber-400">↓</button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <button onClick={check} disabled={done}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
          {done ? <><Sparkles className="h-4 w-4" /> أحسنت!</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
        {checked && !done && <span className="text-xs text-red-300"><X className="inline h-3 w-3" /> الترتيب غير صحيح بعد.</span>}
      </div>
    </div>
  );
}
