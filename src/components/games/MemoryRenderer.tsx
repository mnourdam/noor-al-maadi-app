import { useEffect, useMemo, useState } from "react";
import { Sparkles, Layers } from "lucide-react";
import type { MemoryStage } from "@/lib/games/types";
import { sfx } from "./sfx";

interface Props {
  stage: MemoryStage;
  onComplete: (score: number) => void;
}

interface Card { id: number; pairId: number; label: string; }

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MemoryRenderer({ stage, onComplete }: Props) {
  const deck = useMemo<Card[]>(() => {
    const cards: Card[] = [];
    stage.pairs.forEach((p, i) => {
      cards.push({ id: i * 2, pairId: i, label: p.a });
      cards.push({ id: i * 2 + 1, pairId: i, label: p.b });
    });
    return shuffle(cards);
  }, [stage]);

  const [open, setOpen] = useState<number[]>([]);
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [merging, setMerging] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => { setOpen([]); setSolved(new Set()); setMerging(new Set()); setMoves(0); setDone(false); }, [stage]);

  const flip = (id: number) => {
    if (open.includes(id) || solved.has(id) || open.length === 2) return;
    sfx("card_flip");
    const next = [...open, id];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next;
      const cardA = deck.find((c) => c.id === a)!;
      const cardB = deck.find((c) => c.id === b)!;
      if (cardA.pairId === cardB.pairId) {
        setMerging(new Set([a, b]));
        sfx("correct");
        sfx("museum_unlock");
        setTimeout(() => {
          const ns = new Set(solved);
          ns.add(a); ns.add(b);
          setSolved(ns);
          setMerging(new Set());
          setOpen([]);
          if (ns.size === deck.length && !done) {
            setDone(true);
            sfx("gold_unlock");
            const optimal = stage.pairs.length;
            const score = Math.max(40, Math.round(100 * optimal / Math.max(moves + 1, optimal)));
            onComplete(score);
          }
        }, 600);
      } else {
        sfx("wrong");
        setTimeout(() => setOpen([]), 800);
      }
    }
  };

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
        <span className="inline-flex items-center gap-2 text-amber-300/80">
          <Layers className="h-3.5 w-3.5" />
          خزانة الذاكرة
        </span>
        <span className="text-slate-400">المحاولات: {moves}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {deck.map((c) => {
          const isOpen = open.includes(c.id) || solved.has(c.id);
          const isSolved = solved.has(c.id);
          const isMerging = merging.has(c.id);
          return (
            <button key={c.id} onClick={() => flip(c.id)} disabled={isSolved}
              className={`irth-flip aspect-[3/4] w-full ${isOpen ? "is-open" : ""} ${isMerging ? "irth-merge" : ""}`}>
              <div className="irth-flip-inner">
                <div className="irth-face irth-face-back">
                  <span className="text-xs font-bold text-amber-300/70">إرث</span>
                </div>
                <div className={`irth-face irth-face-front ${isSolved ? "is-solved" : ""}`}>
                  <span className="text-[12px] leading-tight">{c.label}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {done && (
        <div className="irth-reveal mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 p-3 text-sm text-amber-100">
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتملت الخزانة في {moves} محاولة.
        </div>
      )}
    </div>
  );
}
