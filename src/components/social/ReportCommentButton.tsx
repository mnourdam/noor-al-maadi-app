// ============================================================
// <ReportCommentButton /> — two-tap comment reporting (P6 Step 5)
// ------------------------------------------------------------
// Tap 1: opens a small popover of suggested reasons.
// Tap 2: sends the report. Optional free-text note is collapsed.
// Player never sees the outcome — just a quiet thank-you toast.
// Online-only. Signed-in only. Hidden for the comment's author.
// ============================================================

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { REPORT_REASONS, reportComment, reportErrorCopyAr, type ReportReason } from "@/lib/social/reports";
import { useOnline } from "@/hooks/useOnline";

interface Props {
  commentId: string;
  authorId: string;
  currentUserId: string | null;
}

export function ReportCommentButton({ commentId, authorId, currentUserId }: Props) {
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<ReportReason | null>(null);

  // Hidden for anonymous users and for the author of the comment.
  if (!currentUserId || currentUserId === authorId) return null;

  async function submit(reason: ReportReason) {
    if (!online) {
      toast.info("الإبلاغ متاح عند الاتصال بالإنترنت.");
      return;
    }
    if (pending) return;
    setPending(reason);
    const res = await reportComment(commentId, reason, note.trim() || null);
    setPending(null);
    if (!res.ok) {
      toast.error(reportErrorCopyAr(res.reason));
      return;
    }
    setOpen(false);
    setShowNote(false);
    setNote("");
    toast.success("شكرًا لك. سيراجع الفريق البلاغ.");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label="الإبلاغ عن هذه المساهمة"
        >
          <Flag className="size-3" aria-hidden="true" />
          إبلاغ
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-64 space-y-1 border-white/10 bg-black/95 p-2 text-[13px]"
        dir="rtl"
      >
        <div className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">
          اختر سببًا:
        </div>
        <ul className="space-y-0.5">
          {REPORT_REASONS.map((r) => (
            <li key={r.value}>
              <button
                type="button"
                onClick={() => void submit(r.value)}
                disabled={pending !== null}
                className="w-full rounded-md px-2 py-1.5 text-right hover:bg-white/5 disabled:opacity-50"
              >
                {pending === r.value ? "…" : r.labelAr}
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-white/10 pt-1">
          {showNote ? (
            <div className="space-y-1 p-1">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={2}
                dir="rtl"
                placeholder="ملاحظة قصيرة اختيارية…"
                className="w-full resize-none rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"
              />
              <div className="text-left text-[10px] tabular-nums text-muted-foreground">
                {note.length}/500
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="w-full rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              إضافة ملاحظة اختيارية
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
