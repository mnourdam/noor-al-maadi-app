import { useEffect, useMemo, useState } from "react";
import { Sparkles, Link2 } from "lucide-react";
import type { ConnectionsStage } from "@/lib/games/types";
import { sfx } from "./sfx";

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
  const [matched, setMatched] = useState<Record<number, number>>({});
  const [wrong, setWrong] = useState<{ l: number; r: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { setPickedLeft(null); setMatched({}); setWrong(null); setDone(false); }, [stage]);

  const pickRight = (rIdx: number) => {
    if (pickedLeft === null) return;
    if (pickedLeft === rIdx) {
      const next = { ...matched, [pickedLeft]: rIdx };
      setMatched(next);
      setPickedLeft(null);
      sfx("thread_connect");
      sfx("correct");
      if (Object.keys(next).length === stage.pairs.length && !done) {
        setDone(true);
        sfx("gold_unlock");
        onComplete(100);
      }
    } else {
      setWrong({ l: pickedLeft, r: rIdx });
      sfx("wrong");
      setTimeout(() => setWrong(null), 600);
      setPickedLeft(null);
    }
  };

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-300/80">
          <Link2 className="h-3.5 w-3.5" />
          الخيوط التاريخية
        </div>
        <span className="text-[11px] text-slate-400">{Object.keys(matched).length}/{stage.pairs.length}</span>
      </div>

      <div className="grid grid-cols-[1fr_28px_1fr] items-stretch gap-2">
        {/* Left column */}
        <ul className="space-y-2">
          {lefts.map((l) => {
            const isMatched = l.i in matched;
            const isPicked = pickedLeft === l.i;
            const isWrong = wrong?.l === l.i;
            return (
              <li key={l.i} className="relative">
                <button onClick={() => !isMatched && setPickedLeft(l.i)} disabled={isMatched}
                  className={`w-full rounded-lg border p-3 text-right text-sm transition ${
                    isMatched ? "border-amber-500/50 bg-amber-500/10 text-amber-100 irth-gold-glow"
                      : isPicked ? "border-amber-400 bg-amber-500/20 text-amber-100"
                      : isWrong ? "border-red-500/60 bg-red-500/10 irth-shake"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}>{l.text}</button>
              </li>
            );
          })}
        </ul>

        {/* Center thread column */}
        <ul className="space-y-2">
          {lefts.map((l) => {
            const matchedRight = matched[l.i];
            const isWrong = wrong?.l === l.i;
            return (
              <li key={l.i} className="relative grid h-[52px] place-items-center">
                {matchedRight !== undefined && (
                  <span className="irth-thread locked w-full" />
                )}
                {matchedRight === undefined && isWrong && (
                  <span className="irth-thread wrong w-full" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Right column */}
        <ul className="space-y-2">
          {rights.map((r) => {
            const isMatched = Object.values(matched).includes(r.i);
            const isWrong = wrong?.r === r.i;
            return (
              <li key={r.i}>
                <button onClick={() => !isMatched && pickRight(r.i)} disabled={isMatched}
                  className={`w-full rounded-lg border p-3 text-right text-sm transition ${
                    isMatched ? "border-amber-500/50 bg-amber-500/10 text-amber-100 irth-gold-glow"
                      : isWrong ? "border-red-500/60 bg-red-500/10 irth-shake"
                      : "border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400"
                  }`}>{r.text}</button>
              </li>
            );
          })}
        </ul>
      </div>

      {done && (
        <div className="irth-reveal mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 p-3 text-sm text-amber-100">
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتملت جميع الروابط — تتوهج خيوط التاريخ.
        </div>
      )}
    </div>
  );
}
