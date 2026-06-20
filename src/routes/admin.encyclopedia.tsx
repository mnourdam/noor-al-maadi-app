import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Landmark, Upload, RefreshCw, Eye, EyeOff, Trash2, Plus, Save, X,
  CheckCircle2, AlertTriangle, FileJson,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/encyclopedia")({
  head: () => ({
    meta: [
      { title: "إدارة الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminEncyclopediaPage /></AdminGate>,
});

const ENTITY_TYPES = ["figure","city","battle","state","event","landmark","artifact"] as const;
type EntityType = typeof ENTITY_TYPES[number];

const TYPE_LABELS: Record<EntityType, string> = {
  figure: "شخصيات",
  city: "مدن",
  battle: "معارك",
  state: "دول",
  event: "أحداث",
  landmark: "معالم",
  artifact: "آثار",
};

interface Entity {
  id: string;
  entity_type: EntityType;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  body: any;
  metadata: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface Toast { kind: "ok" | "err"; msg: string }

function AdminEncyclopediaPage() {
  const [rows, setRows] = useState<Entity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntityType | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entity | "new" | null>(null);
  const [jsonUpdating, setJsonUpdating] = useState<Entity | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from("encyclopedia_entities" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as unknown as Entity[]);
    setErr(null);
  };

  useEffect(() => { refresh(); }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (filter === "all" || r.entity_type === filter) &&
      (!q || r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))
    );
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const t of ENTITY_TYPES) c[t] = 0;
    rows?.forEach(r => { c[r.entity_type] = (c[r.entity_type] ?? 0) + 1; });
    return c;
  }, [rows]);

  const toggleEnabled = async (e: Entity) => {
    const { error } = await supabase.from("encyclopedia_entities" as any)
      .update({ enabled: !e.enabled }).eq("id", e.id);
    if (error) return notify("err", error.message);
    notify("ok", !e.enabled ? "تم التفعيل." : "تم التعطيل.");
    refresh();
  };

  const remove = async (e: Entity) => {
    if (!confirm(`حذف "${e.title}" (${e.entity_type})؟ لا يمكن التراجع.`)) return;
    const { error } = await supabase.from("encyclopedia_entities" as any).delete().eq("id", e.id);
    if (error) return notify("err", error.message);
    notify("ok", "تم الحذف.");
    refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Landmark className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة الموسوعة</h1>
              <p className="text-sm text-slate-400">شخصيات، مدن، معارك، دول، أحداث، معالم، آثار</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              ← لوحة الإدارة
            </Link>
            <button onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300">
              <RefreshCw className="h-3.5 w-3.5" /> تحديث
            </button>
            <Link to="/admin/import" search={{ type: "encyclopedia" } as any}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <Upload className="h-3.5 w-3.5" /> استيراد JSON
            </Link>
            <button onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label={`الكل (${counts.all})`} />
          {ENTITY_TYPES.map(t => (
            <FilterBtn key={t} active={filter === t} onClick={() => setFilter(t)} label={`${TYPE_LABELS[t]} (${counts[t]})`} />
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو slug..."
            className="ms-auto w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-amber-400/50"
          />
        </div>

        {err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            تعذّر التحميل: {err}
          </div>
        )}

        {rows === null && !err && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">جارٍ التحميل…</div>
        )}

        {rows && visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-amber-500/30 bg-slate-900/40 p-10 text-center">
            <Landmark className="mx-auto mb-3 h-8 w-8 text-amber-400/70" />
            <p className="text-base font-semibold text-amber-100">
              {rows.length === 0 ? "لا توجد مدخلات موسوعة بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {rows.length === 0 && (
              <p className="mt-1 text-sm text-slate-400">أضف مدخلًا يدويًا أو استورد JSON.</p>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">العنوان</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2">آخر تحديث</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visible.map(e => (
                  <tr key={e.id} className="hover:bg-slate-900/60">
                    <td className="px-3 py-2 text-xs text-amber-300">{TYPE_LABELS[e.entity_type]}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-100">{e.title}</div>
                      {e.subtitle && <div className="text-xs text-slate-400">{e.subtitle}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{e.slug}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        e.enabled
                          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                          : "border-slate-600 bg-slate-800 text-slate-400"
                      }`}>{e.enabled ? "مفعّل" : "معطّل"}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{formatDate(e.updated_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        <IconBtn onClick={() => setEditing(e)} icon={Save} label="تحرير" />
                        <IconBtn onClick={() => setJsonUpdating(e)} icon={FileJson} label="تحديث من JSON" />
                        <IconBtn onClick={() => toggleEnabled(e)} icon={e.enabled ? EyeOff : Eye}
                          label={e.enabled ? "تعطيل" : "تفعيل"} />
                        <IconBtn onClick={() => remove(e)} icon={Trash2} label="حذف" danger />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {editing && (
        <EntityEditor
          value={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { notify("ok", msg); setEditing(null); refresh(); }}
          onError={(msg) => notify("err", msg)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm shadow-xl ${
          toast.kind === "ok"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
            : "border-red-400/40 bg-red-500/15 text-red-100"
        }`}>
          {toast.kind === "ok"
            ? <CheckCircle2 className="me-1 inline h-4 w-4" />
            : <AlertTriangle className="me-1 inline h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function EntityEditor({ value, onClose, onSaved, onError }: {
  value: Entity | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isNew = !value;
  const [form, setForm] = useState({
    entity_type: (value?.entity_type ?? "figure") as EntityType,
    slug: value?.slug ?? "",
    title: value?.title ?? "",
    subtitle: value?.subtitle ?? "",
    summary: value?.summary ?? "",
    enabled: value?.enabled ?? true,
    body: JSON.stringify(value?.body ?? {}, null, 2),
    metadata: JSON.stringify(value?.metadata ?? {}, null, 2),
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.slug.trim()) return onError("slug مطلوب.");
    if (!/^[a-z0-9-]+$/.test(form.slug)) return onError("slug يجب أن يكون أحرف صغيرة وأرقام و-.");
    if (!form.title.trim()) return onError("العنوان مطلوب.");
    let body: any, metadata: any;
    try { body = JSON.parse(form.body || "{}"); } catch (e: any) { return onError(`body ليس JSON صحيح: ${e.message}`); }
    try { metadata = JSON.parse(form.metadata || "{}"); } catch (e: any) { return onError(`metadata ليس JSON صحيح: ${e.message}`); }

    setBusy(true);
    const payload = {
      entity_type: form.entity_type,
      slug: form.slug.trim(),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      summary: form.summary.trim() || null,
      body, metadata,
      enabled: form.enabled,
    };
    const { error } = isNew
      ? await supabase.from("encyclopedia_entities" as any).insert(payload)
      : await supabase.from("encyclopedia_entities" as any).update(payload).eq("id", value!.id);
    setBusy(false);
    if (error) return onError(error.message);
    onSaved(isNew ? "تمت الإضافة." : "تم الحفظ.");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-amber-100">{isNew ? "مدخل جديد" : `تحرير: ${value!.title}`}</h2>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="النوع">
            <select value={form.entity_type}
              onChange={e => setForm(f => ({ ...f, entity_type: e.target.value as EntityType }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Slug *">
            <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              placeholder="salah-al-din" dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm" />
          </Field>
          <Field label="العنوان *">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
          <Field label="العنوان الفرعي">
            <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="ملخّص">
            <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="body (JSON)">
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={8} dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </Field>
          <Field label="metadata (JSON)">
            <textarea value={form.metadata} onChange={e => setForm(f => ({ ...f, metadata: e.target.value }))}
              rows={8} dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled}
            onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
          مفعّل (مرئي للجميع)
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm">إلغاء</button>
          <button onClick={save} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            <Save className="h-4 w-4" /> {busy ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
        active
          ? "border-amber-400 bg-amber-500/15 text-amber-200"
          : "border-slate-700 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
      }`}>{label}</button>
  );
}

function IconBtn({ onClick, icon: Icon, label, danger }: { onClick: () => void; icon: any; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
        danger
          ? "border-red-400/30 text-red-300 hover:bg-red-500/10"
          : "border-slate-700 text-slate-300 hover:border-amber-400/40 hover:text-amber-300"
      }`}>
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}
