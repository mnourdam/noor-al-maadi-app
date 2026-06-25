import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { ConnectionsStage } from "@/lib/games/types";

interface Props {
  stage: ConnectionsStage;
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

export function ConnectionsRenderer({ stage, onComplete }: Props) {
  const lefts = useMemo(() => stage.pairs.map((p, i) => ({ i, text: p.left })), [stage]);
  const rights = useMemo(() => shuffle(stage.pairs.map((p, i) => ({ i, text: p.right }))), [stage]);
  const [pickedLeft, setPickedLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Record<number, number>>({}); // leftIdx -> rightIdx
  const [wrong, setWrong] = useState<{ l: number; r: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { setPickedLeft(null); setMatched({}); setWrong(null); setDone(false); }, [stage]);

  const pickRight = (rIdx: number) => {
    if (pickedLeft === null) return;
    if (pickedLeft === rIdx) {
      setMatched({ ...matched, [pickedLeft]: rIdx });
      setPickedLeft(null);
      const next = { ...matched, [pickedLeft]: rIdx };
      if (Object.keys(next).length === stage.pairs.length && !done) {
        setDone(true);
        onComplete(100);
      }
    } else {
      setWrong({ l: pickedLeft, r: rIdx });
      setTimeout(() => setWrong(null), 600);
      setPickedLeft(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ul className="space-y-2">
          {lefts.map((l) => {
            const isMatched = l.i in matched;
            const isPicked = pickedLeft === l.i;
            const isWrong = wrong?.l === l.i;
            return (
              <li key={l.i}>
                <button onClick={() => !isMatched && setPickedLeft(l.i)} disabled={isMatched}
                  className={`w-full rounded-lg border p-3 text-right text-sm transition ${
                    isMatched ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : isPicked ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : isWrong ? "border-red-500/60 bg-red-500/10 animate-pulse"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}>{l.text}</button>
              </li>
            );
          })}
        </ul>
        <ul className="space-y-2">
          {rights.map((r) => {
            const isMatched = Object.values(matched).includes(r.i);
            const isWrong = wrong?.r === r.i;
            return (
              <li key={r.i}>
                <button onClick={() => !isMatched && pickRight(r.i)} disabled={isMatched}
                  className={`w-full rounded-lg border p-3 text-right text-sm transition ${
                    isMatched ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : isWrong ? "border-red-500/60 bg-red-500/10 animate-pulse"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}>{r.text}</button>
              </li>
            );
          })}
        </ul>
      </div>
      {done && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <Sparkles className="h-4 w-4" /> أحسنت! اكتملت جميع الروابط.
        </div>
      )}
    </div>
  );
}
