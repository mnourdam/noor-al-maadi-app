import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, Pencil, Plus, RefreshCw, Save, ShieldAlert, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/lib/account";

const ALLOWED_ADMIN_EMAILS = ["mnourdam@gmail.com"];
const normalizeEmail = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";
const NORMALIZED = ALLOWED_ADMIN_EMAILS.map(normalizeEmail);

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "إدارة المحتوى — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminContentPage,
});

interface DailyFact {
  id: string;
  title: string;
  body: string;
  deep_link: string | null;
  enabled: boolean;
  created_at: string;
}

interface TodayEvent {
  id: string;
  month: number;
  day: number;
  title: string;
  body: string;
  hijri_year: string | null;
  gregorian_year: string | null;
  deep_link: string | null;
  enabled: boolean;
  created_at: string;
}

function AdminContentPage() {
  const { user: accountUser, loadingSession } = useAccount();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (loadingSession) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const u = data.user ?? accountUser ?? null;
      const e = u?.email ?? null;
      setEmail(e);
      setAllowed(NORMALIZED.includes(normalizeEmail(e)));
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [accountUser, loadingSession]);

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
        </div>
      </div>
    );
  }

  return <ContentManager />;
}

type Tab = "facts" | "events";

function ContentManager() {
  const [tab, setTab] = useState<Tab>("facts");
  return (
    <div dir="rtl" className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">إدارة محتوى الإشعارات التلقائية</h1>
          <Link to="/admin/import" search={{ type: "daily_facts" }} className="ml-auto inline-flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" /> استيراد JSON
          </Link>
          <Link to="/admin" className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">لوحة الإدارة</Link>
        </header>

        <div className="flex gap-2 border-b border-border">
          <TabBtn active={tab === "facts"} onClick={() => setTab("facts")} icon={<BookOpen className="h-4 w-4" />}>
            معلومات يومية
          </TabBtn>
          <TabBtn active={tab === "events"} onClick={() => setTab("events")} icon={<CalendarDays className="h-4 w-4" />}>
            في مثل هذا اليوم
          </TabBtn>
        </div>

        {tab === "facts" ? <DailyFactsTab /> : <TodayEventsTab />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Feedback({ msg }: { msg: { type: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        msg.type === "ok"
          ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }`}
    >
      {msg.text}
    </div>
  );
}

// ============================================================
// Daily Facts
// ============================================================
function DailyFactsTab() {
  const [rows, setRows] = useState<DailyFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<DailyFact> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("daily_facts" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setMsg({ type: "err", text: `فشل التحميل: ${error.message}` });
    else setRows((data ?? []) as unknown as DailyFact[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  }, [rows, search]);

  const save = async () => {
    if (!editing) return;
    const title = editing.title?.trim() ?? "";
    const body = editing.body?.trim() ?? "";
    if (!title || !body) { setMsg({ type: "err", text: "العنوان والمحتوى مطلوبان." }); return; }
    const payload: any = {
      title,
      body,
      deep_link: editing.deep_link?.trim() || null,
      enabled: editing.enabled ?? true,
    };
    const op = editing.id
      ? supabase.from("daily_facts" as any).update(payload).eq("id", editing.id)
      : supabase.from("daily_facts" as any).insert(payload);
    const { error } = await op;
    if (error) { setMsg({ type: "err", text: `فشل الحفظ: ${error.message}` }); return; }
    setMsg({ type: "ok", text: editing.id ? "تم تحديث المعلومة." : "تمت إضافة المعلومة." });
    setEditing(null);
    await load();
  };

  const toggle = async (r: DailyFact) => {
    const { error } = await supabase.from("daily_facts" as any).update({ enabled: !r.enabled }).eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل التحديث: ${error.message}` });
    else { setMsg({ type: "ok", text: !r.enabled ? "تم التفعيل." : "تم التعطيل." }); await load(); }
  };

  const remove = async (r: DailyFact) => {
    if (!confirm(`حذف المعلومة: "${r.title}"؟`)) return;
    const { error } = await supabase.from("daily_facts" as any).delete().eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل الحذف: ${error.message}` });
    else { setMsg({ type: "ok", text: "تم الحذف." }); await load(); }
  };

  return (
    <div className="space-y-4">
      <Feedback msg={msg} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEditing({ enabled: true })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إضافة معلومة
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث…"
          className="ml-auto w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button onClick={load} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </div>

      {editing && (
        <FactEditor
          value={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">لا توجد معلومات.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map(r => (
              <li key={r.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${r.enabled ? "bg-green-500" : "bg-muted-foreground"}`} />
                    <h3 className="truncate font-medium">{r.title}</h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
                  {r.deep_link && <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{r.deep_link}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggle(r)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">
                    {r.enabled ? "تعطيل" : "تفعيل"}
                  </button>
                  <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">
                    <Pencil className="h-3 w-3" /> تعديل
                  </button>
                  <button onClick={() => remove(r)} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FactEditor({
  value, onChange, onCancel, onSave,
}: {
  value: Partial<DailyFact>;
  onChange: (v: Partial<DailyFact>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{value.id ? "تعديل معلومة" : "معلومة جديدة"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <Field label="العنوان">
          <input value={value.title ?? ""} onChange={e => onChange({ ...value, title: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <Field label="المحتوى">
          <textarea value={value.body ?? ""} onChange={e => onChange({ ...value, body: e.target.value })}
            rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <Field label="الرابط (اختياري)">
          <input dir="ltr" value={value.deep_link ?? ""} onChange={e => onChange({ ...value, deep_link: e.target.value })}
            placeholder="/timeline" className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.enabled ?? true} onChange={e => onChange({ ...value, enabled: e.target.checked })} />
          مفعّلة
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={onSave} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Save className="h-4 w-4" /> حفظ
          </button>
          <button onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Today in History Events
// ============================================================
function TodayEventsTab() {
  const [rows, setRows] = useState<TodayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<TodayEvent> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("today_in_history_events" as any)
      .select("*")
      .order("month", { ascending: true })
      .order("day", { ascending: true });
    if (error) setMsg({ type: "err", text: `فشل التحميل: ${error.message}` });
    else setRows((data ?? []) as unknown as TodayEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  }, [rows, search]);

  const save = async () => {
    if (!editing) return;
    const title = editing.title?.trim() ?? "";
    const body = editing.body?.trim() ?? "";
    const month = Number(editing.month);
    const day = Number(editing.day);
    if (!title || !body) { setMsg({ type: "err", text: "العنوان والمحتوى مطلوبان." }); return; }
    if (!month || month < 1 || month > 12) { setMsg({ type: "err", text: "الشهر يجب أن يكون بين 1 و12." }); return; }
    if (!day || day < 1 || day > 31) { setMsg({ type: "err", text: "اليوم يجب أن يكون بين 1 و31." }); return; }
    const payload: any = {
      month, day, title, body,
      hijri_year: editing.hijri_year?.toString().trim() || null,
      gregorian_year: editing.gregorian_year?.toString().trim() || null,
      deep_link: editing.deep_link?.trim() || null,
      enabled: editing.enabled ?? true,
    };
    const op = editing.id
      ? supabase.from("today_in_history_events" as any).update(payload).eq("id", editing.id)
      : supabase.from("today_in_history_events" as any).insert(payload);
    const { error } = await op;
    if (error) { setMsg({ type: "err", text: `فشل الحفظ: ${error.message}` }); return; }
    setMsg({ type: "ok", text: editing.id ? "تم تحديث الحدث." : "تمت إضافة الحدث." });
    setEditing(null);
    await load();
  };

  const toggle = async (r: TodayEvent) => {
    const { error } = await supabase.from("today_in_history_events" as any).update({ enabled: !r.enabled }).eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل التحديث: ${error.message}` });
    else { setMsg({ type: "ok", text: !r.enabled ? "تم التفعيل." : "تم التعطيل." }); await load(); }
  };

  const remove = async (r: TodayEvent) => {
    if (!confirm(`حذف الحدث: "${r.title}"؟`)) return;
    const { error } = await supabase.from("today_in_history_events" as any).delete().eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل الحذف: ${error.message}` });
    else { setMsg({ type: "ok", text: "تم الحذف." }); await load(); }
  };

  return (
    <div className="space-y-4">
      <Feedback msg={msg} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setEditing({ enabled: true, month: new Date().getMonth() + 1, day: new Date().getDate() })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إضافة حدث
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث…"
          className="ml-auto w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button onClick={load} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </div>

      {editing && (
        <EventEditor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSave={save} />
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">لا توجد أحداث.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map(r => (
              <li key={r.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
                <div className="flex w-20 flex-col items-center justify-center rounded-md bg-muted px-2 py-1 text-center">
                  <div className="text-lg font-bold">{r.day}</div>
                  <div className="text-xs text-muted-foreground">/{r.month}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${r.enabled ? "bg-green-500" : "bg-muted-foreground"}`} />
                    <h3 className="truncate font-medium">{r.title}</h3>
                    {(r.hijri_year || r.gregorian_year) && (
                      <span className="text-xs text-muted-foreground">
                        {r.hijri_year ? `${r.hijri_year}هـ` : ""}{r.hijri_year && r.gregorian_year ? " / " : ""}{r.gregorian_year ? `${r.gregorian_year}م` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
                  {r.deep_link && <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{r.deep_link}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggle(r)} className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">
                    {r.enabled ? "تعطيل" : "تفعيل"}
                  </button>
                  <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted">
                    <Pencil className="h-3 w-3" /> تعديل
                  </button>
                  <button onClick={() => remove(r)} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EventEditor({
  value, onChange, onCancel, onSave,
}: {
  value: Partial<TodayEvent>;
  onChange: (v: Partial<TodayEvent>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{value.id ? "تعديل حدث" : "حدث جديد"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الشهر (1-12)">
            <input type="number" min={1} max={12} value={value.month ?? ""} onChange={e => onChange({ ...value, month: Number(e.target.value) })}
              className="w-full rounded-md border border-input bg-background px-3 py-2" />
          </Field>
          <Field label="اليوم (1-31)">
            <input type="number" min={1} max={31} value={value.day ?? ""} onChange={e => onChange({ ...value, day: Number(e.target.value) })}
              className="w-full rounded-md border border-input bg-background px-3 py-2" />
          </Field>
        </div>
        <Field label="العنوان">
          <input value={value.title ?? ""} onChange={e => onChange({ ...value, title: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <Field label="المحتوى">
          <textarea value={value.body ?? ""} onChange={e => onChange({ ...value, body: e.target.value })}
            rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السنة الهجرية (اختياري)">
            <input value={value.hijri_year ?? ""} onChange={e => onChange({ ...value, hijri_year: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2" />
          </Field>
          <Field label="السنة الميلادية (اختياري)">
            <input value={value.gregorian_year ?? ""} onChange={e => onChange({ ...value, gregorian_year: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2" />
          </Field>
        </div>
        <Field label="الرابط (اختياري)">
          <input dir="ltr" value={value.deep_link ?? ""} onChange={e => onChange({ ...value, deep_link: e.target.value })}
            placeholder="/timeline" className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.enabled ?? true} onChange={e => onChange({ ...value, enabled: e.target.checked })} />
          مفعّل
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={onSave} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Save className="h-4 w-4" /> حفظ
          </button>
          <button onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
