import { useEffect, useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import type { CrosswordStage, CrosswordClue } from "@/lib/games/types";

interface Props {
  stage: CrosswordStage;
  onComplete: (score: number) => void;
}

interface CellInfo {
  // map: "r-c" -> { clueAcross?: number; clueDown?: number; expected: string }
  expected: string;
  clues: number[]; // clue indices that occupy this cell
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
      onComplete(100);
    } else if (!done) {
      onComplete(Math.round(100 * correct / Math.max(total, 1)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-[2px] rounded-lg border border-slate-700 bg-slate-800 p-1"
          style={{ gridTemplateColumns: `repeat(${stage.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: stage.rows * stage.cols }).map((_, idx) => {
            const r = Math.floor(idx / stage.cols);
            const c = idx % stage.cols;
            const k = `${r}-${c}`;
            const info = grid.get(k);
            const clueNum = stage.clues.find((cl) => cl.row === r && cl.col === c)?.number;
            if (!info) {
              return <div key={k} className="aspect-square w-8 bg-slate-950" />;
            }
            return (
              <div key={k} className="relative aspect-square w-8 bg-amber-50 text-slate-950">
                {clueNum !== undefined && (
                  <span className="absolute right-0.5 top-0 text-[8px] font-bold text-slate-600">{clueNum}</span>
                )}
                <input
                  maxLength={1}
                  value={entries[k] ?? ""}
                  onChange={(e) => setCell(k, e.target.value)}
                  className="h-full w-full bg-transparent text-center text-sm font-bold uppercase focus:bg-amber-200 focus:outline-none"
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
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
        {done ? <><Sparkles className="h-4 w-4" /> اكتملت الشبكة</> : <><Check className="h-4 w-4" /> تحقق</>}
      </button>
    </div>
  );
}

function ClueList({ title, clues, onPick, active }: {
  title: string; clues: CrosswordClue[]; onPick: (n: number | null) => void; active: number | null;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <h4 className="mb-2 text-xs font-semibold text-amber-300">{title}</h4>
      <ul className="space-y-1 text-sm">
        {clues.map((c) => (
          <li key={`${c.direction}-${c.number}`}>
            <button onClick={() => onPick(active === c.number ? null : c.number)}
              className={`text-right ${active === c.number ? "text-amber-200" : "text-slate-300 hover:text-amber-200"}`}>
              <span className="font-bold">{c.number}.</span> {c.hint}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
