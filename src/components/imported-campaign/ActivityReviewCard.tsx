// ============================================================
// ActivityReviewCard — read-only view of a completed activity.
// ------------------------------------------------------------
// Used when a campaign is already fully completed. Shows the
// prompt, context, and the correct answer / choice — never
// awards rewards, never accepts input, never mutates progress.
// ============================================================

import { Check, HelpCircle, BookOpen } from "lucide-react";
import type { CampaignActivity } from "@/types/campaign";
import { RichReadingText } from "./RichReadingText";

export function ActivityReviewCard({ activity }: { activity: CampaignActivity }) {
  return (
    <div className="motion-page rounded-2xl border border-white/10 bg-black/30 p-4">
      {activity.contextText && (
        <div className="parchment-dark mb-4 rounded-2xl border border-gold/25 p-4">
          <RichReadingText text={activity.contextText} size="sm" />
        </div>
      )}

      <div className="mb-3 flex items-start gap-2">
        <HelpCircle className="mt-0.5 size-4 shrink-0 text-gold" />
        <p className="font-display text-[13px] font-bold leading-relaxed">{activity.prompt}</p>
      </div>

      <AnswerKey activity={activity} />

      {activity.feedbackCorrect && (
        <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-100">
          <Check className="me-1 inline size-3.5" />
          {activity.feedbackCorrect}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        <BookOpen className="size-3" /> وضع المراجعة
      </div>
    </div>
  );
}

function AnswerKey({ activity }: { activity: CampaignActivity }) {
  switch (activity.type) {
    case "reading_then_question":
      // Reading-only step (no options) — no answer key to show.
      if ((activity.options?.length ?? 0) === 0) {
        return <p className="text-[11px] text-muted-foreground">خطوة قراءة — لا توجد إجابة.</p>;
      }
    // falls through to the multiple-choice answer key when options exist
    case "multiple_choice": {
      const options = activity.options ?? [];

      const correctIndex =
        typeof activity.correctAnswer === "number"
          ? activity.correctAnswer
          : options.findIndex((o) => o === String(activity.correctAnswer));
      return (
        <div className="space-y-2">
          {options.map((opt, i) => {
            const isAnswer = i === correctIndex;
            return (
              <div
                key={i}
                className={`w-full rounded-xl border px-3 py-2 text-right text-[12px] ${
                  isAnswer
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-black/30 text-foreground/70"
                }`}
              >
                {isAnswer && <Check className="ms-2 inline size-3.5 text-emerald-300" />}
                {opt}
              </div>
            );
          })}
        </div>
      );
    }
    case "true_false": {
      const correct =
        typeof activity.correctAnswer === "boolean"
          ? activity.correctAnswer
          : String(activity.correctAnswer).toLowerCase() === "true";
      return (
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => {
            const isAnswer = v === correct;
            return (
              <div
                key={String(v)}
                className={`rounded-xl border px-3 py-3 text-center text-sm font-bold ${
                  isAnswer
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-black/30 text-foreground/70"
                }`}
              >
                {v ? "صحيح" : "خطأ"}
              </div>
            );
          })}
        </div>
      );
    }
    case "arrange_events": {
      const order = activity.correctOrder ?? activity.options ?? [];
      return (
        <ol className="space-y-2">
          {order.map((label, i) => (
            <li
              key={`${i}-${label}`}
              className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-50"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-emerald-500/25 text-[11px] text-emerald-100">
                {i + 1}
              </span>
              <span className="flex-1 min-w-0">{label}</span>
            </li>
          ))}
        </ol>
      );
    }
    case "match_pairs": {
      const pairs = activity.pairs ?? [];
      return (
        <div className="space-y-2">
          {pairs.map((p) => (
            <div
              key={p.left}
              className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px]"
            >
              <span className="flex-1 font-bold text-gold/90">{p.left}</span>
              <span className="text-emerald-200">↔</span>
              <span className="flex-1 text-emerald-100">{p.right}</span>
            </div>
          ))}
        </div>
      );
    }
    case "fill_blank":
      return (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-100">
          <span className="me-2 text-[10px] uppercase tracking-widest text-emerald-300/80">الإجابة</span>
          {String(activity.correctAnswer ?? "")}
        </div>
      );
    case "decision_choice": {
      const options = activity.options ?? [];
      return (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div
              key={i}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-right text-[12px] text-foreground/80"
            >
              {opt}
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">اختيار شخصي — لا يوجد جواب صحيح ثابت.</p>
        </div>
      );
    }
    case "reflection_prompt":
      return <p className="text-[11px] text-muted-foreground">تأمّل شخصي — لا يوجد جواب صحيح ثابت.</p>;
    default:
      return null;
  }
}

export default ActivityReviewCard;
