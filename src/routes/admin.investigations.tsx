import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Upload, RefreshCw, Eye, EyeOff, Trash2, Plus, Save, X,
  CheckCircle2, AlertTriangle, FileJson,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/lib/admin-guard";
import {
  type InvestigationRow,
  type InvestigationReward,
  type InvestigationStep,
  countQuestions,
} from "@/lib/investigations-source";

export const Route = createFileRoute("/admin/investigations")({
  head: () => ({
    meta: [
      { title: "إدارة التحقيقات — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><AdminInvestigationsPage /></AdminGate>,
});

interface Toast { kind: "ok" | "err"; msg: string }

function AdminInvestigationsPage() {
  const [rows, setRows] = useState<InvestigationRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InvestigationRow | "new" | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    const { data, error } = await supabase
      .from("investigations" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { setErr(error.message); return; }
    setRows((data ?? []) as unknown as InvestigationRow[]);
    setErr(null);
  };

  useEffect(() => { refresh(); }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      !q || r.title.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggleEnabled = async (r: InvestigationRow) => {
    const { error } = await supabase
      .from("investigations" as any)
      .update({ enabled: !r.enabled })
      .eq("id", r.id);
    if (error) return notify("err", error.message);
    notify("ok", !r.enabled ? "تم التفعيل." : "تم التعطيل.");
    refresh();
  };

  const remove = async (r: InvestigationRow) => {
    if (!confirm(`حذف "${r.title}"؟ لا يمكن التراجع.`)) return;
    const { error } = await supabase.from("investigations" as any).delete().eq("id", r.id);
    if (error) return notify("err", error.message);
    notify("ok", "تم الحذف.");
    refresh();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Search className="h-7 w-7 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold text-amber-100">إدارة التحقيقات</h1>
              <p className="text-sm text-slate-400">تحقيقات تاريخية قابلة للعب من Supabase</p>
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
            <Link to="/admin/import" search={{ type: "investigations" } as any}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/10">
              <Upload className="h-3.5 w-3.5" /> استيراد JSON
            </Link>
            <button onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400">
              <Plus className="h-3.5 w-3.5" /> إضافة
            </button>
          </div>
        </header>

        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <Search className="mx-auto mb-3 h-8 w-8 text-amber-400/70" />
            <p className="text-base font-semibold text-amber-100">
              {rows.length === 0 ? "لا توجد تحقيقات بعد" : "لا توجد نتائج مطابقة"}
            </p>
            {rows.length === 0 && (
              <p className="mt-1 text-sm text-slate-400">أضف تحقيقًا يدويًا أو استورد JSON.</p>
            )}
          </div>
        )}

        {visible.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">العنوان</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2">صعوبة</th>
                  <th className="px-3 py-2">خطوات</th>
                  <th className="px-3 py-2">مكافأة</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visible.map((r) => {
                  const reward = (r.reward ?? {}) as InvestigationReward;
                  const steps = Array.isArray(r.steps) ? r.steps : [];
                  return (
                    <tr key={r.id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-100">{r.title}</div>
                        {r.subtitle && <div className="text-xs text-slate-400">{r.subtitle}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">{r.slug}</td>
                      <td className="px-3 py-2 text-xs text-amber-300">{r.difficulty}</td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {steps.length} · أسئلة {countQuestions(steps)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-300">
                        {reward.hearts ? `❤️${reward.hearts} ` : ""}
                        {reward.xp ? `XP+${reward.xp} ` : ""}
                        {reward.coins ? `🪙${reward.coins}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                          r.enabled
                            ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                            : "border-slate-600 bg-slate-800 text-slate-400"
                        }`}>{r.enabled ? "مفعّل" : "معطّل"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1.5">
                          <IconBtn onClick={() => setEditing(r)} icon={Save} label="تحرير" />
                          <IconBtn onClick={() => toggleEnabled(r)} icon={r.enabled ? EyeOff : Eye}
                            label={r.enabled ? "تعطيل" : "تفعيل"} />
                          <IconBtn onClick={() => remove(r)} icon={Trash2} label="حذف" danger />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {editing && (
        <InvestigationEditor
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

function InvestigationEditor({ value, onClose, onSaved, onError }: {
  value: InvestigationRow | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isNew = !value;
  const [form, setForm] = useState({
    slug: value?.slug ?? "",
    title: value?.title ?? "",
    subtitle: value?.subtitle ?? "",
    description: value?.description ?? "",
    difficulty: value?.difficulty ?? "easy",
    enabled: value?.enabled ?? true,
    reward: JSON.stringify(value?.reward ?? { hearts: 1, xp: 30, coins: 15 }, null, 2),
    steps: JSON.stringify(value?.steps ?? [], null, 2),
    related_entities: JSON.stringify(value?.related_entities ?? [], null, 2),
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.slug.trim()) return onError("slug مطلوب.");
    if (!/^[a-z0-9-]+$/.test(form.slug)) return onError("slug يجب أن يكون أحرف صغيرة وأرقام و-.");
    if (!form.title.trim()) return onError("العنوان مطلوب.");
    let reward: any, steps: any, related: any;
    try { reward = JSON.parse(form.reward || "{}"); } catch (e: any) { return onError(`reward ليس JSON صحيح: ${e.message}`); }
    try { steps = JSON.parse(form.steps || "[]"); } catch (e: any) { return onError(`steps ليس JSON صحيح: ${e.message}`); }
    try { related = JSON.parse(form.related_entities || "[]"); } catch (e: any) { return onError(`related_entities ليس JSON صحيح: ${e.message}`); }
    if (!Array.isArray(steps)) return onError("steps يجب أن يكون مصفوفة.");
    if (!Array.isArray(related)) return onError("related_entities يجب أن يكون مصفوفة.");

    setBusy(true);
    const payload: any = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      description: form.description.trim() || null,
      difficulty: form.difficulty,
      reward,
      steps,
      related_entities: related,
      enabled: form.enabled,
    };
    const { error } = isNew
      ? await supabase.from("investigations" as any).insert(payload)
      : await supabase.from("investigations" as any).update(payload).eq("id", value!.id);
    setBusy(false);
    if (error) return onError(error.message);
    onSaved(isNew ? "تمت الإضافة." : "تم الحفظ.");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-amber-100">{isNew ? "تحقيق جديد" : `تحرير: ${value!.title}`}</h2>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Slug *">
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="saqifah-investigation" dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm" />
          </Field>
          <Field label="الصعوبة">
            <select value={form.difficulty}
              onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              <option value="easy">سهل</option>
              <option value="medium">متوسط</option>
              <option value="hard">صعب</option>
            </select>
          </Field>
          <Field label="العنوان *">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
          <Field label="العنوان الفرعي">
            <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="الوصف">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="reward (JSON)">
            <textarea value={form.reward} onChange={(e) => setForm((f) => ({ ...f, reward: e.target.value }))}
              rows={6} dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </Field>
          <Field label="related_entities (JSON array)">
            <textarea value={form.related_entities} onChange={(e) => setForm((f) => ({ ...f, related_entities: e.target.value }))}
              rows={6} dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="steps (JSON array)">
            <textarea value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))}
              rows={12} dir="ltr"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs" />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled}
            onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
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

// Silence unused FileJson import warning in some build configs.
void FileJson;
