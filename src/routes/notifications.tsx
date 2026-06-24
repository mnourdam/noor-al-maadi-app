import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Bell, Trash2, ChevronLeft, Calendar, Crown, Compass, Sparkles, MailOpen, UserPlus, CheckCheck } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  clearInbox, getInbox, markAllRead, markRead, isUnread, type InAppNotification,
} from "@/lib/notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات" }] }),
  component: NotificationsPage,
});

const CAT_ICON = {
  daily: Calendar,
  reengagement: Compass,
  season: Sparkles,
  campaign: Crown,
  friend: UserPlus,
} as const;

const CAT_LABEL = {
  daily: "اليوم في التاريخ",
  reengagement: "تذكير",
  season: "الموسم",
  campaign: "الحملات",
  friend: "الأصدقاء",
} as const;

function NotificationsPage() {
  const [list, setList] = useState<InAppNotification[]>([]);
  const [persistError, setPersistError] = useState<string | null>(null);

  const refresh = useCallback(() => setList(getInbox()), []);

  useEffect(() => {
    refresh();
    window.addEventListener("irth:notifications:updated", refresh);
    return () => window.removeEventListener("irth:notifications:updated", refresh);
  }, [refresh]);

  const unread = list.filter(isUnread).sort((a, b) => b.at - a.at);
  const read = list.filter((n) => !isUnread(n)).sort((a, b) => b.at - a.at);

  // PR5: optimistic mark-as-read with rollback on storage failure.
  const onOpen = (id: string) => {
    const snapshot = list;
    const optimistic = list.map((n) =>
      n.id === id && isUnread(n) ? { ...n, read: true, readAt: Date.now() } : n,
    );
    setList(optimistic);
    const ok = markRead(id);
    if (!ok) {
      setList(snapshot);
      setPersistError("تعذّر حفظ حالة القراءة. حاول مرة أخرى.");
      setTimeout(() => setPersistError(null), 3000);
    }
  };

  const onMarkAllRead = () => {
    const snapshot = list;
    const now = Date.now();
    setList(list.map((n) => ({ ...n, read: true, readAt: n.readAt ?? now })));
    const ok = markAllRead();
    if (!ok) {
      setList(snapshot);
      setPersistError("تعذّر حفظ حالة القراءة. حاول مرة أخرى.");
      setTimeout(() => setPersistError(null), 3000);
    }
  };


  return (
    <AppShell>
      <Screen title="الإشعارات" subtitle="آخر تنبيهاتك التاريخية">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> الحساب
          </Link>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button
                onClick={() => { markAllRead(); }}
                className="inline-flex items-center gap-1 rounded-full border border-gold/40 px-3 py-1 text-[11px] text-gold hover:bg-gold/10"
              >
                <CheckCheck className="size-3.5" /> تحديد الكل كمقروء
              </button>
            )}
            {list.length > 0 && (
              <button
                onClick={() => { clearInbox(); }}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11px] text-muted-foreground hover:text-rose-300"
              >
                <Trash2 className="size-3.5" /> مسح الكل
              </button>
            )}
          </div>
        </div>

        {list.length === 0 ? (
          <div className="rounded-3xl border border-gold/25 bg-surface p-8 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-gold/10 text-gold"><MailOpen className="size-6" /></div>
            <p className="font-display mt-3 text-base font-bold">لا توجد إشعارات حتى الآن</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              ستصلك تنبيهات يومية عن أحداث التاريخ والحملات الجديدة والمواسم.
            </p>
          </div>
        ) : (
          <>
            <Section
              heading="غير مقروءة"
              count={unread.length}
              items={unread}
              onOpen={onOpen}
              emptyText="لا توجد إشعارات غير مقروءة."
            />
            <Section
              heading="تمت قراءتها"
              count={read.length}
              items={read}
              onOpen={onOpen}
              emptyText=""
              muted
            />
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function Section({
  heading, count, items, onOpen, emptyText, muted,
}: {
  heading: string;
  count: number;
  items: InAppNotification[];
  onOpen: (id: string) => void;
  emptyText: string;
  muted?: boolean;
}) {
  if (items.length === 0 && !emptyText) return null;
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-gold">{heading}</h2>
        <span className="text-[11px] text-muted-foreground">{count}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-surface/60 p-3 text-center text-[12px] text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = CAT_ICON[n.category] ?? Bell;
            const unread = isUnread(n);
            return (
              <li key={n.id}>
                <Link
                  to={(n.href ?? "/") as "/"}
                  onClick={() => onOpen(n.id)}
                  className={`flex items-start gap-3 rounded-2xl border p-3 transition hover:border-gold/40 ${
                    unread
                      ? "border-gold/40 bg-gold/5"
                      : `border-white/10 bg-surface ${muted ? "opacity-80" : ""}`
                  }`}
                >
                  <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                    <Icon className="size-4" />
                    {unread && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-gradient-gold" aria-label="غير مقروء" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display truncate text-sm font-bold">{n.title}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{CAT_LABEL[n.category]}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[10px] text-gold/70">{new Date(n.at).toLocaleString("en-US")}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
