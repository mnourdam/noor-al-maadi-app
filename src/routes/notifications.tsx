import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Trash2, ChevronLeft, Calendar, Crown, Compass, Sparkles, MailOpen, UserPlus } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import {
  clearInbox, getInbox, markAllRead, type InAppNotification,
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

  useEffect(() => {
    setList(getInbox());
    markAllRead();
    window.dispatchEvent(new CustomEvent("irth:notifications:updated"));
  }, []);

  return (
    <AppShell>
      <Screen title="الإشعارات" subtitle="آخر تنبيهاتك التاريخية">
        <div className="mb-3 flex items-center justify-between">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="size-4" /> الحساب
          </Link>
          {list.length > 0 && (
            <button
              onClick={() => { clearInbox(); setList([]); window.dispatchEvent(new CustomEvent("irth:notifications:updated")); }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11px] text-muted-foreground hover:text-rose-300"
            >
              <Trash2 className="size-3.5" /> مسح الكل
            </button>
          )}
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
          <ul className="space-y-2">
            {list.map((n) => {
              const Icon = CAT_ICON[n.category] ?? Bell;
              return (
                <li key={n.id}>
                  <Link
                    to={(n.href ?? "/") as "/"}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-surface p-3 transition hover:border-gold/40"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                      <Icon className="size-4" />
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
      </Screen>
    </AppShell>
  );
}