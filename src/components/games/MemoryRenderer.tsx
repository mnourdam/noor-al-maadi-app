import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Archive, Crown, Scroll, Sword, Landmark, BookOpen,
  Compass, Feather, Gem, Star, Shield,
} from "lucide-react";
import type { MemoryStage } from "@/lib/games/types";
import { sfx } from "./sfx";
import { AttemptsChip } from "./AttemptsChip";

interface Props {
  stage: MemoryStage;
  onComplete: (score: number) => void;
  onWrong?: () => void;
  attemptsLeft?: number;
  maxAttempts?: number;
}


interface Card { id: number; pairId: number; label: string; }

const ARTIFACT_ICONS = [Crown, Scroll, Sword, Landmark, BookOpen, Compass, Feather, Gem, Star, Shield];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MemoryRenderer({ stage, onComplete, onWrong, attemptsLeft, maxAttempts }: Props) {
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

  useEffect(() => {
    setOpen([]); setSolved(new Set()); setMerging(new Set()); setMoves(0); setDone(false);
  }, [stage]);

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
        }, 650);
      } else {
        sfx("wrong");
        onWrong?.();
        setTimeout(() => setOpen([]), 850);
      }

    }
  };

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
        <span className="inline-flex items-center gap-2 text-amber-300/80">
          <Archive className="h-3.5 w-3.5" />
          خزانة الذاكرة
        </span>
        <span className="text-slate-400 normal-case tracking-normal">
          المحاولات: {moves} · المطابقات: {solved.size / 2}/{stage.pairs.length}
        </span>
      </div>

      <p className="mb-3 text-[11px] text-slate-500">
        كل بطاقة دُرج في خزانة المتحف. افتح اثنين متشابهين ليندمجا في قطعة واحدة.
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {deck.map((c, idx) => {
          const isOpen = open.includes(c.id) || solved.has(c.id);
          const isSolved = solved.has(c.id);
          const isMerging = merging.has(c.id);
          const Icon = ARTIFACT_ICONS[c.pairId % ARTIFACT_ICONS.length];
          return (
            <button
              key={c.id}
              onClick={() => flip(c.id)}
              disabled={isSolved}
              aria-label={isOpen ? c.label : `درج رقم ${idx + 1}`}
              className={`irth-drawer aspect-[3/4] w-full ${isOpen ? "is-open" : ""} ${isMerging ? "irth-merge" : ""}`}
            >
              <div className="irth-drawer-inner">
                {/* Back — closed drawer */}
                <div className="irth-face irth-drawer-back">
                  <div className="irth-drawer-handle" aria-hidden />
                  <span className="irth-drawer-num">{idx + 1}</span>
                  <span className="irth-drawer-label">إرث</span>
                </div>
                {/* Front — artifact tile */}
                <div className={`irth-face irth-drawer-front ${isSolved ? "is-solved" : ""}`}>
                  <span className="irth-drawer-icon">
                    <Icon className="h-7 w-7" strokeWidth={1.4} />
                  </span>
                  <span className="irth-drawer-text">{c.label}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {done && (
        <div className="irth-reveal mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/5 p-3 text-sm text-amber-100">
          <Sparkles className="h-4 w-4 text-amber-300" />
          اكتملت الخزانة في {moves} محاولة — كل القطع استقرّت في مكانها.
        </div>
      )}
    </div>
  );
}
