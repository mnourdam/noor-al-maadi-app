// ============================================================
// Activity Renderers for Imported Campaigns
// ------------------------------------------------------------
// Each renderer notifies the parent via `onResolve(correct)`.
// - Correct answer: resolves the activity permanently.
// - Wrong answer: shows feedback, lets the user retry,
//   notifies the parent (so a heart can be deducted).
// ============================================================

import { useMemo, useRef, useState } from "react";
import { Check, X, HelpCircle, Lightbulb } from "lucide-react";
import { AndroidSafeInput, AndroidSafeTextarea } from "@/components/AndroidSafeTextInput";
import { isAndroidNativeApp } from "@/lib/androidFreezeDiagnostics";
import type { CampaignActivity } from "@/types/campaign";


export interface RendererProps {
  activity: CampaignActivity;
  onResolve: (correct: boolean) => void;
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
    <div className={`mt-3 rounded-xl border px-3 py-2 text-[12px] ${cls}`}>
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
function MultipleChoiceRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [wrongPicks, setWrongPicks] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);
  const options = activity.options ?? [];

  if (!options.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const correctIndex = typeof activity.correctAnswer === "number"
    ? activity.correctAnswer
    : options.findIndex(o => o === String(activity.correctAnswer));

  const submit = () => {
    if (picked === null || resolved) return;
    const isCorrect = picked === correctIndex;
    if (isCorrect) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
    } else {
      // Wrong: mark this option as tried, allow retry, do NOT reveal correct.
      setWrongPicks(prev => new Set(prev).add(picked));
      setFeedback("err");
      setPicked(null);
      onResolve(false);
    }
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isPicked  = picked === i;
          const isAnswer  = resolved && i === correctIndex;
          const isWrong   = wrongPicks.has(i) && !resolved;
          return (
            <button
              key={`${i}-${opt}`}
              disabled={resolved || isWrong}
              onClick={() => { setPicked(i); setFeedback(null); }}
              className={`w-full rounded-xl border px-3 py-2 text-right text-[12px] transition ${
                isAnswer ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
                : isWrong ? "border-red-400/50 bg-red-500/10 text-red-200/70 line-through opacity-60"
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
      {!resolved && (
        <button
          onClick={submit}
          disabled={picked === null}
          className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50"
        >
          تحقق من الإجابة
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

// ---------- True / False ----------
function TrueFalseRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);
  const correct = typeof activity.correctAnswer === "boolean"
    ? activity.correctAnswer
    : String(activity.correctAnswer).toLowerCase() === "true";

  const submit = (val: boolean) => {
    if (resolved) return;
    if (val === correct) {
      setResolved(true);
      setFeedback("ok");
      onResolve(true);
    } else {
      // Wrong: allow retry, do not lock, do not reveal correct.
      setFeedback("err");
      onResolve(false);
    }
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((val) => {
          const isCorrect = resolved && val === correct;
          return (
            <button
              key={String(val)}
              disabled={resolved}
              onClick={() => submit(val)}
              className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
                isCorrect ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
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
            : (activity.feedbackWrong ?? FALLBACK_WRONG)}
        />
      )}
    </div>
  );
}

// ---------- Arrange Events ----------
function ArrangeEventsRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const correctOrder = activity.correctOrder ?? activity.options ?? [];
  const [order, setOrder] = useState<string[]>(() => shuffle(correctOrder));
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const [feedback, setFeedback] = useState<"ok" | "err" | null>(alreadyDone ? "ok" : null);

  if (!correctOrder.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const move = (idx: number, dir: -1 | 1) => {
    if (resolved) return;
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
    setFeedback(null);
  };

  const submit = () => {
    if (resolved) return;
    const isCorrect = order.every((v, i) => v === correctOrder[i]);
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
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <ol className="space-y-2">
        {order.map((item, i) => (
          <li key={item + i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2 py-2 text-[12px]">
            <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-[11px] text-gold">{i + 1}</span>
            <span className="flex-1">{item}</span>
            <button disabled={resolved} onClick={() => move(i, -1)} className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] disabled:opacity-30">▲</button>
            <button disabled={resolved} onClick={() => move(i, +1)} className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] disabled:opacity-30">▼</button>
          </li>
        ))}
      </ol>
      <HintRow hint={activity.hint} />
      {!resolved && (
        <button onClick={submit} className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold">
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
    <div>
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
    <div>
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
          className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50"
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
    <div>
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
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
        />
      )}

      <HintRow hint={activity.hint} />
      {!resolved && (
        <button onClick={submit} className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
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
  const [resolved, setResolved] = useState(alreadyDone ?? false);

  const submit = () => {
    if (resolved) return;
    setVal(textareaRef.current?.value ?? val);
    setResolved(true);
    onResolve(true);
  };

  return (
    <div>
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
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
        />
      )}

      {!resolved && (
        <button onClick={submit} className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
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
    <div>
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
        <button onClick={() => { setResolved(true); onResolve(true); }} className="mt-3 w-full rounded-xl border border-gold/40 bg-gold/10 py-2 text-xs font-bold text-gold">
          تم — وضع علامة كمكتمل
        </button>
      )}
      {resolved && <FeedbackBanner kind="ok" text="تم تسجيل الإكمال." />}
    </div>
  );
}

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
    case "reflection_prompt":     return <ReflectionRenderer {...props} />;
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
