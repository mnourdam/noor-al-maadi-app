import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { MemoryStage } from "@/lib/games/types";

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
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => { setOpen([]); setSolved(new Set()); setMoves(0); setDone(false); }, [stage]);

  const flip = (id: number) => {
    if (open.includes(id) || solved.has(id) || open.length === 2) return;
    const next = [...open, id];
    setOpen(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next;
      const cardA = deck.find((c) => c.id === a)!;
      const cardB = deck.find((c) => c.id === b)!;
      if (cardA.pairId === cardB.pairId) {
        setTimeout(() => {
          const ns = new Set(solved);
          ns.add(a); ns.add(b);
          setSolved(ns);
          setOpen([]);
          if (ns.size === deck.length && !done) {
            setDone(true);
            const optimal = stage.pairs.length;
            const score = Math.max(40, Math.round(100 * optimal / Math.max(moves + 1, optimal)));
            onComplete(score);
          }
        }, 350);
      } else {
        setTimeout(() => setOpen([]), 700);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">المحاولات: {moves}</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {deck.map((c) => {
          const isOpen = open.includes(c.id) || solved.has(c.id);
          return (
            <button key={c.id} onClick={() => flip(c.id)}
              className={`aspect-[3/4] rounded-lg border p-2 text-center text-xs font-semibold transition ${
                isOpen
                  ? solved.has(c.id)
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-400 bg-amber-500/15 text-amber-100"
                  : "border-slate-700 bg-slate-900/60 text-transparent hover:border-amber-400"
              }`}>
              {isOpen ? c.label : "?"}
            </button>
          );
        })}
      </div>
      {done && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <Sparkles className="h-4 w-4" /> اكتملت جميع الأزواج في {moves} محاولة.
        </div>
      )}
    </div>
  );
}
