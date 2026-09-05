// ============================================================
// <ReplyComposer /> — compact one-level reply box (V17-07B)
// ------------------------------------------------------------
// Deliberately NOT the guided educational composer: a reply is a
// short answer to one reflection, not a new reflection.
//
// Contract:
//   * Online-only. No outbox, no queue, no optimistic fake success.
//   * 300 characters, same server rules.
//   * A failed submit keeps the typed text so the player can retry.
//   * Success clears the box and hands the server row upward.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/useOnline";
import { addCommentReply, commentErrorCopyAr } from "@/lib/social/comments";
import type { SocialCommentRow } from "@/lib/social/comments";

interface Props {
  parentId: string;
  /** Author name of the parent, used only for the accessible label. */
  parentAuthorName?: string | null;
  onPosted: (row: SocialCommentRow) => void;
  onCancel: () => void;
}

export function ReplyComposer({ parentId, parentAuthorName, onPosted, onCancel }: Props) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const online = useOnline();
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Focus as soon as the composer opens.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const tooLong = draft.length > 300;
  const empty = draft.trim().length === 0;

  async function submit() {
    if (pending || empty || tooLong) return;
    if (!online) {
      // Online-only by contract — the draft stays in local state.
      toast.error("يتطلب هذا الإجراء اتصالًا بالإنترنت.");
      return;
    }
    setPending(true);
    const res = await addCommentReply(parentId, draft);
    setPending(false);
    if (!res.ok || !res.comment) {
      // Preserve the typed text; the player retries manually.
      toast.error(commentErrorCopyAr(res.reason));
      return;
    }
    setDraft("");
    onPosted({ ...res.comment, is_mine: true });
  }

  return (
    <div className="mt-2 space-y-2" dir="rtl">
      <label className="sr-only" htmlFor={`reply-box-${parentId}`}>
        {parentAuthorName ? `الرد على مساهمة ${parentAuthorName}` : "الرد على هذه المساهمة"}
      </label>
      <textarea
        id={`reply-box-${parentId}`}
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 320))}
        rows={2}
        maxLength={320}
        dir="rtl"
        placeholder="اكتب ردّك…"
        aria-invalid={tooLong || undefined}
        className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className={cn("tabular-nums", tooLong && "text-destructive")}>
          {draft.length}/300
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 px-2.5 py-1 text-foreground/80 hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || empty || tooLong || !online}
            className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {pending ? "…" : "إرسال"}
          </button>
        </div>
      </div>
    </div>
  );
}
