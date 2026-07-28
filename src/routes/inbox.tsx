// ============================================================
// /inbox — Personal Notifications + My Reflections archive
// ------------------------------------------------------------
// Two tabs, one quiet personal space:
//   • التنبيهات — events that concern my own contributions
//   • تأمّلاتي  — everything I have written (encyclopedia, stories,
//                 campaigns) with likes and replies
//
// Pagination from day one on both tabs. Never preloads history.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCheck, MailOpen, NotebookPen, Heart, MessageCircle, Sprout, Plus, MessageSquare, Inbox as InboxIcon } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type PersonalNotificationRow,
} from "@/lib/notifications/personal";
import { renderNotification, formatRelativeAr } from "@/lib/notifications/personalPresentation";
import {
  listMyReflections,
  anchorLabelAr,
  anchorHref,
  type ReflectionArchiveRow,
} from "@/lib/reflections/archive";
import { listMyIssues } from "@/lib/feedback/api";
import { CATEGORY_MAP, STATUS_LABELS, type FeedbackIssue } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

type TabParam = "notifications" | "reflections" | "contributions";

export const Route = createFileRoute("/inbox")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabParam } => {
    const t = search.tab;
    return t === "reflections" || t === "contributions" || t === "notifications" ? { tab: t } : {};
  },
  head: () => ({
    meta: [
      { title: "الصندوق الشخصي — إرث" },
      { name: "description", content: "تنبيهاتك وتأمّلاتك على منصّة إرث — هادئة، مفيدة، بلا ضجيج." },
      { property: "og:title", content: "الصندوق الشخصي — إرث" },
      { property: "og:description", content: "تنبيهاتك وأرشيف تأمّلاتك على منصّة إرث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InboxScreen,
});

type Tab = TabParam;

function InboxScreen() {
  const { user } = useAccount();
  const { tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState<Tab>(tabParam ?? "notifications");
  useEffect(() => {
    if (tabParam) setTab(tabParam);
  }, [tabParam]);

  if (!user) {
    return (
      <AppShell>
        <Screen title="الصندوق الشخصي" subtitle="سجّل الدخول لعرض تنبيهاتك وتأمّلاتك.">
          <div className="mx-auto max-w-md py-8 text-center text-sm text-muted-foreground">
            <Link
              to="/auth"
              className="inline-flex items-center rounded-full border border-gold/50 bg-gold/15 px-4 py-2 font-medium text-gold hover:bg-gold/20"
            >
              تسجيل الدخول
            </Link>
          </div>
        </Screen>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Screen
        title="الصندوق الشخصي"
        subtitle="تنبيهات هادئة تخصّك أنت — مساهماتك، وما فُتح لك من قصص."
      >
        <div className="mx-auto max-w-2xl space-y-4">
          <div role="tablist" aria-label="أقسام الصندوق" className="flex items-center gap-2">
            <TabButton active={tab === "notifications"} onClick={() => setTab("notifications")}>
              <MailOpen className="size-3.5" aria-hidden="true" />
              التنبيهات
            </TabButton>
            <TabButton active={tab === "reflections"} onClick={() => setTab("reflections")}>
              <NotebookPen className="size-3.5" aria-hidden="true" />
              تأمّلاتي
            </TabButton>
            <TabButton active={tab === "contributions"} onClick={() => setTab("contributions")}>
              <Sprout className="size-3.5" aria-hidden="true" />
              مساهماتي
            </TabButton>
          </div>

          {tab === "notifications" ? (
            <NotificationsTab />
          ) : tab === "reflections" ? (
            <ReflectionsTab />
          ) : (
            <ContributionsTab />
          )}
        </div>
      </Screen>
    </AppShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
        active
          ? "border-gold/50 bg-gold/15 font-medium text-gold"
          : "border-white/10 bg-black/30 text-foreground/80 hover:border-gold/40 hover:text-gold",
      )}
    >
      {children}
    </button>
  );
}

function NotificationsTab() {
  const { user } = useAccount();
  const online = useOnline();
  const [items, setItems] = useState<PersonalNotificationRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const res = await listMyNotifications({ limit: 20 });
    if ("ok" in res && res.ok) {
      setItems(res.items ?? []);
      setCursor(res.next_cursor ?? null);
    } else {
      setError("تعذّر تحميل الصندوق.");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const res = await listMyNotifications({ cursor, limit: 20 });
    if ("ok" in res && res.ok) {
      setItems((prev) => [...prev, ...(res.items ?? [])]);
      setCursor(res.next_cursor ?? null);
    }
    setLoadingMore(false);
  }, [cursor, loadingMore]);

  const onMarkOne = useCallback(async (id: string) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, read_at: new Date().toISOString() } : r)));
    await markNotificationRead(id);
  }, []);

  const onMarkAll = useCallback(async () => {
    setItems((prev) => prev.map((r) => ({ ...r, read_at: r.read_at ?? new Date().toISOString() })));
    await markAllNotificationsRead();
    // Re-read from the server so the list reflects the durable state.
    await load();
  }, [load]);

  const unread = items.filter((r) => !r.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">
          {unread > 0 ? `${unread} غير مقروء` : "لا شيء جديد"}
        </span>
        <button
          type="button"
          onClick={() => void onMarkAll()}
          disabled={unread === 0 || !online}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-foreground/80",
            "hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
            (unread === 0 || !online) && "cursor-not-allowed opacity-50 hover:border-white/10 hover:text-foreground/80",
          )}
        >
          <CheckCheck className="size-3.5" aria-hidden="true" />
          وسم الكل كمقروء
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-muted-foreground">
          <MailOpen className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden="true" />
          صندوقك هادئ. سنُخبرك حين يستزيد أحدٌ من تأمّلاتك.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => {
            const view = renderNotification(row);
            const unreadRow = !row.read_at;
            return (
              <li key={row.id}>
                <Link
                  to={view.href}
                  onClick={() => void onMarkOne(row.id)}
                  className={cn(
                    "block rounded-lg border p-3 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    unreadRow
                      ? "border-gold/40 bg-gold/5 hover:bg-gold/10"
                      : "border-white/10 bg-black/20 hover:border-white/20",
                  )}
                  aria-label={view.title}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
                      {view.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("text-[13px] leading-relaxed", unreadRow ? "font-medium text-foreground" : "text-foreground/85")}>
                          {view.title}
                        </p>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {formatRelativeAr(row.updated_at)}
                        </span>
                      </div>
                      {view.body && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                          {view.body}
                        </p>
                      )}
                    </div>
                    {unreadRow && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-gold"
                        aria-label="غير مقروء"
                      />
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !loading && (
        <div className="flex justify-center pt-2">
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
  );
}

const PAGE = 20;

function ReflectionsTab() {
  const online = useOnline();
  const [items, setItems] = useState<ReflectionArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await listMyReflections({ limit: PAGE, offset: 0 });
      if (!alive) return;
      if (res.ok) {
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
        setHasMore(Boolean(res.has_more));
      } else {
        setError("تعذّر تحميل تأمّلاتك.");
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const res = await listMyReflections({ limit: PAGE, offset: items.length });
    if (res.ok) {
      setItems((prev) => [...prev, ...(res.items ?? [])]);
      setHasMore(Boolean(res.has_more));
      setTotal(res.total ?? 0);
    }
    setLoadingMore(false);
  }, [hasMore, items.length, loadingMore]);

  if (loading) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
        جارٍ التحميل…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-muted-foreground">
        <NotebookPen className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden="true" />
        لم تكتب تأمّلاً بعد. اكتب أوّل تأمّل من أي مادّة أو قصة.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground">{total} تأمّل</p>
      <ul className="space-y-2">
        {items.map((row) => {
          const href = anchorHref(row);
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-gold/85">
                  {anchorLabelAr(row.anchor_type)}
                  {row.anchor_title ? ` · ${row.anchor_title}` : ""}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatRelativeAr(row.updated_at ?? row.created_at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">
                {row.body}
              </p>
              {row.source === "comment" && (
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3.5" aria-hidden="true" />
                    <span className="tabular-nums">{row.likes}</span>
                    <span className="sr-only">إعجاب</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    <span className="tabular-nums">{row.replies}</span>
                    <span className="sr-only">ردّ</span>
                  </span>
                  {row.status === "hidden" && (
                    <span className="rounded-full border border-white/10 px-2 py-0.5">قيد المراجعة</span>
                  )}
                </div>
              )}
            </>
          );
          return (
            <li key={`${row.source}:${row.id}`}>
              {href ? (
                <Link
                  to={href}
                  className="block rounded-lg border border-white/10 bg-black/20 p-3 transition-colors hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  {body}
                </Link>
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <div className="flex justify-center pt-2">
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
  );
}

// ------------------------------------------------------------
// مساهماتي — full archive of the player's conversations with the
// Irth team (bugs, corrections, suggestions, general messages).
// ------------------------------------------------------------
function ContributionsTab() {
  const [rows, setRows] = useState<FeedbackIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyIssues()
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setError((e as Error).message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">
          كل مساهمة تفتح محادثة مباشرة مع فريق إرث.
        </p>
        <Link
          to="/feedback/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[12px] font-bold text-slate-950 hover:bg-gold/90"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          مساهمة جديدة
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-6 text-center text-sm text-muted-foreground">
          جارٍ التحميل…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          تعذّر تحميل مساهماتك.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-8 text-center text-sm text-muted-foreground">
          <InboxIcon className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden="true" />
          لا توجد مساهمات بعد. شارك أوّل اقتراح أو تصحيح لمساعدة إرث على النمو.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const cat = CATEGORY_MAP[r.category];
            const st = STATUS_LABELS[r.status];
            const Icon = cat?.icon ?? MessageSquare;
            const hasReply = r.player_unread;
            return (
              <li key={r.id}>
                <Link
                  to="/feedback/$id"
                  params={{ id: r.id }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    hasReply
                      ? "border-gold/40 bg-gold/5 hover:bg-gold/10"
                      : "border-white/10 bg-black/20 hover:border-white/20",
                  )}
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", cat?.accentBg, cat?.accent)}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-medium text-foreground">{r.title}</p>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatRelativeAr(r.last_reply_at ?? r.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", st?.chip)}>
                        <span className={cn("size-1.5 rounded-full", st?.dot)} />
                        {st?.label}
                      </span>
                      <span>{cat?.label}</span>
                      {hasReply && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 px-2 py-0.5 text-gold">
                          <MessageCircle className="size-3" aria-hidden="true" />
                          ردّ جديد
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
