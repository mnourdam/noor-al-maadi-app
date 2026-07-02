import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Download,
  Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, Upload, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import type { TaxonomyEntry, TaxonomyType } from "@/lib/taxonomy";

export const Route = createFileRoute("/admin/taxonomy")({
  head: () => ({
    meta: [
      { title: "التصنيفات — لوحة الإدارة" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <TaxonomyAdmin />
    </AdminGate>
  ),
});

const TYPES: { id: TaxonomyType; label: string; hint: string }[] = [
  { id: "era", label: "العصور", hint: "الحقب التاريخية القانونية" },
  { id: "world", label: "العوالم", hint: "محاور الاستكشاف للاعب" },
  { id: "state", label: "الدول", hint: "الدول والكيانات السياسية" },
  { id: "entity_type", label: "أنواع الكيانات", hint: "أنواع مداخل الموسوعة" },
  { id: "tag_category", label: "تصنيفات الوسوم", hint: "وسوم مخصصة (اختياري)" },
];

function TaxonomyAdmin() {
  const [type, setType] = useState<TaxonomyType>("era");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showDisabled, setShowDisabled] = useState(true);
  const [creating, setCreating] = useState(false);

  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-taxonomy-admin", type],
    queryFn: async (): Promise<TaxonomyEntry[]> => {
      const { data, error } = await supabase
        .from("admin_taxonomy" as never)
        .select("*")
        .eq("type", type)
        .order("sort_order", { ascending: true })
        .order("key", { ascending: true });
      if (error) throw error;
      return ((data as TaxonomyEntry[] | null) ?? []).map((r) => ({
        ...r,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      }));
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-taxonomy-admin", type] });
    qc.invalidateQueries({ queryKey: ["admin-taxonomy", type, false] });
    qc.invalidateQueries({ queryKey: ["admin-taxonomy", type, true] });
  };

  const rows = useMemo(() => {
    const list = query.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (!showArchived && r.archived) return false;
      if (!showDisabled && !r.enabled) return false;
      if (!q) return true;
      return (
        r.key.toLowerCase().includes(q) ||
        r.label_ar.toLowerCase().includes(q) ||
        (r.label_en ?? "").toLowerCase().includes(q)
      );
    });
  }, [query.data, search, showArchived, showDisabled]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(query.data ?? [], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taxonomy-${type}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { alert("ملف JSON غير صالح"); return; }
    if (!Array.isArray(payload)) { alert("يجب أن يكون الملف مصفوفة"); return; }
    const rows = payload
      .map((r) => r as Partial<TaxonomyEntry>)
      .filter((r) => r && typeof r.key === "string" && typeof r.label_ar === "string")
      .map((r) => ({
        type,
        key: r.key,
        label_ar: r.label_ar,
        label_en: r.label_en ?? null,
        description: r.description ?? null,
        sort_order: r.sort_order ?? 999,
        enabled: r.enabled ?? true,
        archived: r.archived ?? false,
        color: r.color ?? null,
        icon: r.icon ?? null,
        metadata: r.metadata ?? {},
      }));
    if (rows.length === 0) { alert("لم يُعثر على صفوف صالحة"); return; }
    const { error } = await supabase
      .from("admin_taxonomy" as never)
      .upsert(rows as never, { onConflict: "type,key" });
    if (error) { alert(`فشل الاستيراد: ${error.message}`); return; }
    invalidate();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">التصنيفات (Taxonomy)</h1>
              <p className="text-sm text-slate-400">
                المصدر الوحيد لكل قيم العصور والعوالم والدول وأنواع الكيانات في المشروع.
              </p>
            </div>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            لوحة الإدارة
          </Link>
        </header>

        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={
                "rounded-md border px-3 py-1.5 text-sm transition " +
                (type === t.id
                  ? "border-amber-400 bg-amber-500/10 text-amber-100"
                  : "border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800")
              }
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالمفتاح أو الاسم…"
              className="w-full rounded border border-slate-700 bg-slate-950 px-8 py-1.5 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
            إظهار المعطّل
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            إظهار المؤرشف
          </label>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> جديد
          </button>
          <button
            onClick={exportJson}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            <Download className="h-4 w-4" /> تصدير
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
            <Upload className="h-4 w-4" /> استيراد
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() => invalidate()}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            title="تحديث"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {query.isLoading && <p className="text-sm text-slate-400">جارٍ التحميل…</p>}
        {query.error && (
          <p className="text-sm text-red-400">تعذّر التحميل: {(query.error as Error).message}</p>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-900/80 text-xs text-slate-400">
              <tr>
                <th className="px-2 py-2 w-16">ترتيب</th>
                <th className="px-2 py-2">المفتاح</th>
                <th className="px-2 py-2">العربية</th>
                <th className="px-2 py-2">الإنكليزية</th>
                <th className="px-2 py-2 w-24">الحالة</th>
                <th className="px-2 py-2 w-40">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {creating && (
                <EditRow
                  key="new"
                  type={type}
                  onDone={() => { setCreating(false); invalidate(); }}
                  onCancel={() => setCreating(false)}
                />
              )}
              {rows.map((r, i) => (
                <Row
                  key={r.id}
                  row={r}
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                  onChanged={invalidate}
                />
              ))}
              {rows.length === 0 && !creating && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    لا توجد مدخلات مطابقة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({
  row,
  isFirst,
  isLast,
  onChanged,
}: {
  row: TaxonomyEntry;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const mutation = useMutation({
    mutationFn: async (patch: Partial<TaxonomyEntry>) => {
      const { error } = await supabase
        .from("admin_taxonomy" as never)
        .update(patch as never)
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  const swapOrder = async (delta: number) => {
    const { data } = await supabase
      .from("admin_taxonomy" as never)
      .select("id, sort_order")
      .eq("type", row.type)
      .order("sort_order", { ascending: true });
    const list = (data as { id: string; sort_order: number }[] | null) ?? [];
    const idx = list.findIndex((r) => r.id === row.id);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= list.length) return;
    const a = list[idx], b = list[j];
    await Promise.all([
      supabase.from("admin_taxonomy" as never).update({ sort_order: b.sort_order } as never).eq("id", a.id),
      supabase.from("admin_taxonomy" as never).update({ sort_order: a.sort_order } as never).eq("id", b.id),
    ]);
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`حذف نهائي للمدخل "${row.key}"؟ الأفضل الأرشفة.`)) return;
    const { error } = await supabase.from("admin_taxonomy" as never).delete().eq("id", row.id);
    if (error) alert(error.message);
    else onChanged();
  };

  if (editing) {
    return (
      <EditRow
        type={row.type}
        row={row}
        onDone={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <tr className={"border-t border-slate-800 " + (row.archived ? "opacity-50" : "")}>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => swapOrder(-1)}
            disabled={isFirst}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
            title="أعلى"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => swapOrder(1)}
            disabled={isLast}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
            title="أسفل"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className="ms-1 text-xs text-slate-500">{row.sort_order}</span>
        </div>
      </td>
      <td className="px-2 py-1.5 font-mono text-xs text-amber-200" dir="ltr">{row.key}</td>
      <td className="px-2 py-1.5">{row.label_ar}</td>
      <td className="px-2 py-1.5 text-slate-400" dir="ltr">{row.label_en ?? "—"}</td>
      <td className="px-2 py-1.5">
        {row.archived ? (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">مؤرشف</span>
        ) : row.enabled ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">مفعّل</span>
        ) : (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">معطّل</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800"
          >
            تعديل
          </button>
          <button
            onClick={() => mutation.mutate({ enabled: !row.enabled })}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800"
          >
            {row.enabled ? "تعطيل" : "تفعيل"}
          </button>
          <button
            onClick={() => mutation.mutate({ archived: !row.archived })}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-slate-800"
            title={row.archived ? "استرجاع" : "أرشفة"}
          >
            {row.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={remove}
            className="rounded border border-red-900/50 bg-red-950/40 px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-950"
            title="حذف نهائي"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditRow({
  type,
  row,
  onDone,
  onCancel,
}: {
  type: TaxonomyType;
  row?: TaxonomyEntry;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(row?.key ?? "");
  const [labelAr, setLabelAr] = useState(row?.label_ar ?? "");
  const [labelEn, setLabelEn] = useState(row?.label_en ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [sortOrder, setSortOrder] = useState<number>(row?.sort_order ?? 999);
  const [enabled, setEnabled] = useState<boolean>(row?.enabled ?? true);
  const [color, setColor] = useState(row?.color ?? "");
  const [icon, setIcon] = useState(row?.icon ?? "");
  const [metaText, setMetaText] = useState(JSON.stringify(row?.metadata ?? {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    let metadata: Record<string, unknown> = {};
    try { metadata = metaText.trim() ? JSON.parse(metaText) : {}; }
    catch { setError("metadata ليست JSON صالحًا"); return; }
    const k = key.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!k) { setError("المفتاح مطلوب"); return; }
    if (!labelAr.trim()) { setError("الاسم العربي مطلوب"); return; }
    setSaving(true);
    const payload = {
      type, key: k,
      label_ar: labelAr.trim(),
      label_en: labelEn.trim() || null,
      description: description.trim() || null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 999,
      enabled,
      color: color.trim() || null,
      icon: icon.trim() || null,
      metadata,
    };
    const q = row
      ? supabase.from("admin_taxonomy" as never).update(payload as never).eq("id", row.id)
      : supabase.from("admin_taxonomy" as never).insert(payload as never);
    const { error: e } = await q;
    setSaving(false);
    if (e) setError(e.message);
    else onDone();
  };

  return (
    <tr className="border-t border-amber-500/30 bg-slate-900/40">
      <td colSpan={6} className="px-3 py-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <Field label="المفتاح (slug)" ltr>
            <input value={key} onChange={(e) => setKey(e.target.value)} className={inputCls} dir="ltr" disabled={!!row} />
          </Field>
          <Field label="الاسم بالعربية">
            <input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} className={inputCls} />
          </Field>
          <Field label="الاسم بالإنكليزية" ltr>
            <input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} className={inputCls} dir="ltr" />
          </Field>
          <Field label="ترتيب">
            <input
              type="number" value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              className={inputCls}
            />
          </Field>
          <Field label="لون (اختياري)" ltr>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} dir="ltr" placeholder="#f59e0b" />
          </Field>
          <Field label="أيقونة (اختياري)" ltr>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={inputCls} dir="ltr" placeholder="lucide:crown" />
          </Field>
          <div className="md:col-span-3">
            <Field label="وصف">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="metadata (JSON)">
              <textarea
                value={metaText}
                onChange={(e) => setMetaText(e.target.value)}
                className={inputCls + " min-h-[64px] font-mono text-xs"}
                dir="ltr"
              />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            مفعّل
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="ms-auto flex gap-2">
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" /> إلغاء
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              حفظ
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

const inputCls =
  "mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none focus:border-amber-400";

function Field({ label, ltr, children }: { label: string; ltr?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={"block text-[11px] text-slate-400 " + (ltr ? "text-left" : "")}>{label}</span>
      {children}
    </label>
  );
}
