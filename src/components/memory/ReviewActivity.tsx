// ============================================================
// Memory Engine — Review Activity renderer
// ------------------------------------------------------------
// Displays ONE review question inline inside the chapter flow.
// Independent from ActivityRenderer so the campaign renderer stays
// 100% unchanged apart from a single dispatch line.
//
// Rules honoured here:
//   - "مراجعة" badge shows only BEFORE the answer is revealed.
//   - Source label ("من حملة: …") appears only AFTER the answer.
//   - No hearts are consumed on a wrong answer.
//   - "متابعة" advances back to the original chapter flow.
//   - "تخطي" is available before answering (0 XP, no scheduling update).
// ============================================================

import { useMemo, useState } from "react";
import { Check, X, Sparkles, ArrowLeft, BookMarked, SkipForward } from "lucide-react";
import type { ReviewItem } from "@/lib/memory";

export interface ReviewActivityProps {
  item: ReviewItem;
  /** Called once the player is ready to leave the review card. */
  onDone: (outcome: { correct: boolean | null; skipped: boolean }) => void;
}

export function ReviewActivity({ item, onDone }: ReviewActivityProps) {
  const [choice, setChoice] = useState<number | boolean | null>(null);
  const [revealed, setRevealed] = useState(false);

  const isCorrect = useMemo(() => {
    if (choice == null) return null;
    return choice === item.correctAnswer;
  }, [choice, item.correctAnswer]);

  const submit = (value: number | boolean) => {
    if (revealed) return;
    setChoice(value);
    setRevealed(true);
  };

  const finish = () => {
    onDone({ correct: isCorrect, skipped: false });
  };

  const skip = () => {
    if (revealed) return finish();
    onDone({ correct: null, skipped: true });
  };

  return (
    <div className="motion-page rounded-3xl border border-indigo-400/40 bg-gradient-to-b from-indigo-950/70 via-[#0f1a36]/80 to-slate-900/70 p-5 shadow-elegant">
      {!revealed && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-indigo-300/40 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-bold tracking-widest text-indigo-100">
          <BookMarked className="size-3" /> مراجعة
        </div>
      )}

      <p className="font-display text-[13px] font-bold leading-relaxed text-foreground">
        {item.prompt}
      </p>

      {item.kind === "mcq" && item.options && (
        <div className="mt-4 space-y-2">
          {item.options.map((opt, idx) => {
            const picked = choice === idx;
            const isRight = idx === item.correctAnswer;
            const state = !revealed
              ? "idle"
              : isRight
                ? "correct"
                : picked
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={idx}
                type="button"
                disabled={revealed}
                onClick={() => submit(idx)}
                className={
                  "block w-full rounded-xl border px-3 py-2 text-start text-[13px] transition " +
                  (state === "idle"
                    ? "border-indigo-300/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-50"
                    : state === "correct"
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : state === "wrong"
                        ? "border-rose-400/60 bg-rose-500/20 text-rose-100"
                        : "border-white/10 bg-white/5 text-muted-foreground")
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {item.kind === "true_false" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[true, false].map((val) => {
            const picked = choice === val;
            const isRight = val === item.correctAnswer;
            const state = !revealed
              ? "idle"
              : isRight
                ? "correct"
                : picked
                  ? "wrong"
                  : "dim";
            return (
              <button
                key={String(val)}
                type="button"
                disabled={revealed}
                onClick={() => submit(val)}
                className={
                  "rounded-xl border px-3 py-2 text-[13px] font-bold transition " +
                  (state === "idle"
                    ? "border-indigo-300/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-50"
                    : state === "correct"
                      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-100"
                      : state === "wrong"
                        ? "border-rose-400/60 bg-rose-500/20 text-rose-100"
                        : "border-white/10 bg-white/5 text-muted-foreground")
                }
              >
                {val ? "صحيح" : "خاطئ"}
              </button>
            );
          })}
        </div>
      )}

      {revealed && (
        <div
          className={
            "motion-toast mt-4 rounded-xl border px-3 py-2 text-[12px] " +
            (isCorrect
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/10 text-rose-100")
          }
        >
          {isCorrect ? <Check className="me-1 inline size-3.5" /> : <X className="me-1 inline size-3.5" />}
          {isCorrect
            ? "تذكرتَ المعلومة."
            : "لا بأس — راجعناها لتثبت."}
          <div className="mt-1 text-[11px] text-muted-foreground">
            <Sparkles className="me-1 inline size-3" />
            من {sourceLabelFor(item)}: {item.sourceLabel}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        {revealed ? (
          <button
            onClick={finish}
            className="motion-tap inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-gold py-3 text-sm font-bold text-primary-foreground shadow-gold"
          >
            <Check className="size-4" /> متابعة
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <button
            onClick={skip}
            className="motion-tap inline-flex items-center gap-1 rounded-2xl border border-white/10 px-3 py-2 text-[11px] text-muted-foreground"
          >
            <SkipForward className="size-3.5" /> تخطي
          </button>
        )}
      </div>
    </div>
  );
}

function sourceLabelFor(item: ReviewItem): string {
  switch (item.sourceType) {
    case "campaign":       return "حملة";
    case "investigation":  return "تحقيق";
    case "story":          return "قصة";
    case "museum":         return "المتحف";
    case "daily_challenge":return "تحدٍ يومي";
    default:               return "محتوى سابق";
  }
}
