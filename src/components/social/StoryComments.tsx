// ============================================================
// <StoryComments /> — anchor-bound comments surface (P6.2)
// ------------------------------------------------------------
// Composition:
//   1. Guided composer (top; hidden when user has 3 comments).
//   2. Sort switcher (default → Newest). Never "Most Popular".
//   3. Editor's Notes (first page only; cap 3) as pinned block.
//   4. Flat top-level list, keyset-paginated ("عرض المزيد"),
//      each card carrying ONE level of replies (V17-07B).
//
// Reads via `list_comments_v2`; deep links via `get_comment_thread_v1`.
// Signed-out visitors can READ; composer prompts sign-in.
// Offline: composer is disabled; reads still fetch when possible.
// No realtime subscription. No offline outbox for social writes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import { listComments, getCommentThread } from "@/lib/social/comments";
import type {
  CommentSort,
  SocialCommentRow,
  CommentsPage,
  CommentThread,
} from "@/lib/social/comments";
import type { SocialAnchorType } from "@/lib/social/reactions";
import { GuidedCommentComposer } from "./GuidedCommentComposer";
import { CommentItem, type CommentAuthor } from "./CommentItem";
import { CommentReplies } from "./CommentReplies";
import { myContributionFlags, type MyContributionFlag } from "@/lib/social/contributions";
import { fetchPublicProfilesByIds } from "@/lib/social";

interface Props {
  /** Preferred: explicit anchor. Defaults to "story" for backward-compat. */
  anchorType?: Exclude<SocialAnchorType, "comment">;
  anchorId?: string;
  /** Legacy alias — new callers should use anchorType/anchorId. */
  storyId?: string;
  className?: string;
}

interface ThreadState {
  replies: SocialCommentRow[];
  count: number;
  /** True once the full thread has been pulled through the thread RPC. */
  full?: boolean;
}

export function StoryComments({ anchorType = "story", anchorId, storyId, className }: Props) {
  const resolvedAnchorId = anchorId ?? storyId ?? "";
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
  const [myFlags, setMyFlags] = useState<Record<string, MyContributionFlag>>({});
  const [authors, setAuthors] = useState<Record<string, CommentAuthor>>({});

  // ── Replies (V17-07B) ─────────────────────────────────────
  // Replies live only on Encyclopedia entities in V17.
  const repliesEnabled = anchorType === "entity";
  const [threads, setThreads] = useState<Record<string, ThreadState>>({});
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const [tombstoneId, setTombstoneId] = useState<string | null>(null);

  /** Seed thread state from whatever the listing RPC returned. */
  const seedThreads = useCallback((rows: SocialCommentRow[]) => {
    setThreads((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (r.parent_comment_id) continue;
        if (next[r.id]?.full) continue;
        next[r.id] = { replies: r.replies ?? [], count: r.reply_count ?? 0 };
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (nextSort: CommentSort) => {
      if (!resolvedAnchorId) return;
      setLoading(true);
      setError(null);
      const res = await listComments(anchorType, resolvedAnchorId, { sort: nextSort, limit: 20 });
      if ("ok" in res && res.ok) {
        const page = res as CommentsPage;
        setEditorsNotes(page.editors_notes ?? []);
        setItems(page.items ?? []);
        setCursor(page.next_cursor ?? null);
        setTotal(page.total_visible ?? 0);
        seedThreads([...(page.editors_notes ?? []), ...(page.items ?? [])]);
      } else {
        setError("تعذّر تحميل المساهمات.");
      }
      setLoading(false);
    },
    [anchorType, resolvedAnchorId, seedThreads],
  );

  useEffect(() => {
    void load(sort);
  }, [load, sort]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !resolvedAnchorId) return;
    setLoadingMore(true);
    const res = await listComments(anchorType, resolvedAnchorId, { sort, cursor, limit: 20 });
    if ("ok" in res && res.ok) {
      const page = res as CommentsPage;
      setItems((prev) => [...prev, ...(page.items ?? [])]);
      setCursor(page.next_cursor ?? null);
      seedThreads(page.items ?? []);
    }
    setLoadingMore(false);
  }, [anchorType, cursor, loadingMore, sort, resolvedAnchorId, seedThreads]);

  const myCount = useMemo(() => {
    const all = [...editorsNotes, ...items];
    return all.filter((r) => r.is_mine).length;
  }, [editorsNotes, items]);

  // Fetch this user's own contribution flags for the currently loaded comments.
  useEffect(() => {
    if (!user) { setMyFlags({}); return; }
    const mineIds = [...editorsNotes, ...items].filter((r) => r.is_mine).map((r) => r.id);
    if (mineIds.length === 0) { setMyFlags({}); return; }
    let cancelled = false;
    void (async () => {
      const rows = await myContributionFlags(mineIds);
      if (cancelled) return;
      const map: Record<string, MyContributionFlag> = {};
      for (const r of rows) map[r.comment_id] = r;
      setMyFlags(map);
    })();
    return () => { cancelled = true; };
  }, [user, editorsNotes, items]);

  // Hydrate author identity (emblem + level + display name) through the
  // curated public-profile RPC. Signed-out readers keep the plain name the
  // comments RPC already returns. Reply authors are included.
  useEffect(() => {
    if (!user) { setAuthors({}); return; }
    const replyAuthors = Object.values(threads).flatMap((t) => t.replies.map((r) => r.author_id));
    const ids = Array.from(
      new Set([...editorsNotes, ...items].map((r) => r.author_id).concat(replyAuthors).filter(Boolean)),
    );
    const missing = ids.filter((id) => !authors[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const rows = await fetchPublicProfilesByIds(missing);
      if (cancelled || rows.length === 0) return;
      setAuthors((prev) => {
        const next = { ...prev };
        for (const p of rows) {
          next[p.id] = {
            display_name: p.display_name,
            username: p.username,
            avatar_id: p.avatar_id,
            level: p.level,
          };
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
    // `authors` is intentionally read-only here (guarded by `missing`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, editorsNotes, items, threads]);

  // Deep link `?comment=<parentId>` — resolved through the direct thread RPC
  // so it never depends on the parent sitting inside page 1 of the feed.
  // We never paginate repeatedly hunting for it.
  useEffect(() => {
    if (loading || typeof window === "undefined") return;
    const target = new URLSearchParams(window.location.search).get("comment");
    if (!target) return;
    let cancelled = false;

    void (async () => {
      if (repliesEnabled) {
        const res = await getCommentThread(target);
        if (cancelled) return;
        if (!("ok" in res) || !res.ok) {
          setDeepLinkNotice("لم تعد هذه المساهمة متاحة.");
          return;
        }
        const thread = res as CommentThread;
        const parent = thread.parent;
        setThreads((prev) => ({
          ...prev,
          [parent.id]: {
            replies: parent.replies ?? [],
            count: parent.reply_count ?? 0,
            full: true,
          },
        }));
        if (thread.removed) setTombstoneId(parent.id);
        // Surface the parent even when it is not on the loaded page.
        setItems((prev) =>
          prev.some((r) => r.id === parent.id) ? prev : [parent, ...prev],
        );
      }

      // Scroll + flash once the row is in the DOM.
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`comment-${target}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-gold");
        window.setTimeout(() => el.classList.remove("ring-2", "ring-gold"), 4000);
      });
    })();

    return () => { cancelled = true; };
  }, [loading, repliesEnabled]);

  const onPosted = useCallback((row: SocialCommentRow) => {
    // New comments land at the top of the "newest" surface regardless of sort.
    setItems((prev) => [{ ...row, is_mine: true }, ...prev]);
    setThreads((prev) => ({ ...prev, [row.id]: { replies: [], count: 0 } }));
    setTotal((n) => n + 1);
  }, []);

  const onChange = useCallback((row: SocialCommentRow) => {
    setEditorsNotes((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
    setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
    setThreads((prev) => {
      const next = { ...prev };
      for (const [pid, t] of Object.entries(next)) {
        if (!t.replies.some((r) => r.id === row.id)) continue;
        next[pid] = { ...t, replies: t.replies.map((r) => (r.id === row.id ? { ...r, ...row } : r)) };
      }
      return next;
    });
  }, []);

  const onDelete = useCallback((id: string) => {
    setEditorsNotes((prev) => prev.filter((r) => r.id !== id));
    setItems((prev) => {
      const wasTopLevel = prev.some((r) => r.id === id);
      if (wasTopLevel) setTotal((n) => Math.max(0, n - 1));
      return prev.filter((r) => r.id !== id);
    });
    setThreads((prev) => {
      const next = { ...prev };
      for (const [pid, t] of Object.entries(next)) {
        if (!t.replies.some((r) => r.id === id)) continue;
        next[pid] = {
          ...t,
          replies: t.replies.filter((r) => r.id !== id),
          count: Math.max(0, t.count - 1),
        };
      }
      return next;
    });
  }, []);

  /** A reply was created — insert locally, no feed refetch. */
  const onReplyPosted = useCallback((parentId: string, row: SocialCommentRow) => {
    setThreads((prev) => {
      const t = prev[parentId] ?? { replies: [], count: 0 };
      return {
        ...prev,
        [parentId]: { ...t, replies: [...t.replies, { ...row, is_mine: true }], count: t.count + 1 },
      };
    });
    setOpenReplyFor(null);
  }, []);

  const expandThread = useCallback(async (parentId: string) => {
    setExpanding(parentId);
    const res = await getCommentThread(parentId);
    setExpanding(null);
    if (!("ok" in res) || !res.ok) return;
    const parent = (res as CommentThread).parent;
    setThreads((prev) => ({
      ...prev,
      [parentId]: { replies: parent.replies ?? [], count: parent.reply_count ?? 0, full: true },
    }));
  }, []);

  const renderCard = useCallback(
    (row: SocialCommentRow) => {
      const thread = threads[row.id] ?? { replies: [], count: row.reply_count ?? 0 };
      const isTombstone = tombstoneId === row.id || row.status === "removed";
      const authorName =
        authors[row.author_id]?.display_name?.trim() || row.author_name?.trim() || null;
      return (
        <div key={row.id}>
          {isTombstone ? (
            <article
              id={`comment-${row.id}`}
              aria-label="مساهمة محذوفة"
              className="rounded-lg border border-dashed border-white/10 bg-black/10 p-3 text-[12px] text-muted-foreground"
            >
              حُذفت هذه المساهمة.
            </article>
          ) : (
            <CommentItem
              row={row}
              onChange={onChange}
              onDelete={onDelete}
              currentUserId={user?.id ?? null}
              contributionFlag={myFlags[row.id] ?? null}
              author={authors[row.author_id] ?? null}
              replyCount={thread.count}
              replyOpen={openReplyFor === row.id}
              onReply={
                repliesEnabled
                  ? () => setOpenReplyFor((cur) => (cur === row.id ? null : row.id))
                  : undefined
              }
            />
          )}
          {repliesEnabled && (
            <CommentReplies
              parentId={row.id}
              parentAuthorName={authorName}
              replies={thread.replies}
              replyCount={thread.count}
              composerOpen={openReplyFor === row.id}
              onCloseComposer={() => setOpenReplyFor(null)}
              onPosted={(r) => onReplyPosted(row.id, r)}
              onChange={onChange}
              onDelete={onDelete}
              currentUserId={user?.id ?? null}
              authors={authors}
              onExpand={() => void expandThread(row.id)}
              expanding={expanding === row.id}
            />
          )}
        </div>
      );
    },
    [
      threads, tombstoneId, authors, onChange, onDelete, user, myFlags,
      openReplyFor, repliesEnabled, onReplyPosted, expandThread, expanding,
    ],
  );

  return (
    <section aria-labelledby={`social-comments-${resolvedAnchorId}`} className={cn("space-y-4", className)}>
      <header className="flex items-center justify-between gap-3">
        <h2
          id={`social-comments-${resolvedAnchorId}`}
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

      {deepLinkNotice && (
        <p
          role="status"
          className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-center text-[12px] text-muted-foreground"
        >
          {deepLinkNotice}
        </p>
      )}

      <GuidedCommentComposer
        anchorType={anchorType}
        anchorId={resolvedAnchorId}
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
      ) : total === 0 && items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gold/20 bg-black/10 p-5 text-center text-[12px] leading-relaxed text-muted-foreground">
          <p className="text-foreground/85">لا توجد تأمّلات بعد.</p>
          <p className="mt-1 text-[11px] text-muted-foreground/85">كن أول من يترك أثرًا هنا.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sort === "editors_helpful_new" && editorsNotes.map(renderCard)}
          {items.map(renderCard)}
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
          سجّل الدخول لتشارك تأمّلك.
        </p>
      )}
    </section>
  );
}
