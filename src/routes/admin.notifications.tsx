import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell, Send, Save, RefreshCw, ShieldAlert, Zap, CalendarClock, UserMinus,
  Flag, BookOpen, Trash2, Sparkles, History, LayoutDashboard, Copy, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/admin-guard";
import {
  ALL_CATEGORY_KEYS, NOTIFICATION_CATEGORIES,
  type NotificationCategoryKey,
} from "@/lib/notifications/categories";
import { LivePreview } from "@/components/admin/notifications/LivePreview";
import { IconPicker } from "@/components/admin/notifications/IconPicker";
import {
  DeepLinkPicker, buildOutput,
} from "@/components/admin/notifications/DeepLinkPicker";
import {
  SegmentPicker, type AudienceValue,
} from "@/components/admin/notifications/SegmentPicker";
import { TemplateGallery } from "@/components/admin/notifications/TemplateGallery";
import { DeliveryStatsPanel } from "@/components/admin/notifications/DeliveryStatsPanel";
import { findTemplate, type NotificationTemplate } from "@/lib/notifications/admin/templates";
import {
  resolveAudience, validateNumericFilter, filterSegmentId,
} from "@/lib/notifications/admin/segments";
import { validateExternalUrl } from "@/lib/notifications/externalUrl";


// ============================================================
// /admin/notifications — Upgraded production composer.
// All upgrades are ADDITIVE: the existing send-notification edge function,
// notifications table reads, and AutomaticNotifications section continue
// to work without changes.
// ============================================================

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

type Priority = "low" | "normal" | "high";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  category: string | null;
  target_type: string;
  target_user_id: string | null;
  target_user_ids?: string[] | null;
  target_segment_id?: string | null;
  deep_link: string | null;
  image_url: string | null;
  icon: string | null;
  priority: string | null;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  archived_at?: string | null;
}

type Tab = "compose" | "templates" | "history" | "automatic";

function AdminNotificationsPage() {
  const { checking, caps, email } = useAdminGuard();

  useEffect(() => {
    document.documentElement.classList.add("admin-lite");
    return () => document.documentElement.classList.remove("admin-lite");
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!caps.is_manager) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">صفحة محصورة على المشرفين</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {email ? `الحساب الحالي (${email}) لا يملك صلاحية الوصول.` : "يرجى تسجيل الدخول بحساب مشرف."}
          </p>
        </div>
      </div>
    );
  }

  return <Shell />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("compose");
  const [pendingTemplate, setPendingTemplate] = useState<NotificationTemplate | null>(null);

  return (
    <div dir="rtl" className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة الإشعارات</h1>
          <div className="mr-auto flex flex-wrap items-center gap-2">
            <Link to="/admin/import" search={{ type: "notifications" }} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
              <BookOpen className="h-4 w-4" /> استيراد مسودات
            </Link>
            <Link to="/admin" className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">لوحة الإدارة</Link>
          </div>
        </header>

        <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          <TabButton active={tab === "compose"}   onClick={() => setTab("compose")}    icon={<LayoutDashboard className="size-4" />} label="إنشاء" />
          <TabButton active={tab === "templates"} onClick={() => setTab("templates")}  icon={<Sparkles className="size-4" />}        label="القوالب" />
          <TabButton active={tab === "history"}   onClick={() => setTab("history")}    icon={<History className="size-4" />}         label="السجل والإحصاءات" />
          <TabButton active={tab === "automatic"} onClick={() => setTab("automatic")}  icon={<Zap className="size-4" />}             label="التلقائية" />
        </nav>

        {tab === "compose" && (
          <Composer
            initialTemplate={pendingTemplate}
            consumeTemplate={() => setPendingTemplate(null)}
          />
        )}
        {tab === "templates" && (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">القوالب الجاهزة</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              اختر قالبًا لتعبئته في نموذج الإنشاء — يمكنك تعديل كل شيء قبل الإرسال.
            </p>
            <TemplateGallery
              onPick={(t) => { setPendingTemplate(t); setTab("compose"); toast.success(`تم تحميل القالب: ${t.label}`); }}
            />
          </section>
        )}
        {tab === "history" && <HistoryTab />}
        {tab === "automatic" && <AutomaticNotifications />}
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================
// Composer — keeps existing draft/send flow intact; adds pickers,
// live preview, smart segments, and send-test-to-me.
// ============================================================

function Composer({
  initialTemplate,
  consumeTemplate,
}: {
  initialTemplate: NotificationTemplate | null;
  consumeTemplate: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NotificationType>("manual");
  const [category, setCategory] = useState<NotificationCategoryKey>("admin");
  const [priority, setPriority] = useState<Priority>("normal");
  const [icon, setIcon] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [audience, setAudience] = useState<AudienceValue>({ mode: "all" });
  const [destination, setDestination] = useState({
    destinationId: "",
    params: {} as Record<string, string>,
    rawDeepLink: "",
    deep_link: "",
    payload: {} as Record<string, unknown>,
  });
  const [payloadText, setPayloadText] = useState("");
  // V16: mutually-exclusive action model — no action / internal / external.
  const [actionMode, setActionMode] = useState<"none" | "internal" | "external">("internal");
  const [externalUrl, setExternalUrl] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<NotificationRow[]>([]);

  // Apply template when one was picked from the gallery.
  useEffect(() => {
    if (!initialTemplate) return;
    setTitle(initialTemplate.title);
    setBody(initialTemplate.body);
    setCategory(initialTemplate.category);
    setPriority(initialTemplate.priority);
    setIcon(initialTemplate.icon);
    if (initialTemplate.deepLink) {
      const out = buildOutput(initialTemplate.deepLink.id, initialTemplate.deepLink.params ?? {}, "");
      setActionMode("internal");
      setDestination({
        destinationId: initialTemplate.deepLink.id,
        params: initialTemplate.deepLink.params ?? {},
        rawDeepLink: "",
        ...out,
      });
    }
    consumeTemplate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplate]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent(((data ?? []) as unknown) as NotificationRow[]);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const buildPayload = (override?: { resolvedIds?: string[] }) => {
    let extra: Record<string, unknown> = {};
    if (payloadText.trim()) {
      try { extra = JSON.parse(payloadText); }
      catch { throw new Error("payload JSON غير صالح"); }
    }
    const mergedPayload: Record<string, unknown> = { ...destination.payload, ...extra };
    // The action is mutually exclusive: an external link never ships with an
    // internal deep_link, and a non-external send never carries external_url.
    delete mergedPayload["external_url"];
    let deepLinkOut: string | null = null;
    if (actionMode === "internal") {
      deepLinkOut = destination.deep_link || null;
    } else if (actionMode === "external") {
      const res = validateExternalUrl(externalUrl);
      if (!res.ok) throw new Error(res.error);
      mergedPayload["external_url"] = res.url;
    }

    // Audience → legacy fields kept for backwards compatibility with the
    // edge function. `target_user_ids` activates only for segment/filter
    // sends; all/user paths stay byte-identical to the legacy flow.
    let target_type: string = "all";
    let target_user_id: string | null = null;
    let target_user_ids: string[] | null = null;
    let target_segment_id: string | null = null;
    if (audience.mode === "user") {
      target_type = "user";
      target_user_id = (audience.userId ?? "").trim() || null;
    } else if (audience.mode === "segment" || audience.mode === "filter") {
      target_type = "segment";
      const resolution = audience.resolution;
      target_user_ids = override?.resolvedIds
        ?? (resolution && resolution.status === "ok" ? resolution.userIds : []);
      target_segment_id = audience.mode === "segment"
        ? (audience.segmentId ?? null)
        : (audience.filter ? filterSegmentId(audience.filter) : null);
    }

    return {
      title: title.trim(),
      body: body.trim(),
      type,
      category,
      priority,
      sender: "admin" as const,
      icon: icon.trim() || null,
      image_url: imageUrl.trim() || null,
      target_type,
      target_user_id,
      target_user_ids,
      target_segment_id,
      deep_link: deepLinkOut,
      payload: mergedPayload,
    };
  };

  const validate = (): string | null => {
    if (!title.trim()) return "العنوان مطلوب.";
    if (!body.trim()) return "المحتوى مطلوب.";
    if (actionMode === "external") {
      const res = validateExternalUrl(externalUrl);
      if (!res.ok) return res.error;
    }
    if (audience.mode === "user" && !(audience.userId ?? "").trim()) return "حدّد معرّف المستخدم.";
    if (audience.mode === "segment" && !audience.segmentId) return "اختر شريحة.";
    if (audience.mode === "filter") {
      const invalid = validateNumericFilter(audience.filter);
      if (invalid) return invalid;
    }
    if (audience.mode === "segment" || audience.mode === "filter") {
      const resolution = audience.resolution;
      if (!resolution || resolution.status === "loading") return "جارٍ حساب الجمهور — انتظر لحظة.";
      if (resolution.status === "error") return `تعذّر تحديد الجمهور: ${resolution.message}`;
      if (resolution.userIds.length === 0) return "الشريحة المختارة لا تحتوي على مستلمين.";
    }
    return null;
  };


  const createDraft = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const insert: any = {
        ...buildPayload(),
        status: scheduled ? "scheduled" : "draft",
        scheduled_at: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };
      const { error } = await supabase.from("notifications" as never).insert(insert);
      if (error) throw error;
      toast.success("تم حفظ الإشعار.");
      await loadRecent();
    } catch (e: any) {
      toast.error(`فشل الحفظ: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      let override: { resolvedIds: string[] } | undefined;
      // Re-resolve immediately before sending: the composer may have been
      // open for a long time, and the send must use a freshly validated
      // audience — never a stale array. A failure here aborts the send.
      if (audience.mode === "segment" || audience.mode === "filter") {
        const fresh = await resolveAudience({
          segmentId: audience.mode === "segment" ? audience.segmentId : null,
          filter: audience.mode === "filter" ? audience.filter : null,
        });
        setAudience({ ...audience, resolution: fresh });
        if (fresh.status === "error") {
          toast.error(`أُلغي الإرسال — تعذّر تحديد الجمهور: ${fresh.message}`);
          return;
        }
        if (fresh.userIds.length === 0) {
          toast.error("أُلغي الإرسال — الشريحة لا تطابق أي مستخدم الآن.");
          return;
        }
        override = { resolvedIds: fresh.userIds };
      }
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: buildPayload(override),
      });
      if (error) throw error;
      toast.success(`تم الإرسال — ${data?.sent ?? 0} ناجح / ${data?.failed ?? 0} فاشل من أصل ${data?.total ?? 0}.`);
      await loadRecent();
    } catch (e: any) {
      toast.error(`فشل الإرسال: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };


  const sendTestToMe = async () => {
    if (!title.trim() || !body.trim()) { toast.error("العنوان والمحتوى مطلوبان."); return; }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("لا توجد جلسة حالية.");
      const base = buildPayload();
      const testBody = {
        ...base,
        target_type: "user",
        target_user_id: uid,
        target_user_ids: null,
        target_segment_id: null,
        payload: { ...(base.payload ?? {}), test: true },
        title: `[اختبار] ${base.title}`,
      };
      const { data, error } = await supabase.functions.invoke("send-notification", { body: testBody });
      if (error) throw error;
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      if (sent > 0) toast.success("تم إرسال الاختبار إليك.");
      else if (failed > 0) toast.error("فشل الإرسال — تحقّق من تسجيل جهازك لـ FCM.");
      else toast("لا يوجد جهاز مسجّل لاستلام الإشعار. الإشعار محفوظ في مركز الإشعارات داخل التطبيق.");
      await loadRecent();
    } catch (e: any) {
      toast.error(`فشل الاختبار: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const titleLen = title.length;
  const bodyLen = body.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold">إنشاء إشعار</h2>

        <Group title="المحتوى">
          <Field label="العنوان" hint={`${titleLen}/65`}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              placeholder="عنوان الإشعار"
            />
          </Field>
          <Field label="المحتوى" hint={`${bodyLen}/240`}>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              placeholder="نص الإشعار"
            />
          </Field>
        </Group>

        <Group title="الجمهور">
          <SegmentPicker value={audience} onChange={setAudience} />
        </Group>

        <Group title="المظهر">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="الفئة">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as NotificationCategoryKey)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {ALL_CATEGORY_KEYS.map((k) => (
                  <option key={k} value={k}>{NOTIFICATION_CATEGORIES[k].label}</option>
                ))}
              </select>
            </Field>
            <Field label="الأولوية">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="low">منخفضة</option>
                <option value="normal">عادية</option>
                <option value="high">عالية</option>
              </select>
            </Field>
            <Field label="النوع (داخلي)">
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
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="الأيقونة">
              <IconPicker value={icon} onChange={setIcon} />
            </Field>
            <Field label="رابط الصورة (اختياري)">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder="https://…/cover.jpg"
                dir="ltr"
              />
            </Field>
          </div>
        </Group>

        <Group title="الوجهة">
          <div className="mb-3 flex flex-wrap gap-3 text-sm">
            {([
              ["none", "بدون إجراء"],
              ["internal", "رابط داخل إرث"],
              ["external", "رابط خارجي"],
            ] as const).map(([mode, label]) => (
              <label key={mode} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="notification-action-mode"
                  checked={actionMode === mode}
                  onChange={() => setActionMode(mode)}
                />
                {label}
              </label>
            ))}
          </div>
          {actionMode === "external" && (
            <Field label="الرابط الخارجي (https فقط)">
              <input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
                placeholder="https://youtube.com/…"
                dir="ltr"
              />
              {externalUrl.trim() !== "" && !validateExternalUrl(externalUrl).ok && (
                <p className="mt-1 text-xs text-destructive">
                  {validateExternalUrl(externalUrl).ok ? "" : (validateExternalUrl(externalUrl) as { error: string }).error}
                </p>
              )}
            </Field>
          )}
          {actionMode === "internal" && (
          <DeepLinkPicker
            destinationId={destination.destinationId}
            params={destination.params}
            rawDeepLink={destination.rawDeepLink}
            onChange={setDestination}
          />
          )}
          <details className="mt-2 rounded-md border border-border p-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">payload إضافي (JSON متقدّم — اختياري)</summary>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={3}
              dir="ltr"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px]"
              placeholder='{"customKey":"value"}'
            />
          </details>
        </Group>

        <Group title="الجدولة">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
            جدولة الإرسال لاحقًا
          </label>
          {scheduled && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2"
            />
          )}
        </Group>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <button onClick={createDraft} disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
            <Save className="h-4 w-4" /> حفظ كمسودة
          </button>
          <button onClick={sendTestToMe} disabled={busy}
            className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/15 disabled:opacity-50">
            <Eye className="h-4 w-4" /> أرسل اختبارًا لي
          </button>
          <button onClick={sendNow} disabled={busy || scheduled}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Send className="h-4 w-4" /> إرسال الآن
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <LivePreview
            title={title}
            body={body}
            icon={icon}
            imageUrl={imageUrl}
            category={category}
            priority={priority}
          />
        </section>
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">آخر 5 إشعارات</h3>
          <ul className="space-y-1 text-xs">
            {recent.slice(0, 5).map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{n.title}</span>
                <StatusPill status={n.status} />
              </li>
            ))}
            {recent.length === 0 && <li className="text-muted-foreground">لا يوجد سجل بعد.</li>}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-sm font-medium">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "sent" ? "bg-green-500/15 text-green-500"
      : status === "failed" ? "bg-destructive/15 text-destructive"
      : status === "scheduled" ? "bg-blue-500/15 text-blue-500"
      : "bg-muted text-muted-foreground";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${cls}`}>{status}</span>;
}

// ============================================================
// History tab — full table with per-row delivery analytics drawer.
// ============================================================

function HistoryTab() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(((data ?? []) as unknown) as NotificationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const deleteOne = async (id: string) => {
    if (!confirm("حذف هذا الإشعار نهائيًا؟")) return;
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from("notifications" as never).delete().eq("id", id);
    if (error) { setRows(prev); toast.error(`فشل الحذف: ${error.message}`); }
    else toast.success("تم الحذف.");
  };

  const archiveOne = async (id: string) => {
    const { error } = await supabase
      .from("notifications" as never)
      .update({ archived_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("تمت الأرشفة."); await refresh(); }
  };

  const duplicateOne = async (n: NotificationRow) => {
    const insert: any = {
      title: n.title,
      body: n.body,
      type: n.type,
      category: n.category,
      priority: n.priority ?? "normal",
      sender: "admin",
      icon: n.icon ?? null,
      image_url: n.image_url ?? null,
      target_type: "all",
      deep_link: n.deep_link ?? null,
      payload: {},
      status: "draft",
    };
    const { error } = await supabase.from("notifications" as never).insert(insert);
    if (error) toast.error(error.message);
    else { toast.success("تم إنشاء نسخة كمسودة."); await refresh(); }
  };

  const resendOne = async (n: NotificationRow) => {
    if (!confirm(`إعادة إرسال "${n.title}" إلى ${n.target_type === "all" ? "كل المستخدمين" : "المستلم الأصلي"}؟`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          title: n.title,
          body: n.body,
          type: n.type,
          category: n.category,
          priority: n.priority ?? "normal",
          sender: "admin",
          icon: n.icon ?? null,
          image_url: n.image_url ?? null,
          target_type: n.target_type,
          target_user_id: n.target_user_id,
          target_user_ids: n.target_user_ids ?? null,
          deep_link: n.deep_link ?? null,
          payload: (n as { payload?: Record<string, unknown> | null }).payload ?? {},
        },
      });
      if (error) throw error;
      toast.success(`تم — ${data?.sent ?? 0}/${data?.total ?? 0}.`);
      await refresh();
    } catch (e: any) {
      toast.error(`فشل: ${e.message ?? e}`);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">سجل الإشعارات</h2>
        <button onClick={refresh} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1 text-xs hover:bg-accent">
          <RefreshCw className="h-3 w-3" /> تحديث
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد إشعارات بعد.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{n.title}</div>
                    <StatusPill status={n.status} />
                    {n.archived_at && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">مؤرشف</span>}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{n.body}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded bg-muted px-2 py-0.5">{n.type}</span>
                    <span className="rounded bg-muted px-2 py-0.5">{n.target_type}</span>
                    {n.target_segment_id && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">شريحة: {n.target_segment_id}</span>
                    )}
                    {n.deep_link && <span className="rounded bg-muted px-2 py-0.5 font-mono" dir="ltr">{n.deep_link}</span>}
                    <span>{new Date(n.created_at).toLocaleString("ar")}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button onClick={() => setOpenId(openId === n.id ? null : n.id)}
                    className="inline-flex items-center gap-1 rounded border border-input px-2 py-0.5 text-[11px] hover:bg-accent">
                    <Eye className="h-3 w-3" /> إحصاءات
                  </button>
                  <button onClick={() => duplicateOne(n)}
                    className="inline-flex items-center gap-1 rounded border border-input px-2 py-0.5 text-[11px] hover:bg-accent">
                    <Copy className="h-3 w-3" /> نسخ
                  </button>
                  <button onClick={() => resendOne(n)}
                    className="inline-flex items-center gap-1 rounded border border-input px-2 py-0.5 text-[11px] hover:bg-accent">
                    <Send className="h-3 w-3" /> إعادة إرسال
                  </button>
                  {!n.archived_at && (
                    <button onClick={() => archiveOne(n.id)}
                      className="inline-flex items-center gap-1 rounded border border-input px-2 py-0.5 text-[11px] hover:bg-accent">
                      أرشفة
                    </button>
                  )}
                  <button onClick={() => deleteOne(n.id)}
                    className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </div>
              {openId === n.id && (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/20 p-3">
                  <DeliveryStatsPanel notificationId={n.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============================================================
// Automatic notifications section (UNCHANGED behavior).
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
      .from("automatic_notification_runs" as never)
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

// useMemo kept in scope for potential future use.
export const _NOOP_USE_MEMO = useMemo;
