// ============================================================
// <CommentItem /> — a single flat comment. No reply UI, ever.
// ------------------------------------------------------------
// - Editor's Note gets a subtle gold "ملاحظة المحرّر" ribbon.
// - The author sees Edit (inside the window) and Delete controls.
// - Edited comments show a discreet "معدّل" marker (no diff).
// - Body renders as escaped plain text preserving line breaks.
// ============================================================

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteOwnComment,
  editComment,
  isWithinEditWindow,
  commentErrorCopyAr,
} from "@/lib/social/comments";
import type { SocialCommentRow } from "@/lib/social/comments";
import { ReportCommentButton } from "./ReportCommentButton";

interface Props {
  row: SocialCommentRow;
  onChange: (row: SocialCommentRow) => void;
  onDelete: (id: string) => void;
  currentUserId?: string | null;
}

function formatDateAr(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CommentItem({ row, onChange, onDelete, currentUserId = null }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.body_text);
  const [pending, setPending] = useState(false);

  const canEdit = row.is_mine && isWithinEditWindow(row);
  const canDelete = row.is_mine === true;

  async function saveEdit() {
    if (pending) return;
    setPending(true);
    const res = await editComment(row.id, draft);
    setPending(false);
    if (!res.ok || !res.comment) {
      toast.error(commentErrorCopyAr(res.reason));
      return;
    }
    setEditing(false);
    onChange({ ...res.comment, is_mine: true });
  }

  async function remove() {
    if (pending) return;
    if (!confirm("حذف مساهمتك؟ لا يمكن التراجع.")) return;
    setPending(true);
    const res = await deleteOwnComment(row.id);
    setPending(false);
    if (!res.ok) {
      toast.error(commentErrorCopyAr());
      return;
    }
    onDelete(row.id);
  }

  return (
    <article
      className={cn(
        "rounded-lg border p-3",
        row.editors_note
          ? "border-gold/40 bg-gold/5"
          : "border-white/10 bg-black/20",
      )}
      aria-label={row.editors_note ? "ملاحظة المحرّر" : "مساهمة قارئ"}
    >
      {row.editors_note && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold">
          <BookMarked className="size-3" aria-hidden="true" />
          <span>ملاحظة المحرّر</span>
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 320))}
            rows={3}
            maxLength={320}
            dir="rtl"
            className="w-full resize-y rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="tabular-nums">{draft.length}/300</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(row.body_text);
                }}
                className="rounded-full border border-white/10 px-2.5 py-1 text-foreground/80 hover:border-white/20"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={pending || draft.trim().length === 0 || draft.length > 300}
                className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-1 font-medium text-gold hover:bg-gold/20 disabled:opacity-50"
              >
                {pending ? "…" : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground/90">
          {row.body_text}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {formatDateAr(row.created_at)}
          {row.edited_at && <span className="mr-1"> · معدّل</span>}
        </span>
        {!editing && row.is_mine && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label="تعديل مساهمتي"
              >
                <Pencil className="size-3" aria-hidden="true" />
                تعديل
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => void remove()}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                aria-label="حذف مساهمتي"
              >
                <Trash2 className="size-3" aria-hidden="true" />
                حذف
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
