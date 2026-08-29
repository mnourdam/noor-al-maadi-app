import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Megaphone, Plus, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/admin-guard";
import { SEGMENTS } from "@/lib/notifications/admin/segments";
import { validateExternalUrl } from "@/lib/notifications/externalUrl";
import { isSafeInternalPath, IRTH_PLAY_STORE_URL } from "@/lib/announcements/policy";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({
    meta: [
      { title: "الإعلانات داخل التطبيق — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminAnnouncementsPage,
});

const MANDATORY_CONFIRM = "تفعيل التحديث الإجباري";

type Kind = "generic" | "optional_update" | "mandatory_update";

interface Row {
  id: string;
  kind: Kind;
  platform: "android" | "web" | "all";
  title: string;
  body: string;
  cta_label: string | null;
  internal_path: string | null;
  external_url: string | null;
  recommended_version_code: number | null;
  min_version_code: number | null;
  segment_id: string | null;
  priority: number;
  dismissible: boolean;
  once_per_user: boolean;
  starts_at: string | null;
  expires_at: string | null;
  effective_at: string | null;
  is_active: boolean;
}

const EMPTY = {
  id: "",
  kind: "generic" as Kind,
  platform: "all" as Row["platform"],
  title: "",
  body: "",
  cta_label: "",
  internal_path: "",
  external_url: "",
  recommended_version_code: "",
  min_version_code: "",
  segment_id: "",
  priority: "0",
  dismissible: true,
  once_per_user: true,
  starts_at: "",
  expires_at: "",
  effective_at: "",
};

const KIND_LABEL: Record<Kind, string> = {
  generic: "إعلان عام",
  optional_update: "تحديث اختياري",
  mandatory_update: "تحديث إجباري",
};

function rpc(fn: string, args: Record<string, unknown>) {
  return (supabase as unknown as {
    rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(fn, args);
}

function AdminAnnouncementsPage() {
  const { allowed, checking } = useAdminGuard();
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_announcements" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("تعذّر تحميل الإعلانات"); return; }
    setRows((data ?? []) as unknown as Row[]);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  const save = async () => {
    if (!form.title.trim()) { toast.error("العنوان مطلوب"); return; }
    if (form.kind === "generic") {
      if (form.internal_path && form.external_url) {
        toast.error("اختر إجراءً داخليًا أو رابطًا خارجيًا، وليس كليهما"); return;
      }
      if (form.internal_path && !isSafeInternalPath(form.internal_path)) {
        toast.error("المسار الداخلي غير صالح"); return;
      }
      if (form.external_url && !validateExternalUrl(form.external_url).ok) {
        toast.error("الرابط الخارجي غير صالح (https فقط)"); return;
      }
    }
    if (form.kind === "optional_update" && !form.recommended_version_code) {
      toast.error("حدّد النسخة الموصى بها"); return;
    }
    if (form.kind === "mandatory_update" && !form.min_version_code) {
      toast.error("حدّد الحد الأدنى للنسخة"); return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      ...(form.id ? { id: form.id } : {}),
      kind: form.kind,
      platform: form.kind === "generic" ? form.platform : "android",
      title: form.title,
      body: form.body,
      cta_label: form.kind === "generic" ? form.cta_label : "",
      internal_path: form.kind === "generic" ? form.internal_path : "",
      external_url: form.kind === "generic" ? form.external_url : "",
      recommended_version_code: form.recommended_version_code,
      min_version_code: form.min_version_code,
      segment_id: form.kind === "generic" ? form.segment_id : "",
      priority: form.priority,
      dismissible: form.kind === "mandatory_update" ? false : form.dismissible,
      once_per_user: form.once_per_user,
      starts_at: form.starts_at,
      expires_at: form.expires_at,
      effective_at: form.effective_at,
    };
    const { error } = await rpc("admin_upsert_announcement_v16", { p_payload: payload });
    setBusy(false);
    if (error) { toast.error(`تعذّر الحفظ: ${error.message}`); return; }
    toast.success("تم الحفظ (غير مفعّل)");
    setForm({ ...EMPTY });
    void load();
  };

  const setActive = async (row: Row, active: boolean, confirm?: string) => {
    const { error } = await rpc("admin_set_announcement_active_v16", {
      p_id: row.id, p_active: active, p_confirm: confirm ?? null,
    });
    if (error) { toast.error(`تعذّر التنفيذ: ${error.message}`); return; }
    toast.success(active ? "تم التفعيل" : "تم التعطيل");
    setConfirmId(null); setConfirmText("");
    void load();
  };

  if (checking) return <div className="p-8 text-center text-muted-foreground">جارٍ التحقق…</div>;
  if (!allowed) return <div className="p-8 text-center text-muted-foreground">غير مصرّح.</div>;

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6 p-4 pb-24">
      <header className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/30">
          <Megaphone className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">الإعلانات داخل التطبيق</h1>
          <p className="text-xs text-muted-foreground">
            منفصلة تمامًا عن إشعارات الدفع. لا تُفعَّل أي إعلانات تلقائيًا بعد الحفظ.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="ms-auto rounded-full border border-border p-2">
          <RefreshCw className="size-4" />
        </button>
      </header>

      {/* Composer */}
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setForm((f) => ({ ...f, kind: k }))}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                form.kind === k ? "bg-gold text-background" : "border border-border text-muted-foreground"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {form.kind === "mandatory_update" ? (
          <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            <p>
              تحذير: التحديث الإجباري يمنع استخدام التطبيق على إصدارات أندرويد الأقدم من الحد الأدنى.
              يُنشأ دائمًا غير مفعّل، ولا يُفعَّل إلا بصلاحية مالك/مدير مع كتابة عبارة التأكيد.
            </p>
          </div>
        ) : null}

        <input
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="العنوان" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <textarea
          value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="النص" rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />

        {form.kind === "generic" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value as Row["platform"] })}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="all">كل المنصات</option>
                <option value="android">أندرويد</option>
                <option value="web">الويب</option>
              </select>
              <select
                value={form.segment_id}
                onChange={(e) => setForm({ ...form, segment_id: e.target.value })}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">الجميع (بدون شريحة)</option>
                {SEGMENTS.filter((s) => !s.coming_soon).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <input
              value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
              placeholder="نص الزر (اختياري)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={form.internal_path} onChange={(e) => setForm({ ...form, internal_path: e.target.value, external_url: "" })}
                placeholder="/campaigns" className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value, internal_path: "" })}
                placeholder="https://…" className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </>
        ) : (
          <p className="rounded-xl border border-border bg-background p-3 text-[11px] text-muted-foreground">
            وجهة التحديث ثابتة داخل التطبيق ولا يمكن تعديلها: {IRTH_PLAY_STORE_URL}
          </p>
        )}

        {form.kind === "optional_update" ? (
          <input
            value={form.recommended_version_code}
            onChange={(e) => setForm({ ...form, recommended_version_code: e.target.value })}
            placeholder="versionCode الموصى به (مثال: 16)"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
        ) : null}
        {form.kind === "mandatory_update" ? (
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.min_version_code}
              onChange={(e) => setForm({ ...form, min_version_code: e.target.value })}
              placeholder="الحد الأدنى versionCode"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={form.recommended_version_code}
              onChange={(e) => setForm({ ...form, recommended_version_code: e.target.value })}
              placeholder="الموصى به (اختياري)"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <input type="datetime-local" value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            className="rounded-xl border border-border bg-background px-2 py-2 text-xs" />
          <input type="datetime-local" value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            className="rounded-xl border border-border bg-background px-2 py-2 text-xs" />
          <input type="datetime-local" value={form.effective_at}
            onChange={(e) => setForm({ ...form, effective_at: e.target.value })}
            className="rounded-xl border border-border bg-background px-2 py-2 text-xs" />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.dismissible}
              onChange={(e) => setForm({ ...form, dismissible: e.target.checked })} />
            قابل للإغلاق
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.once_per_user}
              onChange={(e) => setForm({ ...form, once_per_user: e.target.checked })} />
            مرة واحدة لكل مستخدم
          </label>
          <input value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
            placeholder="الأولوية" className="w-20 rounded-lg border border-border bg-background px-2 py-1" />
        </div>

        <button type="button" disabled={busy} onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-bold text-background disabled:opacity-60">
          {form.id ? <Save className="size-4" /> : <Plus className="size-4" />}
          {form.id ? "حفظ التعديلات" : "إنشاء (غير مفعّل)"}
        </button>
      </section>

      {/* List */}
      <section className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold">
                {KIND_LABEL[row.kind]}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${row.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                {row.is_active ? "مفعّل" : "غير مفعّل"}
              </span>
              <span className="text-[11px] text-muted-foreground">{row.platform}</span>
            </div>
            <p className="mt-2 font-semibold text-foreground">{row.title}</p>
            <p className="text-xs text-muted-foreground">{row.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              min: {row.min_version_code ?? "—"} · recommended: {row.recommended_version_code ?? "—"} ·
              segment: {row.segment_id ?? "—"} · priority: {row.priority}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button"
                onClick={() => setForm({
                  ...EMPTY, id: row.id, kind: row.kind, platform: row.platform,
                  title: row.title, body: row.body ?? "", cta_label: row.cta_label ?? "",
                  internal_path: row.internal_path ?? "", external_url: row.external_url ?? "",
                  recommended_version_code: row.recommended_version_code?.toString() ?? "",
                  min_version_code: row.min_version_code?.toString() ?? "",
                  segment_id: row.segment_id ?? "", priority: String(row.priority),
                  dismissible: row.dismissible, once_per_user: row.once_per_user,
                  starts_at: "", expires_at: "", effective_at: "",
                })}
                className="rounded-full border border-border px-3 py-1.5 text-xs">تعديل</button>

              {row.is_active ? (
                <button type="button" onClick={() => void setActive(row, false)}
                  className="rounded-full border border-destructive/50 px-3 py-1.5 text-xs text-destructive">
                  {row.kind === "mandatory_update" ? "تعطيل التحديث الإجباري" : "تعطيل"}
                </button>
              ) : row.kind === "mandatory_update" ? (
                <button type="button" onClick={() => { setConfirmId(row.id); setConfirmText(""); }}
                  className="rounded-full border border-destructive/50 px-3 py-1.5 text-xs text-destructive">
                  تفعيل التحديث الإجباري…
                </button>
              ) : (
                <button type="button" onClick={() => void setActive(row, true)}
                  className="rounded-full border border-gold/50 px-3 py-1.5 text-xs text-gold">تفعيل</button>
              )}
            </div>

            {confirmId === row.id ? (
              <div className="mt-3 space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-[11px] text-destructive">
                  اكتب العبارة التالية للتأكيد: «{MANDATORY_CONFIRM}»
                </p>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <div className="flex gap-2">
                  <button type="button" disabled={confirmText.trim() !== MANDATORY_CONFIRM}
                    onClick={() => void setActive(row, true, confirmText.trim())}
                    className="rounded-full bg-destructive px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                    تأكيد التفعيل
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs">إلغاء</button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">لا توجد إعلانات بعد.</p>
        ) : null}
      </section>
    </div>
  );
}
