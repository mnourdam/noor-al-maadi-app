import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarDays, CheckSquare, Download, Eye, EyeOff, FileJson, Pencil, Plus, RefreshCw, Save, ShieldAlert, Square, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
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
      <div className="mx-auto max-w-5xl space-y-6 pb-24">
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
// Bulk selection primitives
// ============================================================

/**
 * Tracks a Set of selected row ids. Automatically clears whenever the caller's
 * filter/search signature (`resetKey`) changes — this guarantees selections
 * never leak across filter changes, matching the spec.
 */
function useBulkSelection(resetKey: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      setSelected(new Set());
    }
  }, [resetKey]);

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (on) ids.forEach(i => next.add(i));
      else ids.forEach(i => next.delete(i));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, setAll, clear };
}

/**
 * Sticky bulk-action bar. Appears only when at least one row is selected.
 * All copy is in Arabic per spec.
 */
function BulkBar({
  count,
  onEnable,
  onDisable,
  onDelete,
  onClear,
  busy,
}: {
  count: number;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onClear: () => void;
  busy: boolean;
}) {
  if (count === 0) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
        <span className="text-sm font-medium">
          محدد: <span className="text-primary">{count}</span>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            onClick={onEnable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Eye className="h-4 w-4" /> تفعيل المحدد
          </button>
          <button
            onClick={onDisable}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <EyeOff className="h-4 w-4" /> تعطيل المحدد
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> حذف المحدد
          </button>
          <button
            onClick={onClear}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" /> إلغاء التحديد
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simple confirm modal (used for bulk delete + large bulk disable). */
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        dir="rtl"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            className={
              danger
                ? "rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
                : "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectAllButton({
  allSelected,
  someSelected,
  onToggle,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
      title="تحديد الكل (ضمن التصفية الحالية)"
    >
      {allSelected ? (
        <CheckSquare className="h-4 w-4 text-primary" />
      ) : someSelected ? (
        <CheckSquare className="h-4 w-4 opacity-60" />
      ) : (
        <Square className="h-4 w-4" />
      )}
      تحديد الكل
    </button>
  );
}

// ============================================================
// Daily Facts
// ============================================================
// ============================================================
// Daily Facts (المعلومات اليومية) — Export / Import (Golden Template)
// ------------------------------------------------------------
// Envelope mirrors DB columns 1:1 EXCEPT deep_link, which is
// intentionally excluded from export/import/editor per product
// decision (daily facts do not open encyclopedia pages; tapping
// their notification opens /notifications only). Legacy rows keep
// their deep_link column value; runtime already ignores it via
// `isInformationalNotification` in notifications/deepLink.ts.
// ============================================================
const DF_EXPORT_VERSION = 1 as const;
const DF_EXPORT_GENERATOR = "irth.admin.content.daily_information";
const DF_EXPORT_FIELDS = ["id", "title", "body", "enabled", "created_at"] as const;

function factToExport(r: DailyFact): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DF_EXPORT_FIELDS) out[k] = (r as any)[k] ?? null;
  return out;
}

function buildFactsEnvelope(rows: DailyFact[]) {
  return {
    schema: "daily_information_items",
    version: DF_EXPORT_VERSION,
    generator: DF_EXPORT_GENERATOR,
    exported_at: new Date().toISOString(),
    count: rows.length,
    items: rows.map(factToExport),
  };
}

type DfImportIssue = { index: number; id?: string | null; field?: string; message: string };
type DfImportPlan = {
  toInsert: Array<{ index: number; payload: Record<string, unknown> }>;
  toUpdate: Array<{ index: number; id: string; payload: Record<string, unknown> }>;
  errors: DfImportIssue[];
  duplicates: DfImportIssue[];
};

function normalizeImportedFact(raw: any, index: number, existingIds: Set<string>):
  { ok: true; payload: Record<string, unknown>; id: string | null }
  | { ok: false; issues: DfImportIssue[] }
{
  const issues: DfImportIssue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ index, message: "العنصر ليس كائن JSON صالحًا." }] };
  }
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!title) issues.push({ index, id: raw.id ?? null, field: "title", message: "العنوان مطلوب." });
  if (!body) issues.push({ index, id: raw.id ?? null, field: "body", message: "المحتوى (body) مطلوب." });
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (id && !existingIds.has(id)) {
    // client-supplied id for a new row — allowed, treated as insert
  }
  if (issues.length) return { ok: false, issues };
  const payload: Record<string, unknown> = {
    title, body,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    // deep_link is intentionally NOT set from import — daily facts are
    // reminder-only notifications; legacy rows keep their column value.
  };
  return { ok: true, payload, id };
}

function planFactsImport(parsed: any, existing: DailyFact[]): DfImportPlan {
  const plan: DfImportPlan = { toInsert: [], toUpdate: [], errors: [], duplicates: [] };
  let items: any[] | null = null;
  if (Array.isArray(parsed)) items = parsed;
  else if (parsed && Array.isArray(parsed.items)) items = parsed.items;
  else if (parsed && Array.isArray(parsed.events)) items = parsed.events; // tolerate mislabeled files
  else if (parsed && typeof parsed === "object" && parsed.title) items = [parsed]; // single item
  if (!items) {
    plan.errors.push({ index: -1, message: "الملف لا يحتوي على عناصر. يجب أن يكون Envelope فيه items[] أو مصفوفة عناصر أو عنصر واحد." });
    return plan;
  }
  const existingIds = new Set(existing.map((r) => r.id));
  const seenKeys = new Set<string>();
  items.forEach((raw, i) => {
    const res = normalizeImportedFact(raw, i, existingIds);
    if (!res.ok) { plan.errors.push(...res.issues); return; }
    const key = String(res.payload.title).toLowerCase();
    if (seenKeys.has(key)) plan.duplicates.push({ index: i, message: `تكرار عنوان داخل الملف: ${res.payload.title}` });
    seenKeys.add(key);
    if (res.id && existingIds.has(res.id)) plan.toUpdate.push({ index: i, id: res.id, payload: res.payload });
    else plan.toInsert.push({ index: i, payload: res.id ? { id: res.id, ...res.payload } : res.payload });
  });
  return plan;
}

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

  const { selected, toggle: toggleSel, setAll, clear } = useBulkSelection(`facts|${search}`);
  const visibleIds = useMemo(() => filtered.map(r => r.id), [filtered]);
  const selectedVisible = useMemo(() => visibleIds.filter(id => selected.has(id)), [visibleIds, selected]);
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "delete" | "disable" }>(null);

  const save = async () => {
    if (!editing) return;
    const title = editing.title?.trim() ?? "";
    const body = editing.body?.trim() ?? "";
    if (!title || !body) { setMsg({ type: "err", text: "العنوان والمحتوى مطلوبان." }); return; }
    const payload: any = {
      title,
      body,
      enabled: editing.enabled ?? true,
      // deep_link intentionally omitted — daily facts do not open pages.
      // Existing rows keep their column value on update.
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
    if (!window.confirm(`حذف المعلومة: "${r.title}"؟`)) return;
    const { error } = await supabase.from("daily_facts" as any).delete().eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل الحذف: ${error.message}` });
    else { setMsg({ type: "ok", text: "تم الحذف." }); await load(); }
  };

  const applyBulkEnable = async (enabled: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("daily_facts" as any).update({ enabled }).in("id", ids);
    setBusy(false);
    if (error) { toast.error(`فشل التحديث: ${error.message}`); return; }
    toast.success(`تم تحديث ${ids.length} عنصر`);
    clear();
    await load();
  };

  const applyBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("daily_facts" as any).delete().in("id", ids);
    setBusy(false);
    if (error) { toast.error(`فشل الحذف: ${error.message}`); return; }
    toast.success(`تم حذف ${ids.length} عنصر`);
    clear();
    await load();
  };

  // ---- Export / Import (Daily Facts) ----
  const [importOpen, setImportOpen] = useState(false);
  const [importPlan, setImportPlan] = useState<DfImportPlan | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importApplying, setImportApplying] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    downloadJson(`daily-information-all-${new Date().toISOString().slice(0, 10)}.json`, buildFactsEnvelope(rows));
    setExportMenuOpen(false);
  };
  const exportSelected = () => {
    const picked = rows.filter((r) => selected.has(r.id));
    if (picked.length === 0) { toast.error("لا يوجد عناصر محددة."); return; }
    downloadJson(`daily-information-selected-${new Date().toISOString().slice(0, 10)}.json`, buildFactsEnvelope(picked));
    setExportMenuOpen(false);
  };
  const exportOne = (r: DailyFact) => {
    downloadJson(`daily-information-${safeSlug(r.title)}.json`, buildFactsEnvelope([r]));
  };
  const downloadTemplate = () => {
    if (rows.length > 0) {
      const sample = [...rows].sort((a, b) => (b.body?.length ?? 0) - (a.body?.length ?? 0))[0];
      downloadJson("daily-information-golden-template.json", buildFactsEnvelope([sample]));
    } else {
      downloadJson("daily-information-golden-template.json", buildFactsEnvelope([{
        id: "REPLACE-WITH-UUID-OR-OMIT-FOR-NEW",
        title: "عنوان المعلومة",
        body: "النص الكامل للمعلومة اليومية.",
        deep_link: null,
        enabled: true,
        created_at: new Date().toISOString(),
      } as any]));
    }
  };

  const onImportFile = async (file: File) => {
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setImportPlan(planFactsImport(parsed, rows));
      setImportOpen(true);
    } catch (e: any) {
      setImportPlan({ toInsert: [], toUpdate: [], errors: [{ index: -1, message: `تعذر قراءة JSON: ${e?.message ?? e}` }], duplicates: [] });
      setImportOpen(true);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyImport = async () => {
    if (!importPlan) return;
    if (importPlan.errors.length > 0) { toast.error("يوجد أخطاء — عالجها قبل التطبيق."); return; }
    setImportApplying(true);
    try {
      if (importPlan.toInsert.length > 0) {
        const { error } = await supabase.from("daily_facts" as any).insert(importPlan.toInsert.map((x) => x.payload));
        if (error) throw error;
      }
      for (const u of importPlan.toUpdate) {
        const { error } = await supabase.from("daily_facts" as any).update(u.payload).eq("id", u.id);
        if (error) throw error;
      }
      toast.success(`تم الاستيراد: ${importPlan.toInsert.length} جديد، ${importPlan.toUpdate.length} محدّث.`);
      setImportOpen(false);
      setImportPlan(null);
      await load();
    } catch (e: any) {
      toast.error(`فشل الاستيراد: ${e?.message ?? e}`);
    } finally {
      setImportApplying(false);
    }
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
        <SelectAllButton
          allSelected={allSelected}
          someSelected={selectedVisible.length > 0}
          onToggle={() => setAll(visibleIds, !allSelected)}
        />
        <div className="relative">
          <button
            onClick={() => setExportMenuOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
            title="تصدير JSON"
          >
            <Download className="h-4 w-4" /> تصدير JSON
          </button>
          {exportMenuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-md">
              {selected.size > 0 && (
                <button onClick={exportSelected} className="block w-full rounded px-3 py-2 text-right text-sm hover:bg-muted">
                  تصدير المحدد ({selected.size})
                </button>
              )}
              <button onClick={exportAll} className="block w-full rounded px-3 py-2 text-right text-sm hover:bg-muted">
                تصدير جميع المعلومات اليومية ({rows.length})
              </button>
            </div>
          )}
        </div>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" title="Golden Template مبنيّ من عنصر حقيقي">
          <FileJson className="h-4 w-4" /> تحميل النموذج الذهبي
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          <Upload className="h-4 w-4" /> استيراد JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); }}
        />
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
            {filtered.map(r => {
              const isSel = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex flex-col gap-2 p-4 md:flex-row md:items-center ${isSel ? "bg-primary/5" : ""}`}
                >
                  <label className="flex cursor-pointer items-center pt-1 md:pt-0">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSel(r.id)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                      aria-label="تحديد العنصر"
                    />
                  </label>
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
              );
            })}
          </ul>
        )}
      </div>

      <BulkBar
        count={selected.size}
        busy={busy}
        onEnable={() => applyBulkEnable(true)}
        onDisable={() => {
          if (selected.size > 20) setConfirm({ kind: "disable" });
          else applyBulkEnable(false);
        }}
        onDelete={() => setConfirm({ kind: "delete" })}
        onClear={clear}
      />

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title="تأكيد الحذف"
        message="سيتم حذف العناصر المحددة نهائيًا. هل تريد المتابعة؟"
        confirmLabel="حذف"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void applyBulkDelete(); }}
      />
      <ConfirmDialog
        open={confirm?.kind === "disable"}
        title="تأكيد التعطيل"
        message={`سيتم تعطيل ${selected.size} عنصر. هل تريد المتابعة؟`}
        confirmLabel="تعطيل"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void applyBulkEnable(false); }}
      />
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
// Today in History Events — Export / Import (Golden Template)
// ------------------------------------------------------------
// Envelope schema mirrors the actual DB columns 1:1. No renaming,
// no invented fields, no deep-link activation. On import, we match
// existing rows by `id` when present (update in place) and insert
// new rows otherwise — never duplicate.
// ============================================================
const TIH_EXPORT_VERSION = 1 as const;
const TIH_EXPORT_GENERATOR = "irth.admin.content.today_in_history";
const TIH_ALLOWED_FIELDS = [
  "id", "month", "day", "title", "body",
  "hijri_year", "gregorian_year", "deep_link",
  "enabled", "created_at",
] as const;

function rowToExport(r: TodayEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of TIH_ALLOWED_FIELDS) out[k] = (r as any)[k] ?? null;
  return out;
}

function buildEnvelope(rows: TodayEvent[]) {
  return {
    schema: "today_in_history_events",
    version: TIH_EXPORT_VERSION,
    generator: TIH_EXPORT_GENERATOR,
    exported_at: new Date().toISOString(),
    count: rows.length,
    events: rows.map(rowToExport),
  };
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeSlug(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "event";
}

type TihImportIssue = { index: number; id?: string | null; field?: string; message: string };
type TihImportPlan = {
  toInsert: Array<{ index: number; payload: Record<string, unknown> }>;
  toUpdate: Array<{ index: number; id: string; payload: Record<string, unknown> }>;
  errors: TihImportIssue[];
  duplicates: TihImportIssue[]; // duplicate (month,day,title) across the file
};

function normalizeImportedEvent(raw: any, index: number, existingIds: Set<string>): { ok: true; payload: Record<string, unknown>; id: string | null } | { ok: false; issues: TihImportIssue[] } {
  const issues: TihImportIssue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ index, message: "الحدث ليس كائن JSON صالحًا." }] };
  }
  const month = Number(raw.month);
  const day = Number(raw.day);
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!Number.isInteger(month) || month < 1 || month > 12) issues.push({ index, id: raw.id ?? null, field: "month", message: "الشهر يجب أن يكون عددًا بين 1 و12." });
  if (!Number.isInteger(day) || day < 1 || day > 31) issues.push({ index, id: raw.id ?? null, field: "day", message: "اليوم يجب أن يكون عددًا بين 1 و31." });
  if (!title) issues.push({ index, id: raw.id ?? null, field: "title", message: "العنوان مطلوب." });
  if (!body) issues.push({ index, id: raw.id ?? null, field: "body", message: "المحتوى (body) مطلوب." });

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  if (id && !existingIds.has(id)) {
    // Not an error — treated as insert with client-supplied id below.
  }
  if (issues.length) return { ok: false, issues };

  const payload: Record<string, unknown> = {
    month, day, title, body,
    hijri_year: raw.hijri_year != null && String(raw.hijri_year).trim() !== "" ? String(raw.hijri_year).trim() : null,
    gregorian_year: raw.gregorian_year != null && String(raw.gregorian_year).trim() !== "" ? String(raw.gregorian_year).trim() : null,
    // deep_link is preserved verbatim if provided; runtime already ignores it
    // for tap behavior (see notifications/deepLink.ts). Never invented here.
    deep_link: typeof raw.deep_link === "string" && raw.deep_link.trim() ? raw.deep_link.trim() : null,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
  };
  return { ok: true, payload, id };
}

function planImport(parsed: any, existing: TodayEvent[]): TihImportPlan {
  const plan: TihImportPlan = { toInsert: [], toUpdate: [], errors: [], duplicates: [] };
  let events: any[] | null = null;
  if (Array.isArray(parsed)) events = parsed;
  else if (parsed && Array.isArray(parsed.events)) events = parsed.events;
  else if (parsed && typeof parsed === "object" && parsed.title) events = [parsed]; // single event
  if (!events) {
    plan.errors.push({ index: -1, message: "الملف لا يحتوي على أحداث. يجب أن يكون Envelope فيه events[] أو مصفوفة أحداث أو حدث واحد." });
    return plan;
  }
  const existingIds = new Set(existing.map((r) => r.id));
  const seenKeys = new Set<string>();
  events.forEach((raw, i) => {
    const res = normalizeImportedEvent(raw, i, existingIds);
    if (!res.ok) { plan.errors.push(...res.issues); return; }
    const key = `${res.payload.month}-${res.payload.day}-${String(res.payload.title).toLowerCase()}`;
    if (seenKeys.has(key)) plan.duplicates.push({ index: i, message: `تكرار داخل الملف: ${res.payload.day}/${res.payload.month} — ${res.payload.title}` });
    seenKeys.add(key);
    if (res.id && existingIds.has(res.id)) plan.toUpdate.push({ index: i, id: res.id, payload: res.payload });
    else plan.toInsert.push({ index: i, payload: res.id ? { id: res.id, ...res.payload } : res.payload });
  });
  return plan;
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

  const { selected, toggle: toggleSel, setAll, clear } = useBulkSelection(`events|${search}`);
  const visibleIds = useMemo(() => filtered.map(r => r.id), [filtered]);
  const selectedVisible = useMemo(() => visibleIds.filter(id => selected.has(id)), [visibleIds, selected]);
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "delete" | "disable" }>(null);

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
    if (!window.confirm(`حذف الحدث: "${r.title}"؟`)) return;
    const { error } = await supabase.from("today_in_history_events" as any).delete().eq("id", r.id);
    if (error) setMsg({ type: "err", text: `فشل الحذف: ${error.message}` });
    else { setMsg({ type: "ok", text: "تم الحذف." }); await load(); }
  };

  const applyBulkEnable = async (enabled: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("today_in_history_events" as any).update({ enabled }).in("id", ids);
    setBusy(false);
    if (error) { toast.error(`فشل التحديث: ${error.message}`); return; }
    toast.success(`تم تحديث ${ids.length} عنصر`);
    clear();
    await load();
  };

  const applyBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from("today_in_history_events" as any).delete().in("id", ids);
    setBusy(false);
    if (error) { toast.error(`فشل الحذف: ${error.message}`); return; }
    toast.success(`تم حذف ${ids.length} عنصر`);
    clear();
    await load();
  };

  // ---- Export / Import ----
  const [importOpen, setImportOpen] = useState(false);
  const [importPlan, setImportPlan] = useState<TihImportPlan | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importApplying, setImportApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    downloadJson(`today-in-history-all-${new Date().toISOString().slice(0, 10)}.json`, buildEnvelope(rows));
  };
  const exportOne = (r: TodayEvent) => {
    downloadJson(`tih-${r.month}-${r.day}-${safeSlug(r.title)}.json`, buildEnvelope([r]));
  };
  const downloadTemplate = () => {
    // Prefer a real event as the Golden Template so the file matches DB reality
    // exactly; fall back to an empty envelope only if no rows exist yet.
    if (rows.length > 0) {
      const sample = [...rows].sort((a, b) => (b.body?.length ?? 0) - (a.body?.length ?? 0))[0];
      downloadJson("today-in-history-golden-template.json", buildEnvelope([sample]));
    } else {
      downloadJson("today-in-history-golden-template.json", buildEnvelope([]));
    }
  };

  const onImportFile = async (file: File) => {
    setImportFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setImportPlan(planImport(parsed, rows));
      setImportOpen(true);
    } catch (e: any) {
      setImportPlan({ toInsert: [], toUpdate: [], errors: [{ index: -1, message: `تعذر قراءة JSON: ${e?.message ?? e}` }], duplicates: [] });
      setImportOpen(true);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyImport = async () => {
    if (!importPlan) return;
    if (importPlan.errors.length > 0) { toast.error("يوجد أخطاء — عالجها قبل التطبيق."); return; }
    setImportApplying(true);
    try {
      if (importPlan.toInsert.length > 0) {
        const { error } = await supabase.from("today_in_history_events" as any).insert(importPlan.toInsert.map((x) => x.payload));
        if (error) throw error;
      }
      for (const u of importPlan.toUpdate) {
        const { error } = await supabase.from("today_in_history_events" as any).update(u.payload).eq("id", u.id);
        if (error) throw error;
      }
      toast.success(`تم الاستيراد: ${importPlan.toInsert.length} جديد، ${importPlan.toUpdate.length} محدّث.`);
      setImportOpen(false);
      setImportPlan(null);
      await load();
    } catch (e: any) {
      toast.error(`فشل الاستيراد: ${e?.message ?? e}`);
    } finally {
      setImportApplying(false);
    }
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
        <SelectAllButton
          allSelected={allSelected}
          someSelected={selectedVisible.length > 0}
          onToggle={() => setAll(visibleIds, !allSelected)}
        />
        <button onClick={exportAll} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" title="تصدير جميع الأحداث">
          <Download className="h-4 w-4" /> تصدير الكل ({rows.length})
        </button>
        <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted" title="Golden Template مبنيّ من حدث حقيقي">
          <FileJson className="h-4 w-4" /> النموذج المرجعي JSON
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          <Upload className="h-4 w-4" /> استيراد JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); }}
        />
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

      {importOpen && importPlan && (
        <ImportPreview
          fileName={importFileName}
          plan={importPlan}
          applying={importApplying}
          onCancel={() => { setImportOpen(false); setImportPlan(null); }}
          onApply={applyImport}
        />
      )}

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
            {filtered.map(r => {
              const isSel = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex flex-col gap-2 p-4 md:flex-row md:items-center ${isSel ? "bg-primary/5" : ""}`}
                >
                  <label className="flex cursor-pointer items-center pt-1 md:pt-0">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSel(r.id)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                      aria-label="تحديد العنصر"
                    />
                  </label>
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
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => exportOne(r)} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs hover:bg-muted" title="تصدير JSON">
                      <Download className="h-3 w-3" /> JSON
                    </button>
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
              );
            })}
          </ul>
        )}
      </div>

      <BulkBar
        count={selected.size}
        busy={busy}
        onEnable={() => applyBulkEnable(true)}
        onDisable={() => {
          if (selected.size > 20) setConfirm({ kind: "disable" });
          else applyBulkEnable(false);
        }}
        onDelete={() => setConfirm({ kind: "delete" })}
        onClear={clear}
      />

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title="تأكيد الحذف"
        message="سيتم حذف العناصر المحددة نهائيًا. هل تريد المتابعة؟"
        confirmLabel="حذف"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void applyBulkDelete(); }}
      />
      <ConfirmDialog
        open={confirm?.kind === "disable"}
        title="تأكيد التعطيل"
        message={`سيتم تعطيل ${selected.size} عنصر. هل تريد المتابعة؟`}
        confirmLabel="تعطيل"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void applyBulkEnable(false); }}
      />
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

function ImportPreview({
  fileName, plan, applying, onCancel, onApply,
}: {
  fileName: string | null;
  plan: TihImportPlan;
  applying: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const hasErrors = plan.errors.length > 0;
  const nothing = plan.toInsert.length === 0 && plan.toUpdate.length === 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">معاينة الاستيراد {fileName ? `— ${fileName}` : ""}</h3>
          <p className="text-xs text-muted-foreground">راجع النتائج قبل التطبيق. الأحداث الحالية ذات المعرّف نفسه ستُحدَّث في مكانها، ولن تُنشأ نسخة مكررة.</p>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatBox label="جديد" value={plan.toInsert.length} tone="ok" />
        <StatBox label="تحديث" value={plan.toUpdate.length} tone="info" />
        <StatBox label="تكرار داخل الملف" value={plan.duplicates.length} tone="warn" />
        <StatBox label="أخطاء" value={plan.errors.length} tone={hasErrors ? "err" : "muted"} />
      </div>

      {plan.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-1 text-sm font-semibold text-destructive">أخطاء ({plan.errors.length})</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive/90">
            {plan.errors.map((e, i) => (
              <li key={i}>
                #{e.index >= 0 ? e.index + 1 : "-"}{e.field ? ` — الحقل «${e.field}»` : ""}{e.id ? ` — id: ${e.id}` : ""}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.duplicates.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-1 text-sm font-semibold text-amber-600">تنبيه: تواريخ/عناوين مكررة داخل نفس الملف</p>
          <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-amber-700">
            {plan.duplicates.map((d, i) => <li key={i}>#{d.index + 1}: {d.message}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApply}
          disabled={applying || hasErrors || nothing}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {applying ? "جارٍ التطبيق…" : "تطبيق الاستيراد"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted">إلغاء</button>
      </div>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "ok" | "info" | "warn" | "err" | "muted" }) {
  const toneCls = {
    ok: "border-green-500/30 bg-green-500/5 text-green-600",
    info: "border-primary/30 bg-primary/5 text-primary",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-600",
    err: "border-destructive/30 bg-destructive/5 text-destructive",
    muted: "border-border bg-muted/30 text-muted-foreground",
  }[tone];
  return (
    <div className={`rounded-md border p-3 text-center ${toneCls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
