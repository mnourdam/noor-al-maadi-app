// ============================================================
// /inbox — Personal Notifications (P6 Step 3)
// ------------------------------------------------------------
// Aligned to the frozen philosophy: personal, quiet, useful,
// educational, never addictive. Only shows events that concern
// the current user's own comments (plus story unlocks).
//
// Pagination from day one (cursor-based). Never preloads history.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCheck, MailOpen } from "lucide-react";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "الصندوق الشخصي — إرث" },
      { name: "description", content: "تنبيهاتك الشخصية على منصّة إرث — هادئة، مفيدة، بلا ضجيج." },
      { property: "og:title", content: "الصندوق الشخصي — إرث" },
      { property: "og:description", content: "تنبيهاتك الشخصية على منصّة إرث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InboxScreen,
});

function InboxScreen() {
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
  }, []);

  const unread = items.filter((r) => !r.read_at).length;

  if (!user) {
    return (
      <AppShell>
        <Screen title="الصندوق الشخصي" subtitle="سجّل الدخول لعرض تنبيهاتك.">
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
      </Screen>
    </AppShell>
  );
}
