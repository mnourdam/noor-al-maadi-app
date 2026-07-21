import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, Sparkles, Hourglass, GripVertical, AlertTriangle } from "lucide-react";
import type { ChronologyStage } from "@/lib/games/types";
import { sfx } from "./sfx";
import { AttemptsChip } from "./AttemptsChip";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  stage: ChronologyStage;
  onComplete: (score: number) => void;
  onWrong?: () => void;
  attemptsLeft?: number;
  maxAttempts?: number;
}


function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reshuffle `prev` so the result differs from both `prev` and the sorted
 * correct order whenever more than one arrangement is possible. Deterministic
 * fallback prevents infinite loops if the pool is tiny.
 */
export function reshuffleDistinct(prev: number[], correct: number[]): number[] {
  if (prev.length <= 1) return prev.slice();
  for (let attempt = 0; attempt < 12; attempt++) {
    const next = shuffle(prev);
    const sameAsPrev = next.every((v, i) => v === prev[i]);
    const sameAsCorrect = next.every((v, i) => v === correct[i]);
    if (!sameAsPrev && !sameAsCorrect) return next;
  }
  // Deterministic fallback: rotate by one.
  const rotated = prev.slice(1).concat(prev[0]);
  return rotated;
}

export function ChronologyRenderer({ stage, onComplete, onWrong, attemptsLeft, maxAttempts }: Props) {
  const initial = useMemo(() => shuffle(stage.events.map((_, i) => i)), [stage]);
  const correctOrder = useMemo(
    () =>
      stage.events
        .map((e, i) => ({ i, year: e.year }))
        .sort((a, b) => a.year - b.year)
        .map((x) => x.i),
    [stage],
  );
  const [order, setOrder] = useState<number[]>(initial);
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const [done, setDone] = useState(false);
  // `awaitingRetry` is true after an incorrect submit: "تحقق" is hidden
  // and "أعد المحاولة" is shown. Prevents double-tap re-verification.
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    setOrder(initial);
    setChecked(null);
    setDone(false);
    setAwaitingRetry(false);
    busyRef.current = false;
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (done || awaitingRetry) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(Number(active.id));
    const to = order.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    setOrder(arrayMove(order, from, to));
    setChecked(null);
    sfx("timeline_snap");
  };

  const check = () => {
    if (done || awaitingRetry || busyRef.current) return;
    busyRef.current = true;
    const results = order.map((id, idx) => id === correctOrder[idx]);
    setChecked(results);
    const allRight = results.every(Boolean);
    if (allRight) {
      setDone(true);
      sfx("correct");
      sfx("gold_unlock");
      onComplete(100);
    } else {
      sfx("wrong");
      onWrong?.();
      setAwaitingRetry(true);
    }
    // Release guard on next frame so rapid double-taps collapse to one action.
    requestAnimationFrame(() => { busyRef.current = false; });
  };

  const retry = () => {
    if (done || busyRef.current) return;
    busyRef.current = true;
    setOrder((prev) => reshuffleDistinct(prev, correctOrder));
    setChecked(null);
    setAwaitingRetry(false);
    requestAnimationFrame(() => { busyRef.current = false; });
  };



  return (
    <div className="relative irth-title-card overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-amber-300/80">
          <Hourglass className="h-3.5 w-3.5" />
          الخط الزمني
        </div>
        <div className="flex items-center gap-2">
          {stage.prompt && <span className="text-[11px] text-slate-400">{stage.prompt}</span>}
          {typeof attemptsLeft === "number" && typeof maxAttempts === "number" && (
            <AttemptsChip attemptsLeft={attemptsLeft} total={maxAttempts} />
          )}
        </div>

      </div>

      <p className="mb-3 text-[11px] text-slate-500">
        اسحب البطاقة بإصبعك (أو امسكها للحظة) ورتّبها من الأقدم إلى الأحدث.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="relative space-y-2 ps-8">
            <span className="absolute right-3 top-2 bottom-2 w-px bg-gradient-to-b from-amber-500/60 via-amber-500/25 to-amber-500/60" aria-hidden />
            {order.map((id, idx) => (
              <SortableRow
                key={id}
                id={id}
                index={idx}
                status={checked?.[idx]}
                label={stage.events[id].label}
                year={checked ? formatYear(stage.events[id].year, stage.events[id].era) : null}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={check}
          disabled={done}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {done ? <><Sparkles className="h-4 w-4" /> اكتمل التسلسل</> : <><Check className="h-4 w-4" /> تحقق</>}
        </button>
        {checked && !done && (
          <span className="inline-flex items-center gap-1.5 text-xs text-red-300">
            <X className="h-3 w-3" /> أعد ترتيب البطاقات وحاول مجدّدًا.
          </span>
        )}
        {!checked && !done && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertTriangle className="h-3 w-3 text-amber-300/70" /> رتّب جميع البطاقات ثم اضغط تحقق.
          </span>
        )}
      </div>
    </div>
  );
}

function formatYear(year: number, era?: string) {
  const base = year < 0 ? `${-year} ق.م` : `${year}م`;
  return era ? `${base} · ${era}` : base;
}

function SortableRow({ id, index, status, label, year }: {
  id: number;
  index: number;
  status: boolean | undefined;
  label: string;
  year: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(251,191,36,0.5)" : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-3 rounded-lg border p-3 ${
        status === undefined ? "border-slate-700 bg-slate-900/70"
          : status ? "border-emerald-500/40 bg-emerald-500/10 irth-gold-glow"
          : "border-red-500/40 bg-red-500/10 irth-shake"
      } ${isDragging ? "cursor-grabbing" : ""}`}
    >
      <span className="absolute -right-[26px] grid h-5 w-5 place-items-center rounded-full border border-amber-500/60 bg-slate-950 text-[10px] font-bold text-amber-200 shadow-[0_0_0_3px_rgba(2,6,23,1)]">
        {index + 1}
      </span>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="اسحب لإعادة الترتيب"
        className="grid h-9 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-md border border-amber-500/30 bg-slate-950/60 text-amber-300/80 hover:border-amber-400"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <div className="text-sm text-slate-100">{label}</div>
        {year && <div className="mt-0.5 text-[11px] text-amber-300/80">{year}</div>}
      </div>
    </li>
  );
}
