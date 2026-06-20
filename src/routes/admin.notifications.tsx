import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Bell, Send, Save, RefreshCw, ShieldAlert, Zap, CalendarClock, UserMinus, Flag, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";

// ============================================================
// /admin/notifications — Admin notification composer
// Protected by a hardcoded allowed-email list (placeholder).
// ============================================================

const ALLOWED_ADMIN_EMAILS = ["mnourdam@gmail.com"];
const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const NORMALIZED_ALLOWED_ADMIN_EMAILS = ALLOWED_ADMIN_EMAILS.map(normalizeEmail);

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "إدارة الإشعارات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminNotificationsPage,
});

type NotificationType =
  | "manual"
  | "campaign_update"
  | "today_in_history"
  | "daily_fact"
  | "incomplete_campaign"
  | "system_update";

type TargetType = "all" | "user";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  target_type: string;
  target_user_id: string | null;
  deep_link: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

function AdminNotificationsPage() {
  const { user: accountUser, loadingSession } = useAccount();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("admin-lite");
    return () => document.documentElement.classList.remove("admin-lite");
  }, []);

  useEffect(() => {
    if (loadingSession) return;
    let alive = true;
    (async () => {
      const [{ data: sessionData }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      if (!alive) return;
      const sessionUser = sessionData.session?.user ?? null;
      const currentUser = userData.user ?? accountUser ?? sessionUser;
      const currentUserId = currentUser?.id ?? null;
      const currentEmail = currentUser?.email ?? null;
      const isAdmin = NORMALIZED_ALLOWED_ADMIN_EMAILS.includes(normalizeEmail(currentEmail));
      console.log("[admin notifications] current user id:", currentUserId);
      console.log("[admin notifications] current email:", currentEmail);
      console.log("[admin notifications] allowed emails:", ALLOWED_ADMIN_EMAILS);
      console.log("[admin notifications] isAdmin:", isAdmin);
      setUserId(currentUserId);
      setEmail(currentEmail);
      setAllowed(isAdmin);
      setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [accountUser, loadingSession]);

  const debugBlock = <AdminDebugBlock userId={userId} email={email} isAdmin={allowed} />;

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">صفحة محصورة على المشرفين</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `الحساب الحالي (${email}) لا يملك صلاحية الوصول.` : "يرجى تسجيل الدخول بحساب مشرف."}
          </p>
          {debugBlock}
        </div>
      </div>
    );
  }

  return <Composer debugBlock={debugBlock} />;
}

function AdminDebugBlock({ userId, email, isAdmin }: { userId: string | null; email: string | null; isAdmin: boolean }) {
  return (
    <div dir="ltr" className="mt-4 rounded-md border border-border bg-background p-3 text-left text-xs text-foreground">
      <div className="font-semibold">Temporary admin debug</div>
      <div>current user id: {userId ?? "null"}</div>
      <div>current email: {email ?? "null"}</div>
      <div>isAdmin result: {String(isAdmin)}</div>
    </div>
  );
}

function Composer({ debugBlock }: { debugBlock: ReactNode }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NotificationType>("manual");
  const [targetType, setTargetType] = useState<TargetType>("all");
  const [targetUserId, setTargetUserId] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [recent, setRecent] = useState<NotificationRow[]>([]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent(((data ?? []) as unknown) as NotificationRow[]);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const buildPayload = () => ({
    title: title.trim(),
    body: body.trim(),
    type,
    target_type: targetType,
    target_user_id: targetType === "user" ? targetUserId.trim() || null : null,
    deep_link: deepLink.trim() || null,
  });

  const createDraft = async () => {
    if (!title.trim() || !body.trim()) {
      setFeedback("يرجى إدخال العنوان والمحتوى.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const insert: any = {
        ...buildPayload(),
        status: scheduled ? "scheduled" : "draft",
        scheduled_at: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };
      const { error } = await supabase.from("notifications" as any).insert(insert);
      if (error) throw error;
      setFeedback("تم حفظ الإشعار.");
      await loadRecent();
    } catch (err: any) {
      setFeedback(`فشل الحفظ: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    if (!title.trim() || !body.trim()) {
      setFeedback("يرجى إدخال العنوان والمحتوى.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: buildPayload(),
      });
      if (error) throw error;
      setFeedback(
        `تم الإرسال — ${data?.sent ?? 0} ناجح / ${data?.failed ?? 0} فاشل من أصل ${data?.total ?? 0}.`,
      );
      await loadRecent();
    } catch (err: any) {
      setFeedback(`فشل الإرسال: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة الإشعارات</h1>
          <Link to="/admin/import" search={{ type: "notifications" }} className="ml-auto inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <BookOpen className="h-4 w-4" /> استيراد مسودات إشعارات
          </Link>
          <Link to="/admin" className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">لوحة الإدارة</Link>
        </header>
        {debugBlock}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">إنشاء إشعار جديد</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">العنوان</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="عنوان الإشعار"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">المحتوى</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                placeholder="نص الإشعار"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">النوع</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as NotificationType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="manual">يدوي</option>
                  <option value="campaign_update">تحديث حملة</option>
                  <option value="today_in_history">في مثل هذا اليوم</option>
                  <option value="daily_fact">معلومة تاريخية</option>
                  <option value="incomplete_campaign">حملة غير مكتملة</option>
                  <option value="system_update">تحديث النظام</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">الجمهور</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value as TargetType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="all">كل المستخدمين</option>
                  <option value="user">مستخدم محدد</option>
                </select>
              </div>
            </div>

            {targetType === "user" && (
              <div>
                <label className="mb-1 block text-sm font-medium">معرف المستخدم (UUID)</label>
                <input
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium">رابط داخلي (deep link)</label>
              <input
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder="/campaigns/prophetic-mission"
              />
            </div>

            <div className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                />
                جدولة الإرسال لاحقًا
              </label>
              {scheduled && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2"
                />
              )}
            </div>

            {feedback && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {feedback}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={createDraft}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                حفظ كمسودة
              </button>
              <button
                onClick={sendNow}
                disabled={busy || scheduled}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                إرسال الآن
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">آخر الإشعارات</h2>
            <button
              onClick={loadRecent}
              className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
            >
              <RefreshCw className="h-3 w-3" />
              تحديث
            </button>
          </div>

          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((n) => (
                <li key={n.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{n.title}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-2 py-0.5">{n.type}</span>
                        <span className="rounded bg-muted px-2 py-0.5">{n.target_type}</span>
                        {n.deep_link && (
                          <span className="rounded bg-muted px-2 py-0.5 font-mono">{n.deep_link}</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                        n.status === "sent"
                          ? "bg-green-500/15 text-green-500"
                          : n.status === "failed"
                          ? "bg-destructive/15 text-destructive"
                          : n.status === "scheduled"
                          ? "bg-blue-500/15 text-blue-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AutomaticNotifications />
      </div>
    </div>
  );
}

// ============================================================
// Automatic notifications section
// ============================================================
type AutoRun = {
  id: string;
  job_key: string;
  run_date: string;
  status: string;
  notification_id: string | null;
  created_at: string;
};

const AUTO_JOBS: { key: string; title: string; desc: string; icon: any }[] = [
  { key: "today_in_history", title: "في مثل هذا اليوم", desc: "حدث تاريخي مطابق لتاريخ اليوم.", icon: CalendarClock },
  { key: "daily_fact", title: "معلومة تاريخية", desc: "معلومة يومية يتم تدويرها بين المستخدمين.", icon: BookOpen },
  { key: "inactive_user", title: "تذكير العودة", desc: "تذكير للمستخدمين غير النشطين لأكثر من 3 أيام.", icon: UserMinus },
  { key: "incomplete_campaign", title: "حملة غير مكتملة", desc: "تذكير لإكمال الحملات المفتوحة.", icon: Flag },
];

function AutomaticNotifications() {
  const [runs, setRuns] = useState<AutoRun[]>([]);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    const { data } = await supabase
      .from("automatic_notification_runs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setRuns(((data ?? []) as unknown) as AutoRun[]);
  }, []);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  const runJob = async (jobKey: string | null) => {
    setBusyJob(jobKey ?? "all");
    setFeedback(null);
    try {
      const { data, error } = await supabase.functions.invoke("run-automatic-notifications", {
        body: jobKey ? { jobs: [jobKey] } : {},
      });
      if (error) throw error;
      setFeedback(`تم التشغيل — ${JSON.stringify(data?.results ?? data)}`);
      await loadRuns();
    } catch (err: any) {
      setFeedback(`فشل التشغيل: ${err.message ?? err}`);
    } finally {
      setBusyJob(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap className="h-5 w-5 text-primary" />
          الإشعارات التلقائية
        </h2>
        <button
          onClick={() => runJob(null)}
          disabled={!!busyJob}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Zap className="h-3 w-3" />
          تشغيل اختبار الآن (الكل)
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {AUTO_JOBS.map((job) => {
          const Icon = job.icon;
          const isBusy = busyJob === job.key;
          return (
            <div key={job.key} className="rounded-md border border-border p-3">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{job.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{job.desc}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">{job.key}</div>
                </div>
              </div>
              <button
                onClick={() => runJob(job.key)}
                disabled={!!busyJob}
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-input px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {isBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                تشغيل اختبار الآن
              </button>
            </div>
          );
        })}
      </div>

      {feedback && (
        <pre dir="ltr" className="mt-4 max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] text-left">
          {feedback}
        </pre>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">آخر 10 عمليات تلقائية</h3>
          <button
            onClick={loadRuns}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
          >
            <RefreshCw className="h-3 w-3" />
            تحديث
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عمليات بعد.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono">{r.job_key}</span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.run_date}</span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 ${
                    r.status === "success"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
