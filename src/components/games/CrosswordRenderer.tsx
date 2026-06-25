import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles, Feather } from "lucide-react";
import type { CrosswordStage, CrosswordClue } from "@/lib/games/types";
import { sfx } from "./sfx";

interface Props {
  stage: CrosswordStage;
  onComplete: (score: number) => void;
}

interface CellInfo {
  expected: string;
  clues: number[];
}

function buildGrid(stage: CrosswordStage): Map<string, CellInfo> {
  const map = new Map<string, CellInfo>();
  stage.clues.forEach((clue, idx) => {
    for (let i = 0; i < clue.answer.length; i++) {
      const r = clue.direction === "down" ? clue.row + i : clue.row;
      const c = clue.direction === "across" ? clue.col + i : clue.col;
      const k = `${r}-${c}`;
      const existing = map.get(k);
      const ch = clue.answer[i];
      if (existing) {
        existing.clues.push(idx);
      } else {
        map.set(k, { expected: ch, clues: [idx] });
      }
    }
  });
  return map;
}

export function CrosswordRenderer({ stage, onComplete }: Props) {
  const grid = useMemo(() => buildGrid(stage), [stage]);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [showHint, setShowHint] = useState<number | null>(null);

  useEffect(() => { setEntries({}); setDone(false); setShowHint(null); }, [stage]);

  const setCell = (k: string, ch: string) => {
    const v = ch.slice(-1);
    setEntries((prev) => ({ ...prev, [k]: v }));
    if (v) sfx("ink_write");
  };

  const check = () => {
    let correct = 0, total = 0;
    grid.forEach((info, k) => {
      total++;
      if ((entries[k] ?? "") === info.expected) correct++;
    });
    const allRight = correct === total;
    if (allRight && !done) {
      setDone(true);
      sfx("correct");
      sfx("gold_unlock");
      onComplete(100);
    } else if (!done) {
      sfx("wrong");
      onComplete(Math.round(100 * correct / Math.max(total, 1)));
    }
  };

  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
        <span className="inline-flex items-center gap-2 text-amber-300/80">
          <Feather className="h-3.5 w-3.5" />
          مخطوط الكلمات
        </span>
        {done && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
            <Sparkles className="h-3 w-3" /> خاتم ذهبي
          </span>
        )}
      </div>

      <div className="relative mb-4 overflow-x-auto rounded-xl irth-parchment p-3">
        <div className="absolute inset-0 pointer-events-none rounded-xl border border-amber-700/20" />
        <div
          className="relative inline-grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${stage.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: stage.rows * stage.cols }).map((_, idx) => {
            const r = Math.floor(idx / stage.cols);
            const c = idx % stage.cols;
            const k = `${r}-${c}`;
            const info = grid.get(k);
            const clueNum = stage.clues.find((cl) => cl.row === r && cl.col === c)?.number;
            if (!info) {
              return <div key={k} className="aspect-square w-8 rounded-sm bg-amber-900/30" />;
            }
            const value = entries[k] ?? "";
            const isCorrect = value && value === info.expected;
            return (
              <div key={k}
                   className={`irth-ink-cell relative aspect-square w-8 rounded-sm border border-amber-700/30 bg-[#fdf6e3] text-slate-950 ${isCorrect ? "is-correct" : ""}`}>
                {clueNum !== undefined && (
                  <span className="absolute right-0.5 top-0 text-[8px] font-bold text-amber-800/80">{clueNum}</span>
                )}
                <input
                  maxLength={1}
                  value={value}
                  onChange={(e) => setCell(k, e.target.value)}
                  className="h-full w-full bg-transparent text-center text-sm font-bold uppercase focus:bg-amber-200/60 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ClueList title="أفقي" clues={stage.clues.filter((c) => c.direction === "across")} onPick={setShowHint} active={showHint} />
        <ClueList title="عمودي" clues={stage.clues.filter((c) => c.direction === "down")} onPick={setShowHint} active={showHint} />
      </div>

      <button onClick={check} disabled={done}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50">
        {done ? <><Sparkles className="h-4 w-4" /> اكتمل المخطوط</> : <><Check className="h-4 w-4" /> تحقق</>}
      </button>
    </div>
  );
}

function ClueList({ title, clues, onPick, active }: {
  title: string; clues: CrosswordClue[]; onPick: (n: number | null) => void; active: number | null;
}) {
  return (
    <div className="rounded-lg border border-amber-500/15 bg-slate-900/60 p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300/80">{title}</h4>
      <ul className="space-y-1 text-sm">
        {clues.map((c) => (
          <li key={`${c.direction}-${c.number}`}>
            <button onClick={() => onPick(active === c.number ? null : c.number)}
              className={`text-right transition ${active === c.number ? "text-amber-200" : "text-slate-300 hover:text-amber-200"}`}>
              <span className="font-bold text-amber-300">{c.number}.</span> {c.hint}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
