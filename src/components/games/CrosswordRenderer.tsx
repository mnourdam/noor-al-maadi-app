import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Sparkles, Feather, AlertTriangle, Lightbulb } from "lucide-react";
import type { CrosswordStage, CrosswordClue } from "@/lib/games/types";
import { validateCrosswordStage } from "@/lib/games/crossword-validate";
import { AndroidSafeInput } from "@/components/AndroidSafeTextInput";
import { sfx } from "./sfx";
import { AttemptsChip } from "./AttemptsChip";
import { isAndroidNativeApp, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";


interface Props {
  stage: CrosswordStage;
  onComplete: (score: number) => void;
  onWrong?: () => void;
  attemptsLeft?: number;
  maxAttempts?: number;
  onPaidHint?: (cost: number) => boolean;
}

const HINT_COST = 10;

interface CellInfo {
  expected: string;
  clueIds: number[]; // indexes into stage.clues
}

function cellKey(r: number, c: number) { return `${r}-${c}`; }

interface BuiltGrid {
  cells: Map<string, CellInfo>;
  conflicts: string[];
}

function buildGrid(stage: CrosswordStage): BuiltGrid {
  const map = new Map<string, CellInfo>();
  const conflicts: string[] = [];
  stage.clues.forEach((clue, idx) => {
    for (let i = 0; i < clue.answer.length; i++) {
      const r = clue.direction === "down" ? clue.row + i : clue.row;
      const c = clue.direction === "across" ? clue.col + i : clue.col;
      if (r < 0 || c < 0 || r >= stage.rows || c >= stage.cols) continue;
      const k = cellKey(r, c);
      const ch = clue.answer[i];
      const existing = map.get(k);
      if (existing) {
        if (existing.expected !== ch) {
          // CRITICAL: never mutate either answer. Record the conflict and stop.
          const other = stage.clues[existing.clueIds[0]];
          conflicts.push(
            `تعارض في تقاطع الكلمات: الكلمة (${clue.answer}) لا توافق الكلمة (${other.answer}) عند الصف ${r} والعمود ${c}.`,
          );
          continue;
        }
        if (!existing.clueIds.includes(idx)) existing.clueIds.push(idx);
      } else {
        map.set(k, { expected: ch, clueIds: [idx] });
      }
    }
  });
  return { cells: map, conflicts };
}


function clueCells(clue: CrosswordClue): { r: number; c: number }[] {
  const cells: { r: number; c: number }[] = [];
  for (let i = 0; i < clue.answer.length; i++) {
    const r = clue.direction === "down" ? clue.row + i : clue.row;
    const c = clue.direction === "across" ? clue.col + i : clue.col;
    cells.push({ r, c });
  }
  return cells;
}

function normalizeCrosswordText(s: string): string {
  return s.trim().toLowerCase().replace(/[ًٌٍَُِّْـ\s]/g, "").replace(/[إأآ]/g, "ا").replace(/[ى]/g, "ي").replace(/[ة]/g, "ه");
}

export function CrosswordRenderer({
  stage, onComplete, onWrong, attemptsLeft, maxAttempts, onPaidHint,
}: Props) {
  const androidStable = isAndroidUltraStableMode();
  const androidNative = isAndroidNativeApp();

  const { cells: grid, conflicts } = useMemo(() => buildGrid(stage), [stage]);
  const schemaIssues = useMemo(() => validateCrosswordStage(stage), [stage]);
  const blockingIssues = useMemo(
    () => [...conflicts, ...schemaIssues.map((i) => i.message)],
    [conflicts, schemaIssues],
  );

  const [entries, setEntries] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [activeClue, setActiveClue] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<null | { kind: "ok" | "err"; msg: string }>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const clueInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    setEntries({}); setDone(false); setActiveClue(null); setActiveCell(null); setFeedback(null);
    clueInputRefs.current = {};
  }, [stage]);

  const focusCell = useCallback((k: string) => {
    if (androidStable) {
      setActiveCell(k);
      return;
    }
    const el = inputsRef.current[k];
    if (el) {
      el.focus();
      if (!androidNative) el.select();
    }
    setActiveCell(k);
  }, [androidStable, androidNative]);

  const focusClue = useCallback((clueIdx: number) => {
    setActiveClue(clueIdx);
    const cells = clueCells(stage.clues[clueIdx]);
    // focus first empty cell, else first cell
    const first = cells.find(({ r, c }) => !entries[cellKey(r, c)]) ?? cells[0];
    focusCell(cellKey(first.r, first.c));
  }, [stage, entries, focusCell]);

  const advanceWithin = (clueIdx: number, fromKey: string, delta: 1 | -1) => {
    const cells = clueCells(stage.clues[clueIdx]);
    const i = cells.findIndex((c) => cellKey(c.r, c.c) === fromKey);
    const j = i + delta;
    if (j < 0 || j >= cells.length) return false;
    focusCell(cellKey(cells[j].r, cells[j].c));
    return true;
  };

  const setCell = (k: string, ch: string) => {
    const v = (ch || "").slice(-1);
    setEntries((prev) => ({ ...prev, [k]: v }));
    setFeedback(null);
    if (v) {
      sfx("ink_write");
      if (!androidStable && !androidNative && activeClue !== null) advanceWithin(activeClue, k, 1);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, k: string) => {
    if (androidNative && (e.key === "Backspace" || e.key.length === 1 || e.key === "Unidentified")) return;
    if (activeClue === null) return;
    const clue = stage.clues[activeClue];
    if (e.key === "Backspace") {
      if (entries[k]) {
        setEntries((prev) => ({ ...prev, [k]: "" }));
        const el = inputsRef.current[k];
        if (el) el.value = "";
      } else {
        advanceWithin(activeClue, k, -1);
      }
      e.preventDefault();
      return;
    }
    if (clue.direction === "across") {
      // Arabic / RTL: ArrowRight = previous letter, ArrowLeft = next letter
      if (e.key === "ArrowRight") { advanceWithin(activeClue, k, -1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { advanceWithin(activeClue, k, 1); e.preventDefault(); }
    } else {
      if (e.key === "ArrowUp") { advanceWithin(activeClue, k, -1); e.preventDefault(); }
      if (e.key === "ArrowDown") { advanceWithin(activeClue, k, 1); e.preventDefault(); }
    }
    if (e.key === "Enter") {
      // jump to next clue
      const nextIdx = (activeClue + 1) % stage.clues.length;
      focusClue(nextIdx);
      e.preventDefault();
    }
  };

  // ---- completion gating ----
  const filledCells = Object.values(entries).filter(Boolean).length;
  const totalCells = grid.size;
  const allFilled = filledCells >= totalCells;

  const collectEntries = () => {
    const latest = { ...entries };
    for (const [k, el] of Object.entries(inputsRef.current)) {
      if (el) latest[k] = (el.value || "").slice(-1);
    }
    return latest;
  };

  const check = () => {
    const latestEntries = collectEntries();
    setEntries(latestEntries);
    let correct = 0;
    grid.forEach((info, k) => { if ((latestEntries[k] ?? "") === info.expected) correct++; });
    const allRight = correct === totalCells;
    if (allRight && !done) {
      setDone(true);
      setFeedback({ kind: "ok", msg: "اكتمل المخطوط بدقة." });
      sfx("correct");
      sfx("gold_unlock");
      onComplete(100);
    } else {
      setFeedback({ kind: "err", msg: `لا تزال بعض الخانات غير صحيحة (${correct}/${totalCells}).` });
      sfx("wrong");
      onWrong?.();
    }
  };

  const checkAndroidPlain = () => {
    let correct = 0;
    const latest: Record<string, string> = {};
    stage.clues.forEach((clue, idx) => {
      const raw = clueInputRefs.current[idx]?.value ?? "";
      if (normalizeCrosswordText(raw) === normalizeCrosswordText(clue.answer)) correct++;
      const chars = raw.trim();
      clueCells(clue).forEach(({ r, c }, charIdx) => {
        const ch = chars[charIdx];
        if (ch) latest[cellKey(r, c)] = ch;
      });
    });
    setEntries(latest);
    if (correct === stage.clues.length && !done) {
      setDone(true);
      setFeedback({ kind: "ok", msg: "اكتمل المخطوط بدقة." });
      sfx("correct");
      sfx("gold_unlock");
      onComplete(100);
    } else {
      setFeedback({ kind: "err", msg: `لا تزال بعض الإجابات غير صحيحة (${correct}/${stage.clues.length}).` });
      sfx("wrong");
      onWrong?.();
    }
  };

  // ---- paid hint: reveal next unrevealed letter of the active clue ----
  // Predictable behaviour: always the first remaining letter from the start.
  const revealNextLetter = () => {
    if (activeClue === null) return;
    const clue = stage.clues[activeClue];
    const cells = clueCells(clue);
    const target = cells.find(({ r, c }) => {
      const k = cellKey(r, c);
      const exp = grid.get(k)?.expected;
      return exp && (entries[k] ?? "") !== exp;
    });
    if (!target) return;
    if (!onPaidHint || !onPaidHint(HINT_COST)) {
      setFeedback({ kind: "err", msg: `تحتاج ${HINT_COST} دينارًا لكشف الحرف.` });
      return;
    }
    const k = cellKey(target.r, target.c);
    const ch = grid.get(k)!.expected;
    setEntries((prev) => ({ ...prev, [k]: ch }));
    sfx("ink_write");
    focusCell(k);
  };


  // ---- render ----
  const activeKeys = activeClue !== null
    ? new Set(clueCells(stage.clues[activeClue]).map((p) => cellKey(p.r, p.c)))
    : new Set<string>();

  if (blockingIssues.length > 0) {
    return (
      <div className="relative irth-title-card overflow-hidden p-5">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div className="space-y-2 leading-7">
            <p className="font-bold text-red-200">شبكة الكلمات غير صالحة — تعذّر عرضها.</p>
            <ul className="list-disc space-y-1 pe-5 text-red-100/90">
              {blockingIssues.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
            <p className="text-[11px] text-red-200/70">
              يرجى تصحيح المحتوى في لوحة الإدارة قبل النشر. لا يُسمح بتعديل الإجابات تلقائيًا.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (androidNative) {
    return (
      <div className="relative irth-title-card overflow-hidden p-5" style={{ transform: "none", filter: "none", backdropFilter: "none" }}>
        <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
          <span className="inline-flex items-center gap-2 text-amber-300/80">
            <Feather className="h-3.5 w-3.5" />
            مخطوط الكلمات
          </span>
          {typeof attemptsLeft === "number" && typeof maxAttempts === "number" && (
            <AttemptsChip attemptsLeft={attemptsLeft} total={maxAttempts} />
          )}
        </div>

        <div className="space-y-3">
          {stage.clues.map((clue, idx) => (
            <label key={`${clue.direction}-${clue.number}`} className="block rounded-lg border border-amber-500/15 bg-slate-900/60 p-3">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300/80">
                {clue.direction === "across" ? "أفقي" : "عمودي"} · {clue.number}
              </span>
              <span className="mb-3 block text-sm leading-7 text-slate-200">{clue.hint}</span>
              <AndroidSafeInput
                ref={(el) => { clueInputRefs.current[idx] = el; }}
                type="text"
                name={`crossword-answer-${idx}`}
                defaultValue=""
                maxLength={clue.answer.length}
                disabled={done}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="اكتب الإجابة…"
                modalTitle={`إجابة ${clue.direction === "across" ? "أفقية" : "عمودية"} ${clue.number}`}
                modalLabel={clue.hint}
                className="block w-full rounded-lg border border-amber-500/25 bg-slate-950/75 px-3 py-3 text-base text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-400"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            onClick={checkAndroidPlain}
            disabled={done}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            {done ? <><Sparkles className="h-4 w-4" /> اكتمل المخطوط</> : <><Check className="h-4 w-4" /> تحقق</>}
          </button>
          {feedback && (
            <span className={`text-xs ${feedback.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>
              {feedback.msg}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (

    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.3em]">
        <span className="inline-flex items-center gap-2 text-amber-300/80">
          <Feather className="h-3.5 w-3.5" />
          مخطوط الكلمات
        </span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          {typeof attemptsLeft === "number" && typeof maxAttempts === "number" && (
            <AttemptsChip attemptsLeft={attemptsLeft} total={maxAttempts} />
          )}
          <span className="text-slate-400 text-[11px]">
            {filledCells}/{totalCells} خانة
          </span>
        </span>
      </div>

      {activeClue !== null && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <div className="flex-1">
            <span className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80">
              {stage.clues[activeClue].direction === "across" ? "أفقي" : "عمودي"} · {stage.clues[activeClue].number}
            </span>
            <p className="mt-1 leading-7">{stage.clues[activeClue].hint}</p>
          </div>
          <button
            type="button"
            onClick={revealNextLetter}
            disabled={done}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/25 disabled:opacity-40"
            aria-label="كشف الحرف التالي"
            title="يكشف أوّل حرف غير مكتشف من بداية الإجابة."
          >
            <Lightbulb className="h-3.5 w-3.5" />
            كشف الحرف ({HINT_COST} دينار)
          </button>
        </div>
      )}


      <div className="relative mb-4 overflow-x-auto rounded-xl irth-parchment p-3">
        <div className="absolute inset-0 pointer-events-none rounded-xl border border-amber-700/20" />
        <div
          className="relative inline-grid gap-[2px]"
          style={{ gridTemplateColumns: `repeat(${stage.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: stage.rows * stage.cols }).map((_, idx) => {
            const r = Math.floor(idx / stage.cols);
            const c = idx % stage.cols;
            const k = cellKey(r, c);
            const info = grid.get(k);
            const clueNum = stage.clues.find((cl) => cl.row === r && cl.col === c)?.number;
            if (!info) {
              return <div key={k} className="aspect-square w-9 rounded-sm bg-amber-900/30" />;
            }
            const value = entries[k] ?? "";
            const isCorrect = value && value === info.expected;
            const isActiveClue = activeKeys.has(k);
            const isActiveCell = activeCell === k;
            return (
              <div
                key={k}
                onClick={() => {
                  // pick a clue that uses this cell — prefer one matching current direction
                  const ids = info.clueIds;
                  let pick = ids[0];
                  if (activeClue !== null && ids.includes(activeClue) && ids.length > 1) {
                    // toggle direction when re-tapping
                    pick = ids.find((i) => i !== activeClue) ?? activeClue;
                  } else if (activeClue !== null && ids.includes(activeClue)) {
                    pick = activeClue;
                  }
                  setActiveClue(pick);
                  focusCell(k);
                }}
                className={`irth-ink-cell relative aspect-square w-9 rounded-sm border bg-[#fdf6e3] text-slate-950
                  ${isCorrect ? "is-correct" : ""}
                  ${isActiveCell ? "ring-2 ring-amber-500 border-amber-500" : isActiveClue ? "border-amber-400/70 bg-amber-100/80" : "border-amber-700/30"}
                `}
              >
                {clueNum !== undefined && (
                  <span className="absolute right-0.5 top-0 text-[8px] font-bold text-amber-800/80">{clueNum}</span>
                )}
                <AndroidSafeInput
                  ref={(el) => { inputsRef.current[k] = el; }}
                  maxLength={1}
                  value={value}
                  onValueChange={(next) => setCell(k, next)}
                  commitMode="blur"
                  onKeyDown={(e) => onKeyDown(e, k)}
                  onFocus={() => { if (activeCell !== k) setActiveCell(k); }}
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="h-full w-full bg-transparent text-center text-base font-bold uppercase focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ClueList
          title="أفقي"
          clues={stage.clues.map((c, i) => ({ c, i })).filter((x) => x.c.direction === "across")}
          activeClue={activeClue}
          entries={entries}
          grid={grid}
          onPick={focusClue}
        />
        <ClueList
          title="عمودي"
          clues={stage.clues.map((c, i) => ({ c, i })).filter((x) => x.c.direction === "down")}
          activeClue={activeClue}
          entries={entries}
          grid={grid}
          onPick={focusClue}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          onClick={check}
          disabled={done}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {done ? <><Sparkles className="h-4 w-4" /> اكتمل المخطوط</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
        {!done && !allFilled && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-300/70" />
            أكمل جميع الخانات قبل التحقق ({filledCells}/{totalCells}).
          </span>
        )}
        {feedback && (
          <span className={`text-xs ${feedback.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>
            {feedback.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function ClueList({ title, clues, activeClue, entries, grid, onPick }: {
  title: string;
  clues: { c: CrosswordClue; i: number }[];
  activeClue: number | null;
  entries: Record<string, string>;
  grid: Map<string, CellInfo>;
  onPick: (clueIdx: number) => void;
}) {
  return (
    <div className="rounded-lg border border-amber-500/15 bg-slate-900/60 p-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300/80">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {clues.map(({ c, i }) => {
          const cells = clueCells(c);
          const solved = cells.every(({ r, co }: any) => true) && cells.every((p) => {
            const k = cellKey(p.r, p.c);
            return (entries[k] ?? "") === grid.get(k)?.expected;
          });
          const isActive = activeClue === i;
          return (
            <li key={`${c.direction}-${c.number}`}>
              <button
                onClick={() => onPick(i)}
                className={`block w-full rounded-md px-2 py-1.5 text-right transition ${
                  isActive
                    ? "bg-amber-500/15 text-amber-100"
                    : solved
                      ? "text-emerald-300/80"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-amber-200"
                }`}
              >
                <span className="font-bold text-amber-300">{c.number}.</span> {c.hint}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
