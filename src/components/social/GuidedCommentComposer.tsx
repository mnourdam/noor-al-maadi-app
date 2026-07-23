// ============================================================
// <GuidedCommentComposer /> — the Guided Input Contract (P6.2)
// ------------------------------------------------------------
// This is NOT a generic text box. It is a slow, learning-oriented
// composer:
//   * Educational, rotating placeholders (context prompts, not tips).
//   * Hard 300-character cap with a visible counter.
//   * Plain-text only (paste stripped of HTML by the browser
//     since it's a <textarea>; we additionally normalize on submit).
//   * Online-only; disabled offline (no optimistic fake success).
//   * Disabled when the per-story 3-comment cap is reached.
//   * Disabled while a submission is in-flight.
//   * Enter posts, Shift+Enter inserts a newline (matches slow
//     deliberate discourse rather than chat).
//
// A11y: labelled, describedby the counter and any status hint,
// aria-invalid when over the cap, aria-live status for errors.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { addComment, commentErrorCopyAr } from "@/lib/social/comments";
import type { SocialCommentRow } from "@/lib/social/comments";
import type { SocialAnchorType } from "@/lib/social/reactions";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import { cn } from "@/lib/utils";

// Rotating placeholders. Deliberately reflective, not prescriptive.
const PROMPTS_AR = [
  "ما الفكرة التي أضاءها هذا في ذهنك؟",
  "أيّ مشهد تخيّلته وأنت تقرأ؟",
  "ما الدرس الذي أخذته إلى حياتك اليوم؟",
  "علاقة رأيتها بين هذا وحدث آخر تعرفه؟",
  "سؤال بقي في ذهنك بعد القراءة؟",
];

const MAX_LEN = 300;

interface Props {
  anchorType: SocialAnchorType;
  anchorId: string;
  /** How many comments the current user already has on this anchor. */
  myCount: number;
  /** Called after a successful post so the parent can prepend the row. */
  onPosted: (row: SocialCommentRow) => void;
  className?: string;
}

export function GuidedCommentComposer({
  anchorType,
  anchorId,
  myCount,
  onPosted,
  className,
}: Props) {
  const { user } = useAccount();
  const online = useOnline();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [promptIndex] = useState(() => Math.floor(Math.random() * PROMPTS_AR.length));
  const [rotate, setRotate] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Slow rotation of the placeholder while empty — matches "slow by design".
  useEffect(() => {
    if (value.length > 0) return;
    const t = setInterval(() => setRotate((r) => r + 1), 8000);
    return () => clearInterval(t);
  }, [value]);

  const placeholder = useMemo(
    () => PROMPTS_AR[(promptIndex + rotate) % PROMPTS_AR.length],
    [promptIndex, rotate],
  );

  const capReached = myCount >= 3;
  const trimmedLen = value.trim().length;
  const overflow = value.length > MAX_LEN;
  const disabled = !user || !online || capReached || pending || trimmedLen === 0 || overflow;

  const counterId = `cc-counter-${anchorId}`;
  const hintId = `cc-hint-${anchorId}`;

  const submit = useCallback(async () => {
    if (disabled) return;
    setPending(true);
    const res = await addComment(anchorType, anchorId, value);
    setPending(false);
    if (!res.ok || !res.comment) {
      toast.error(commentErrorCopyAr(res.reason));
      return;
    }
    setValue("");
    onPosted(res.comment);
  }, [disabled, anchorType, anchorId, value, onPosted]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  // Status hint copy chosen by hierarchy: signed-out > offline > cap.
  const hintText = !user
    ? "سجّل الدخول لإضافة تأمّلك."
    : !online
      ? "المساهمة تحتاج اتصالًا بالإنترنت."
      : capReached
        ? "لك ثلاث مساهمات كحدٍّ أقصى على هذه القصة."
        : null;

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={`cc-input-${anchorId}`}
        className="block text-[12px] font-medium text-foreground/80"
      >
        شارك تأمّلك
      </label>
      <textarea
        ref={areaRef}
        id={`cc-input-${anchorId}`}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN + 20))}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={3}
        maxLength={MAX_LEN + 20 /* let user see overflow, block submit */}
        disabled={!user || !online || capReached || pending}
        aria-describedby={`${counterId}${hintText ? ` ${hintId}` : ""}`}
        aria-invalid={overflow || undefined}
        dir="rtl"
        className={cn(
          "w-full resize-y rounded-lg border bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-foreground",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          overflow ? "border-destructive" : "border-white/10",
          (!user || !online || capReached) && "cursor-not-allowed opacity-60",
        )}
      />
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span
            id={counterId}
            aria-live="polite"
            className={cn(
              "tabular-nums",
              overflow ? "text-destructive" : value.length > MAX_LEN - 30 ? "text-gold" : undefined,
            )}
          >
            {value.length}/{MAX_LEN}
          </span>
          <span className="text-muted-foreground/80">
            {myCount}/3 مساهمات
          </span>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled}
          className={cn(
            "inline-flex items-center rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 text-[12px] font-medium text-gold",
            "hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            disabled && "cursor-not-allowed opacity-50 hover:bg-gold/15",
          )}
        >
          {pending ? "جارٍ النشر…" : "أضف تأمّلي"}
        </button>
      </div>
      {hintText && (
        <p id={hintId} className="text-[11px] text-muted-foreground">
          {hintText}
        </p>
      )}
    </div>
  );
}
