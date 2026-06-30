// ============================================================
// Activity Renderers for Imported Campaigns
// ------------------------------------------------------------
// Each renderer notifies the parent via `onResolve(correct)`.
// - Correct answer: resolves the activity permanently.
// - Wrong answer: shows feedback, lets the user retry,
//   notifies the parent (so a heart can be deducted).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X, HelpCircle, Lightbulb, GripVertical } from "lucide-react";
import { AndroidSafeInput, AndroidSafeTextarea } from "@/components/AndroidSafeTextInput";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";
import type { CampaignActivity } from "@/types/campaign";
import { sfx as gameSfx } from "@/components/games/sfx";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
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
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


export interface ResolveMeta {
  /** True when the answer was revealed after 2 wrong attempts (learning path). */
  viaReveal?: boolean;
}

export interface RendererProps {
  activity: CampaignActivity;
  /**
   * Notifies the parent of an answer attempt.
   * - `correct=true`  → activity is resolved (parent advances + rewards).
   * - `correct=false` → wrong attempt (parent deducts a heart).
   * - `meta.viaReveal=true` paired with `correct=true` means the player is
   *   advancing via the "متابعة" button after the answer was auto-revealed,
   *   so the parent should apply the minimum reward tier.
   */
  onResolve: (correct: boolean, meta?: ResolveMeta) => void;
  alreadyDone?: boolean;
}

const FALLBACK_WRONG = "إجابة غير صحيحة، حاول مرة أخرى.";
const FALLBACK_OK = "أحسنت، إجابة صحيحة.";

function FeedbackBanner({ kind, text }: { kind: "ok" | "err"; text?: string }) {
  if (!text) return null;
  const cls = kind === "ok"
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-red-400/40 bg-red-500/10 text-red-200";
  return (
    <div key={`${kind}:${text}`} className={`motion-toast mt-3 rounded-xl border px-3 py-2 text-[12px] ${cls}`}>
      {kind === "ok" ? <Check className="me-1 inline size-3.5" /> : <X className="me-1 inline size-3.5" />}
      {text}
    </div>
  );
}

function ContextBlock({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="parchment-dark mb-4 rounded-2xl border border-gold/25 p-4 text-[12px] leading-7 text-foreground/90">
      {text}
    </div>
  );
}

function PromptBlock({ activity }: { activity: CampaignActivity }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <HelpCircle className="mt-0.5 size-4 shrink-0 text-gold" />
      <p className="font-display text-[13px] font-bold leading-relaxed">{activity.prompt}</p>
    </div>
  );
}

function HintRow({ hint }: { hint?: string }) {
  const [open, setOpen] = useState(false);
  if (!hint) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 text-[11px] text-amber-300/80">
        <Lightbulb className="size-3" /> {open ? "إخفاء التلميح" : "إظهار تلميح"}
      </button>
      {open && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}


// ---------- Multiple Choice / Reading-then-question ----------
// Learning-after-failure flow:
//   1st wrong → keep open, show "حاول مرة أخرى" (heart consumed by parent).
//   2nd wrong → reveal correct answer, highlight wrong picks, lock the
//   question, surface a "متابعة" button. The player learns the correct
//   answer before moving on; parent applies the minimum reward tier.
function MultipleChoiceRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [revealed, setRevealed] = useState(false);
  const [wrongPicks, setWrongPicks] = useState<Set<number>>(new Set());
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);
  const options = activity.options ?? [];

  if (!options.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const correctIndex = typeof activity.correctAnswer === "number"
    ? activity.correctAnswer
    : options.findIndex(o => o === String(activity.correctAnswer));

  const locked = resolved || revealed;

  const submit = () => {
    if (picked === null || locked) return;
    const isCorrect = picked === correctIndex;
    if (isCorrect) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
      return;
    }
    // Wrong answer.
    const nextWrong = wrongCount + 1;
    setWrongPicks(prev => new Set(prev).add(picked));
    setWrongCount(nextWrong);
    setPicked(null);
    if (nextWrong >= 2) {
      // Second strike → reveal & lock. Parent still deducts the heart.
      setRevealed(true);
      setFeedback("err");
      onResolve(false);
    } else {
      setFeedback("err");
      onResolve(false);
    }
  };

  const continueAfterReveal = () => {
    if (!revealed || resolved) return;
    setResolved(true);
    onResolve(true, { viaReveal: true });
  };

  const wrapperCls = feedback === "ok"
    ? "motion-page motion-correct-pop"
    : wrongCount > 0 && feedback === "err"
      ? "motion-page motion-shake"
      : "motion-page";

  return (
    <div className={wrapperCls} key={`${activity.id}:${wrongCount}:${feedback ?? "_"}`}>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isPicked  = picked === i;
          const isAnswer  = (resolved || revealed) && i === correctIndex;
          // Once revealed, show ALL wrong picks in red. Pre-reveal, only the
          // most recent wrong pick stays disabled.
          const isWrong   = wrongPicks.has(i) && i !== correctIndex;
          const wrongStyle = isWrong && (revealed
            ? "border-red-400/70 bg-red-500/15 text-red-100"
            : "border-red-400/50 bg-red-500/10 text-red-200/70 line-through opacity-60");
          return (
            <button
              key={`${i}-${opt}`}
              disabled={locked || isWrong}
              onClick={() => { setPicked(i); setFeedback(null); }}
              className={`motion-tap w-full rounded-xl border px-3 py-2 text-right text-[12px] transition ${
                isAnswer ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                : isWrong ? wrongStyle
                : isPicked ? "border-gold/60 bg-gold/10 text-foreground"
                : "border-white/10 bg-black/30 text-foreground/90 hover:border-gold/40"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <HintRow hint={activity.hint} />
      {!locked && (
        <button
          onClick={submit}
          disabled={picked === null}
          className="motion-tap mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          تحقق من الإجابة
        </button>
      )}
      {feedback && (
        <FeedbackBanner
          kind={feedback}
          text={feedback === "ok"
            ? (activity.feedbackCorrect ?? FALLBACK_OK)
            : revealed
              ? "هذه هي الإجابة الصحيحة. تابع لرحلتك."
              : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
      {revealed && !resolved && (
        <button
          onClick={continueAfterReveal}
          className="motion-tap motion-reveal is-in mt-3 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold"
        >
          متابعة
        </button>
      )}
    </div>
  );
}

// ---------- True / False ----------
// Same learning-after-failure flow as Multiple Choice: 1st wrong stays open,
// 2nd wrong reveals the answer and surfaces "متابعة".
function TrueFalseRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [revealed, setRevealed] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongPick, setWrongPick] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);
  const correct = typeof activity.correctAnswer === "boolean"
    ? activity.correctAnswer
    : String(activity.correctAnswer).toLowerCase() === "true";

  const locked = resolved || revealed;

  const submit = (val: boolean) => {
    if (locked) return;
    if (val === correct) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
      return;
    }
    const nextWrong = wrongCount + 1;
    setWrongCount(nextWrong);
    setWrongPick(val);
    setFeedback("err");
    if (nextWrong >= 2) setRevealed(true);
    onResolve(false);
  };

  const continueAfterReveal = () => {
    if (!revealed || resolved) return;
    setResolved(true);
    onResolve(true, { viaReveal: true });
  };

  const wrapperCls = feedback === "ok"
    ? "motion-page motion-correct-pop"
    : wrongCount > 0 && feedback === "err"
      ? "motion-page motion-shake"
      : "motion-page";
  return (
    <div className={wrapperCls} key={`${activity.id}:${wrongCount}:${feedback ?? "_"}`}>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((val) => {
          const isCorrectChoice = (resolved || revealed) && val === correct;
          const isWrongChoice = revealed && val !== correct && wrongPick === val;
          return (
            <button
              key={String(val)}
              disabled={locked}
              onClick={() => submit(val)}
              className={`motion-tap rounded-xl border px-3 py-3 text-sm font-bold transition ${
                isCorrectChoice ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                : isWrongChoice ? "border-red-400/70 bg-red-500/15 text-red-100"
                : "border-white/10 bg-black/30 hover:border-gold/40"
              }`}
            >
              {val ? "صحيح" : "خطأ"}
            </button>
          );
        })}
      </div>
      <HintRow hint={activity.hint} />
      {feedback && (
        <FeedbackBanner
          kind={feedback}
          text={feedback === "ok"
            ? (activity.feedbackCorrect ?? FALLBACK_OK)
            : revealed
              ? "هذه هي الإجابة الصحيحة. تابع لرحلتك."
              : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
      {revealed && !resolved && (
        <button
          onClick={continueAfterReveal}
          className="motion-tap motion-reveal is-in mt-3 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold"
        >
          متابعة
        </button>
      )}
    </div>
  );
}

// ---------- Arrange Events ----------
function ArrangeEventsRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const correctOrder = activity.correctOrder ?? activity.options ?? [];
  // Stable item ids so dnd-kit can track items even when labels repeat.
  const items = useMemo(
    () => correctOrder.map((label, i) => ({ id: `evt-${i}`, label })),
    [correctOrder],
  );
  const [order, setOrder] = useState<string[]>(() => shuffle(items.map((it) => it.id)));
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!correctOrder.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const labelById = (id: string) => items.find((it) => it.id === id)?.label ?? "";

  const move = (idx: number, dir: -1 | 1) => {
    if (resolved) return;
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    setOrder(arrayMove(order, idx, j));
    setFeedback(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (resolved) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setOrder(arrayMove(order, from, to));
    setFeedback(null);
  };

  const submit = () => {
    if (resolved) return;
    const current = order.map(labelById);
    const isCorrect = current.every((v, i) => v === correctOrder[i]);
    if (isCorrect) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
    } else {
      setFeedback("err");
      onResolve(false);
    }
  };

  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <p className="mb-2 text-[11px] text-white/55">
        اسحب البطاقة بإصبعك (أو امسكها للحظة) ورتّب الأحداث.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {order.map((id, i) => (
              <SortableArrangeRow
                key={id}
                id={id}
                index={i}
                label={labelById(id)}
                disabled={resolved}
                onMove={(dir) => move(i, dir)}
                canMoveUp={i > 0}
                canMoveDown={i < order.length - 1}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <HintRow hint={activity.hint} />
      {!resolved && (
        <button onClick={submit} className="motion-tap mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold">
          تحقق من الترتيب
        </button>
      )}
      {feedback && (
        <FeedbackBanner
          kind={feedback}
          text={feedback === "ok"
            ? (activity.feedbackCorrect ?? "ترتيب صحيح.")
            : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
    </div>
  );
}

function SortableArrangeRow({
  id, index, label, disabled, onMove, canMoveUp, canMoveDown,
}: {
  id: string;
  index: number;
  label: string;
  disabled: boolean;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,55,0.5)" : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border bg-black/30 px-2 py-2 text-[12px] ${
        isDragging ? "border-gold/60" : "border-white/10"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label="اسحب لإعادة الترتيب"
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-md border border-gold/30 bg-black/40 text-gold/80 disabled:opacity-40"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-gold/15 text-[11px] text-gold">{index + 1}</span>
      <span className="flex-1 min-w-0">{label}</span>
      <button
        type="button"
        disabled={disabled || !canMoveUp}
        onClick={() => onMove(-1)}
        aria-label="نقل لأعلى"
        className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
      >▲</button>
      <button
        type="button"
        disabled={disabled || !canMoveDown}
        onClick={() => onMove(+1)}
        aria-label="نقل لأسفل"
        className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
      >▼</button>
    </li>
  );
}

// ---------- Decision Choice (no wrong answer) ----------
function DecisionRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const options = activity.options ?? [];
  if (!options.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const submit = (i: number) => {
    if (resolved) return;
    setPicked(i);
    setResolved(true);
    onResolve(true);
  };

  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            disabled={resolved}
            onClick={() => submit(i)}
            className={`w-full rounded-xl border px-3 py-2 text-right text-[12px] transition ${
              resolved && picked === i
                ? "border-gold/60 bg-gold/15 text-gold"
                : "border-white/10 bg-black/30 hover:border-gold/40"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      {resolved && (
        <FeedbackBanner kind="ok" text={activity.feedbackCorrect ?? "اختيارك مسجَّل في رحلتك."} />
      )}
    </div>
  );
}

// ---------- Match Pairs ----------
function MatchPairsRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const pairs = activity.pairs ?? [];
  const rights = useMemo(() => shuffle(pairs.map(p => p.right)), [pairs]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);

  if (!pairs.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const submit = () => {
    if (resolved) return;
    const ok = pairs.every(p => mapping[p.left] === p.right);
    if (ok) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
    } else {
      setFeedback("err");
      onResolve(false);
    }
  };

  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="space-y-2">
        {pairs.map((p) => (
          <div key={p.left} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-[12px]">
            <span className="flex-1 font-bold text-gold/90">{p.left}</span>
            <span className="text-muted-foreground">↔</span>
            <select
              disabled={resolved}
              value={mapping[p.left] ?? ""}
              onChange={(e) => { setMapping(m => ({ ...m, [p.left]: e.target.value })); setFeedback(null); }}
              className="flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-foreground outline-none"
            >
              <option value="" className="bg-[#0a0f1e]">— اختر —</option>
              {rights.map(r => <option key={r} value={r} className="bg-[#0a0f1e]">{r}</option>)}
            </select>
          </div>
        ))}
      </div>
      <HintRow hint={activity.hint} />
      {!resolved && (
        <button
          onClick={submit}
          disabled={Object.keys(mapping).length < pairs.length}
          className="motion-tap mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          تحقق من المطابقة
        </button>
      )}
      {feedback && (
        <FeedbackBanner
          kind={feedback}
          text={feedback === "ok"
            ? (activity.feedbackCorrect ?? FALLBACK_OK)
            : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
    </div>
  );
}

// ---------- Fill in the Blank ----------
function FillBlankRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const disableCampaignFocusLogic = isAndroidFocusABDisabled("disableCampaignFocusLogic");
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);
  const correct = String(activity.correctAnswer ?? "").trim().toLowerCase();

  const submit = () => {
    if (resolved) return;
    const current = inputRef.current?.value ?? val;
    setVal(current);
    const ok = correct.length > 0 && current.trim().toLowerCase() === correct;
    if (ok) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
    } else {
      setFeedback("err");
      onResolve(false);
    }
  };

  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      {isAndroidNativeApp() ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue=""
          disabled={resolved}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="اكتب إجابتك…"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
          data-irth-ab-campaign-focus-disabled={disableCampaignFocusLogic ? "true" : undefined}
          style={{ transform: "none", filter: "none", backdropFilter: "none", transition: "none", animation: "none" }}
        />
      ) : (
        <AndroidSafeInput
          ref={inputRef}
          value={val}
          onValueChange={(next) => { setVal(next); setFeedback(null); }}
          commitMode="blur"
          disabled={resolved}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="اكتب إجابتك…"
          modalTitle="إجابة النشاط"
          modalLabel="اكتب إجابتك ثم اضغط حفظ"
          androidEntryKey={`campaign.fillBlank.${activity.id}`}
          data-irth-ab-campaign-focus-disabled={disableCampaignFocusLogic ? "true" : undefined}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
        />
      )}

      <HintRow hint={activity.hint} />
      {!resolved && (
        <button onClick={submit} className="motion-tap mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
          تحقق
        </button>
      )}
      {feedback && (
        <FeedbackBanner
          kind={feedback}
          text={feedback === "ok"
            ? (activity.feedbackCorrect ?? FALLBACK_OK)
            : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
    </div>
  );
}

// ---------- Reflection ----------
function ReflectionRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [val, setVal] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const disableCampaignFocusLogic = isAndroidFocusABDisabled("disableCampaignFocusLogic");
  const [resolved, setResolved] = useState(alreadyDone ?? false);

  const submit = () => {
    if (resolved) return;
    setVal(textareaRef.current?.value ?? val);
    setResolved(true);
    onResolve(true);
  };

  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      {isAndroidNativeApp() ? (
        <textarea
          ref={textareaRef}
          defaultValue=""
          disabled={resolved}
          rows={4}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="تأمّلك الشخصي…"
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
          data-irth-ab-campaign-focus-disabled={disableCampaignFocusLogic ? "true" : undefined}
          style={{ transform: "none", filter: "none", backdropFilter: "none", transition: "none", animation: "none" }}
        />
      ) : (
        <AndroidSafeTextarea
          ref={textareaRef}
          value={val}
          onValueChange={setVal}
          commitMode="blur"
          disabled={resolved}
          rows={4}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="تأمّلك الشخصي…"
          modalTitle="تأمّل النشاط"
          modalLabel="اكتب تأملك ثم اضغط حفظ"
          androidEntryKey={`campaign.reflection.${activity.id}`}
          data-irth-ab-campaign-focus-disabled={disableCampaignFocusLogic ? "true" : undefined}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
        />
      )}

      {!resolved && (
        <button onClick={submit} className="motion-tap mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
          سجّل تأمّلك
        </button>
      )}
      {resolved && <FeedbackBanner kind="ok" text={activity.feedbackCorrect ?? "شكرًا على تأمّلك."} />}
    </div>
  );
}

// ---------- Fallback ----------
function FallbackRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      {activity.options && activity.options.length > 0 && (
        <ul className="mb-3 list-disc space-y-1 pr-5 text-[12px] text-muted-foreground">
          {activity.options.map((o, i) => <li key={i}>{o}</li>)}
        </ul>
      )}
      <p className="text-[11px] text-amber-300/80">
        نشاطٌ تأمّلي — لا توجد إجابة آلية. يُحتسب عند الإكمال.
      </p>
      {!resolved && (
        <button onClick={() => { setResolved(true); onResolve(true); }} className="motion-tap mt-3 w-full rounded-xl border border-gold/40 bg-gold/10 py-2 text-xs font-bold text-gold">
          تم — وضع علامة كمكتمل
        </button>
      )}
      {resolved && <FeedbackBanner kind="ok" text="تم تسجيل الإكمال." />}
    </div>
  );
}

// ---------- Beta: skipped reflection ----------
// Reflection prompts are temporarily hidden behind VITE_BETA_HIDE_REFLECTIONS
// (default ON for beta). The infrastructure stays — long-term we convert these
// into an optional "مذكرة المؤرخ" historian journal. We never block chapter
// completion: the activity auto-resolves so progression continues normally.
function ReflectionSkippedRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  useEffect(() => {
    if (!resolved) { setResolved(true); onResolve(true); }
  }, [resolved, onResolve]);
  return (
    <div className="motion-page">
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <p className="mt-2 rounded-xl border border-amber-300/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-6 text-amber-200/85">
        مذكرة المؤرخ — تأمّل اختياري سيُتاح قريبًا في صفحة الملف.
      </p>
    </div>
  );
}

const HIDE_REFLECTIONS =
  (import.meta.env.VITE_BETA_HIDE_REFLECTIONS ?? "true").toString() === "true";

// ---------- Dispatcher ----------
export function ActivityRenderer(props: RendererProps) {
  const { activity } = props;
  switch (activity.type) {
    case "reading_then_question":
    case "multiple_choice":       return <MultipleChoiceRenderer {...props} />;
    case "true_false":            return <TrueFalseRenderer {...props} />;
    case "arrange_events":        return <ArrangeEventsRenderer {...props} />;
    case "decision_choice":       return <DecisionRenderer {...props} />;
    case "match_pairs":           return <MatchPairsRenderer {...props} />;
    case "fill_blank":            return <FillBlankRenderer {...props} />;
    case "reflection_prompt":     return HIDE_REFLECTIONS
                                    ? <ReflectionSkippedRenderer {...props} />
                                    : <ReflectionRenderer {...props} />;
    default:                      return <FallbackRenderer {...props} />;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
