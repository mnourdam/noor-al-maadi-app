// ============================================================
// <StoryComments /> — anchor-bound comments surface (P6.2)
// ------------------------------------------------------------
// Composition:
//   1. Guided composer (top; hidden when user has 3 comments).
//   2. Sort switcher (default → Newest). Never "Most Popular".
//   3. Editor's Notes (first page only; cap 3) as pinned block.
//   4. Flat list, keyset-paginated ("عرض المزيد").
//
// Reads via `list_comments_v2`. Cursor pagination from day one.
// Signed-out visitors can READ; composer prompts sign-in.
// Offline: composer is disabled; reads still fetch when possible.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import { listComments } from "@/lib/social/comments";
import type {
  CommentSort,
  SocialCommentRow,
  CommentsPage,
} from "@/lib/social/comments";
import { GuidedCommentComposer } from "./GuidedCommentComposer";
import { CommentItem } from "./CommentItem";

interface Props {
  storyId: string;
  className?: string;
}

export function StoryComments({ storyId, className }: Props) {
  const { user } = useAccount();
  const online = useOnline();
  const [sort, setSort] = useState<CommentSort>("editors_helpful_new");
  const [editorsNotes, setEditorsNotes] = useState<SocialCommentRow[]>([]);
  const [items, setItems] = useState<SocialCommentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextSort: CommentSort) => {
      setLoading(true);
      setError(null);
      const res = await listComments("story", storyId, { sort: nextSort, limit: 20 });
      if ("ok" in res && res.ok) {
        const page = res as CommentsPage;
        setEditorsNotes(page.editors_notes ?? []);
        setItems(page.items ?? []);
        setCursor(page.next_cursor ?? null);
        setTotal(page.total_visible ?? 0);
      } else {
        setError("تعذّر تحميل المساهمات.");
      }
      setLoading(false);
    },
    [storyId],
  );

  useEffect(() => {
    void load(sort);
  }, [load, sort]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await listComments("story", storyId, { sort, cursor, limit: 20 });
    if ("ok" in res && res.ok) {
      const page = res as CommentsPage;
      setItems((prev) => [...prev, ...(page.items ?? [])]);
      setCursor(page.next_cursor ?? null);
    }
    setLoadingMore(false);
  }, [cursor, loadingMore, sort, storyId]);

  const myCount = useMemo(() => {
    const all = [...editorsNotes, ...items];
    return all.filter((r) => r.is_mine).length;
  }, [editorsNotes, items]);

  const onPosted = useCallback((row: SocialCommentRow) => {
    // New comments land at the top of the "newest" surface regardless of sort.
    setItems((prev) => [{ ...row, is_mine: true }, ...prev]);
    setTotal((n) => n + 1);
  }, []);

  const onChange = useCallback((row: SocialCommentRow) => {
    setEditorsNotes((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
    setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
  }, []);

  const onDelete = useCallback((id: string) => {
    setEditorsNotes((prev) => prev.filter((r) => r.id !== id));
    setItems((prev) => prev.filter((r) => r.id !== id));
    setTotal((n) => Math.max(0, n - 1));
  }, []);

  return (
    <section aria-labelledby={`story-comments-${storyId}`} className={cn("space-y-4", className)}>
      <header className="flex items-center justify-between gap-3">
        <h2
          id={`story-comments-${storyId}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <MessagesSquare className="size-4 text-gold" aria-hidden="true" />
          تأمّلات القرّاء
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {total}
          </span>
        </h2>

        <div
          role="tablist"
          aria-label="ترتيب المساهمات"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5 text-[11px]"
        >
          {(
            [
              { key: "editors_helpful_new", label: "المختارة" },
              { key: "newest", label: "الأحدث" },
            ] as { key: CommentSort; label: string }[]
          ).map((opt) => {
            const active = sort === opt.key;
            return (
              <button
                key={opt.key}
                role="tab"
                aria-selected={active}
                onClick={() => setSort(opt.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  active
                    ? "bg-gold/15 text-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      <GuidedCommentComposer
        anchorType="story"
        anchorId={storyId}
        myCount={myCount}
        onPosted={onPosted}
      />

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-center text-[12px] text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive">
          {error}
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-center text-[12px] text-muted-foreground">
          لا مساهمات بعد — كن أول من يشارك تأمّله.
        </div>
      ) : (
        <div className="space-y-3">
          {sort === "editors_helpful_new" &&
            editorsNotes.map((row) => (
              <CommentItem key={row.id} row={row} onChange={onChange} onDelete={onDelete} currentUserId={user?.id ?? null} />
            ))}
          {items.map((row) => (
            <CommentItem key={row.id} row={row} onChange={onChange} onDelete={onDelete} currentUserId={user?.id ?? null} />
          ))}
          {cursor && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || !online}
                className={cn(
                  "rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-foreground/80 hover:border-gold/40 hover:text-gold",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  (loadingMore || !online) && "cursor-not-allowed opacity-60",
                )}
              >
                {loadingMore ? "…" : "عرض المزيد"}
              </button>
            </div>
          )}
        </div>
      )}

      {!user && total > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">
          سجّل الدخول لتضيف تأمّلك.
        </p>
      )}
    </section>
  );
}
