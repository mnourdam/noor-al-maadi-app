import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Trash2, ChevronLeft, MailOpen, CheckCheck, Image as ImageIcon } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { CachedImage } from "@/components/CachedImage";
import { resolveCategory } from "@/lib/notifications/categories";
import { resolveDeepLink, isInformationalNotification, type NotificationPayload } from "@/lib/notifications/deepLink";
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteMyNotification,
  clearMyNotifications,
  subscribeToMyNotifications,
  type ServerNotification,
} from "@/lib/notifications/server";
import { useStashCurrentAsOrigin } from "@/lib/navigation";


export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "مركز الإشعارات — إرث" }] }),
  component: NotificationsCenter,
});

type Bucket = "today" | "yesterday" | "earlier";

function bucketOf(iso: string): Bucket {
  const d = new Date(iso);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const t = d.getTime();
  if (t >= startToday) return "today";
  if (t >= startYesterday) return "yesterday";
  return "earlier";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `قبل ${day} ي`;
  return new Date(iso).toLocaleDateString("ar", { month: "short", day: "numeric" });
}

function NotificationsCenter() {
  const router = useRouter();
  const stashOrigin = useStashCurrentAsOrigin();
  const [rows, setRows] = useState<ServerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);


  const refresh = useCallback(async () => {
    const list = await fetchMyNotifications(150);
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeToMyNotifications(() => { void refresh(); });
    const onLocal = () => { void refresh(); };
    window.addEventListener("irth:notifications:updated", onLocal);
    return () => {
      unsub();
      window.removeEventListener("irth:notifications:updated", onLocal);
    };
  }, [refresh]);

  const open = async (n: ServerNotification) => {
    if (!n.read_at) {
      setRows((cur) => cur.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)));
      void markNotificationRead(n.id);
    }
    // Reminder / informational entries are read-only inside the center —
    // tapping them just marks as read; no navigation.
    if (isInformationalNotification({ type: n.type, category: n.category, deep_link: n.deep_link, payload: n.payload as NotificationPayload })) {
      return;
    }
    const to = resolveDeepLink({
      type: n.type, category: n.category, deep_link: n.deep_link,
      payload: n.payload as NotificationPayload,
    });
    const [path, hashPart] = to.split("#");
    // Stash /notifications as origin so Back from the target returns
    // here rather than falling through to the target's structural parent.
    stashOrigin(path || "/");
    try {
      await router.navigate({ to: (path || "/") as "/", hash: hashPart || undefined });
    } catch {
      window.location.href = to;
    }
  };


  const remove = async (id: string) => {
    setRows((cur) => cur.filter((r) => r.id !== id));
    await deleteMyNotification(id);
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setRows((cur) => cur.map((r) => ({ ...r, read_at: r.read_at ?? now })));
    await markAllNotificationsRead();
    setFeedback("تم تحديد كل الإشعارات كمقروءة.");
    setTimeout(() => setFeedback(null), 2500);
  };

  const clearAll = async () => {
    if (!window.confirm("مسح كل الإشعارات من المركز؟")) return;
    setRows([]);
    await clearMyNotifications();
  };

  const unreadTotal = rows.filter((r) => !r.read_at).length;
  const groups: Record<Bucket, ServerNotification[]> = { today: [], yesterday: [], earlier: [] };
  for (const r of rows) groups[bucketOf(r.created_at)].push(r);

  return (
    <AppShell>
      <Screen title="مركز الإشعارات" subtitle="كل تنبيهاتك في مكان واحد، تبقى محفوظة حتى تحذفها">
        {feedback && (
          <div className="mb-3 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-[12px] text-gold">
            {feedback}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> الحساب
          </Link>
          <div className="flex items-center gap-2">
            {unreadTotal > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/5 px-3 py-1.5 text-[11px] text-gold transition hover:bg-gold/10">
                <CheckCheck className="size-3.5" /> تحديد الكل كمقروء
              </button>
            )}
            {rows.length > 0 && (
              <button onClick={clearAll} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground transition hover:border-rose-400/40 hover:text-rose-300">
                <Trash2 className="size-3.5" /> مسح الكل
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/5 bg-surface/40" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-gold/25 bg-surface p-10 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/30">
              <MailOpen className="size-7" />
            </div>
            <p className="font-display mt-4 text-base font-bold">لا توجد إشعارات</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              ستظهر هنا كل التنبيهات: الحملات الجديدة، الموسوعة، التحقيقات، المكافآت، وما يحدث في مثل هذا اليوم.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <Group label="اليوم"     items={groups.today}     onOpen={open} onRemove={remove} />
            <Group label="الأمس"    items={groups.yesterday} onOpen={open} onRemove={remove} />
            <Group label="سابقاً"    items={groups.earlier}   onOpen={open} onRemove={remove} />
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function Group({
  label, items, onOpen, onRemove,
}: {
  label: string;
  items: ServerNotification[];
  onOpen: (n: ServerNotification) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold text-gold">{label}</h2>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <Row key={n.id} n={n} onOpen={onOpen} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  n, onOpen, onRemove,
}: {
  n: ServerNotification;
  onOpen: (n: ServerNotification) => void;
  onRemove: (id: string) => void;
}) {
  const cat = resolveCategory(n.category ?? n.type);
  const Icon = cat.icon;
  const unread = !n.read_at;
  const isHigh = n.priority === "high";

  return (
    <li>
      <div
        className={[
          "group relative flex items-stretch gap-3 overflow-hidden rounded-2xl border p-3 transition",
          unread
            ? "border-gold/40 bg-gradient-to-br from-gold/8 via-background/60 to-background/40"
            : "border-white/10 bg-surface/60 hover:border-white/20",
        ].join(" ")}
      >
        {isHigh && <span className="absolute inset-y-0 right-0 w-[3px] bg-gradient-to-b from-gold via-amber-300 to-gold" />}
        <button onClick={() => onOpen(n)} className="flex flex-1 items-start gap-3 text-right">
          {n.image_url ? (
            <CachedImage src={n.image_url} alt="" className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-gold/20" loading="lazy" />
          ) : (
            <div className={`grid size-14 shrink-0 place-items-center rounded-xl ${cat.accentBg} ring-1 ring-white/10`}>
              <Icon className={`size-5 ${cat.accent}`} strokeWidth={1.7} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 font-display text-sm font-bold leading-relaxed text-foreground">{n.title}</p>
              {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gradient-gold" aria-label="غير مقروء" />}
            </div>
            {/* Full body — never clamped/truncated. Long Arabic text wraps
                naturally and the card grows with it. */}
            <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">{n.body}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
              <span className={`inline-flex items-center gap-1 ${cat.accent}`}>
                <Icon className="size-3" /> {cat.label}
              </span>
              <span className="shrink-0">{relativeTime(n.created_at)}</span>
            </div>
          </div>

        </button>
        <button
          onClick={() => onRemove(n.id)}
          aria-label="حذف"
          className="grid size-7 shrink-0 place-items-center self-start rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-300"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

// Re-export the bucket icon so tree-shaking knows it's referenced.
export const _ICON_REF = ImageIcon;
