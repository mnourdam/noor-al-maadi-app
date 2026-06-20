// ============================================================
// Activity Renderers for Imported Campaigns
// ------------------------------------------------------------
// One small component per supported activity type. Each renderer
// owns its UI + answer-check logic, then notifies the parent via
// `onResolve(correct)` so the player can award XP / hearts.
//
// Renderers degrade gracefully: any malformed/missing field
// falls back to a "mark complete" CTA so a bad import never
// breaks the chapter.
// ============================================================

import { useMemo, useState } from "react";
import { Check, X, HelpCircle, Lightbulb } from "lucide-react";
import type { CampaignActivity } from "@/types/campaign";

export interface RendererProps {
  activity: CampaignActivity;
  onResolve: (correct: boolean) => void;
  alreadyDone?: boolean;
}

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
  const options = activity.options ?? [];

  if (!options.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const correctIndex = typeof activity.correctAnswer === "number"
    ? activity.correctAnswer
    : options.findIndex(o => o === String(activity.correctAnswer));

  const submit = () => {
    if (picked === null || resolved) return;
    const isCorrect = picked === correctIndex;
    setResolved(true);
    onResolve(isCorrect);
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const isAnswer = resolved && i === correctIndex;
          const isWrong  = resolved && isPicked && i !== correctIndex;
          return (
            <button
              key={`${i}-${opt}`}
              disabled={resolved}
              onClick={() => setPicked(i)}
              className={`w-full rounded-xl border px-3 py-2 text-right text-[12px] transition ${
                isAnswer ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                : isWrong ? "border-red-400/60 bg-red-500/15 text-red-100"
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
      {resolved && (
        <FeedbackBanner
          kind={picked === correctIndex ? "ok" : "err"}
          text={picked === correctIndex ? activity.feedbackCorrect ?? "إجابة صحيحة." : activity.feedbackWrong ?? "إجابة غير صحيحة."}
        />
      )}
    </div>
  );
}

// ---------- True / False ----------
function TrueFalseRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const correct = typeof activity.correctAnswer === "boolean"
    ? activity.correctAnswer
    : String(activity.correctAnswer).toLowerCase() === "true";

  const submit = (val: boolean) => {
    if (resolved) return;
    setPicked(val);
    setResolved(true);
    onResolve(val === correct);
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((val) => (
          <button
            key={String(val)}
            disabled={resolved}
            onClick={() => submit(val)}
            className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
              resolved && val === correct ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
              : resolved && picked === val ? "border-red-400/60 bg-red-500/15 text-red-100"
              : "border-white/10 bg-black/30 hover:border-gold/40"
            }`}
          >
            {val ? "صحيح" : "خطأ"}
          </button>
        ))}
      </div>
      <HintRow hint={activity.hint} />
      {resolved && (
        <FeedbackBanner
          kind={picked === correct ? "ok" : "err"}
          text={picked === correct ? activity.feedbackCorrect ?? "إجابة صحيحة." : activity.feedbackWrong ?? "إجابة غير صحيحة."}
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

  if (!correctOrder.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const move = (idx: number, dir: -1 | 1) => {
    if (resolved) return;
    const next = [...order];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };

  const submit = () => {
    if (resolved) return;
    const isCorrect = order.every((v, i) => v === correctOrder[i]);
    setResolved(true);
    onResolve(isCorrect);
  };

  const isCorrect = resolved && order.every((v, i) => v === correctOrder[i]);

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
      {resolved && (
        <FeedbackBanner
          kind={isCorrect ? "ok" : "err"}
          text={isCorrect ? activity.feedbackCorrect ?? "ترتيب صحيح." : activity.feedbackWrong ?? `الترتيب الصحيح: ${correctOrder.join(" ← ")}`}
        />
      )}
    </div>
  );
}

// ---------- Decision Choice (no wrong answer — choose your path) ----------
function DecisionRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const options = activity.options ?? [];
  if (!options.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const submit = (i: number) => {
    if (resolved) return;
    setPicked(i);
    setResolved(true);
    onResolve(true); // historical decisions are reflective, always credited
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
  if (!pairs.length) return <FallbackRenderer activity={activity} onResolve={onResolve} alreadyDone={alreadyDone} />;

  const rights = useMemo(() => shuffle(pairs.map(p => p.right)), [pairs]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // leftKey -> rightValue
  const [resolved, setResolved] = useState(alreadyDone ?? false);

  const submit = () => {
    if (resolved) return;
    const ok = pairs.every(p => mapping[p.left] === p.right);
    setResolved(true);
    onResolve(ok);
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
              onChange={(e) => setMapping(m => ({ ...m, [p.left]: e.target.value }))}
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
      {resolved && (
        <FeedbackBanner
          kind={pairs.every(p => mapping[p.left] === p.right) ? "ok" : "err"}
          text={pairs.every(p => mapping[p.left] === p.right)
            ? activity.feedbackCorrect ?? "مطابقة صحيحة."
            : activity.feedbackWrong ?? "بعض الأزواج غير متطابقة."}
        />
      )}
    </div>
  );
}

// ---------- Fill in the Blank ----------
function FillBlankRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [val, setVal] = useState("");
  const [resolved, setResolved] = useState(alreadyDone ?? false);
  const correct = String(activity.correctAnswer ?? "").trim().toLowerCase();

  const submit = () => {
    if (resolved) return;
    const ok = correct.length > 0 && val.trim().toLowerCase() === correct;
    setResolved(true);
    onResolve(ok);
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={resolved}
        placeholder="اكتب إجابتك…"
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
      />
      <HintRow hint={activity.hint} />
      {!resolved && (
        <button onClick={submit} disabled={!val.trim()} className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
          تحقق
        </button>
      )}
      {resolved && (
        <FeedbackBanner
          kind={val.trim().toLowerCase() === correct ? "ok" : "err"}
          text={val.trim().toLowerCase() === correct
            ? activity.feedbackCorrect ?? "إجابة صحيحة."
            : activity.feedbackWrong ?? `الإجابة الصحيحة: ${activity.correctAnswer ?? "—"}`}
        />
      )}
    </div>
  );
}

// ---------- Reflection (free-form, always credited) ----------
function ReflectionRenderer({ activity, onResolve, alreadyDone }: RendererProps) {
  const [val, setVal] = useState("");
  const [resolved, setResolved] = useState(alreadyDone ?? false);

  const submit = () => {
    if (resolved) return;
    setResolved(true);
    onResolve(true);
  };

  return (
    <div>
      <ContextBlock text={activity.contextText} />
      <PromptBlock activity={activity} />
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={resolved}
        rows={4}
        placeholder="تأمّلك الشخصي…"
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-foreground outline-none focus:border-gold/60"
      />
      {!resolved && (
        <button onClick={submit} disabled={val.trim().length < 3} className="mt-4 w-full rounded-xl bg-gradient-gold py-2 text-xs font-bold text-primary-foreground shadow-gold disabled:opacity-50">
          سجّل تأمّلك
        </button>
      )}
      {resolved && <FeedbackBanner kind="ok" text={activity.feedbackCorrect ?? "شكرًا على تأمّلك."} />}
    </div>
  );
}

// ---------- Safe fallback (renders prompt + optional options + a complete button) ----------
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

// ---------- helpers ----------
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
