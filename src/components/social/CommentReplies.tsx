// ============================================================
// <CommentReplies /> — the one level of replies under a parent.
// ------------------------------------------------------------
// Presentational only. No fetching of its own beyond the thread
// expansion, no realtime, no persistence.
// ============================================================

import { cn } from "@/lib/utils";
import { CommentItem, type CommentAuthor } from "./CommentItem";
import { ReplyComposer } from "./ReplyComposer";
import type { SocialCommentRow } from "@/lib/social/comments";

interface Props {
  parentId: string;
  parentAuthorName?: string | null;
  replies: SocialCommentRow[];
  replyCount: number;
  composerOpen: boolean;
  onCloseComposer: () => void;
  onPosted: (row: SocialCommentRow) => void;
  onChange: (row: SocialCommentRow) => void;
  onDelete: (id: string) => void;
  currentUserId?: string | null;
  authors?: Record<string, CommentAuthor>;
  /** Loads the remaining replies for this parent through the thread RPC. */
  onExpand?: () => void;
  expanding?: boolean;
}

export function CommentReplies({
  parentId,
  parentAuthorName,
  replies,
  replyCount,
  composerOpen,
  onCloseComposer,
  onPosted,
  onChange,
  onDelete,
  currentUserId = null,
  authors = {},
  onExpand,
  expanding = false,
}: Props) {
  const hidden = Math.max(0, replyCount - replies.length);

  if (!composerOpen && replies.length === 0) return null;

  return (
    <div className={cn("ms-6 mt-2 space-y-2 border-s border-white/10 ps-3")}>
      {replies.length > 0 && (
        <ul className="space-y-2" aria-label={`ردود على هذه المساهمة (${replyCount})`}>
          {replies.map((r) => (
            <li key={r.id}>
              <CommentItem
                row={r}
                isReply
                onChange={onChange}
                onDelete={onDelete}
                currentUserId={currentUserId}
                author={authors[r.author_id] ?? null}
              />
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          disabled={expanding}
          className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-foreground/80 hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60"
        >
          {expanding ? "…" : `عرض الثريد (${hidden})`}
        </button>
      )}

      {composerOpen && (
        <ReplyComposer
          parentId={parentId}
          parentAuthorName={parentAuthorName}
          onPosted={onPosted}
          onCancel={onCloseComposer}
        />
      )}
    </div>
  );
}
