// ============================================================
// /admin/import-history/$id — Phase 5.
// Batch detail: per-item results with before/after diff and a
// safe-rollback action guarded by an evidence-based conflict check.
// ============================================================
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { getImportBatch, rollbackImportBatch } from "@/lib/import/import-batch.functions";
import { Loader2, Undo2, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/import-history/$id")({
  head: () => ({ meta: [{ title: "تفاصيل عملية استيراد — إرث" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <AdminGate><BatchDetail /></AdminGate>,
});

function BatchDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [rollbackReport, setRollbackReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await getImportBatch({ data: { batch_id: id } });
      setBatch(r.batch); setItems(r.items);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  const runRollback = async (force = false) => {
    if (!confirm(force ? "تراجع قسري: قد يستبدل تعديلات لاحقة. متابعة؟" : "تأكيد التراجع؟")) return;
    setRolling(true); setError(null); setRollbackReport(null);
    try {
      const r = await rollbackImportBatch({ data: { batch_id: id, force } });
      setRollbackReport(r);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setRolling(false); }
  };

  return (
    <AdminLayout
      title="تفاصيل عملية الاستيراد"
      subtitle="السجل الكامل للاستيراد مع قبل/بعد لكل صف وتراجع آمن مبني على الأدلة."
      breadcrumbs={[{ label: "سجل الاستيراد", href: "/admin/import-history" }, { label: "تفاصيل" }]}
    >
      <div className="mx-auto max-w-6xl space-y-4">
        {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
        {error && <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        {batch && (
          <div className="rounded-md border border-slate-800 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <Field label="النوع" value={batch.content_type} />
              <Field label="الوضع" value={batch.mode} />
              <Field label="الحالة" value={batch.status} />
              <Field label="الملف" value={batch.file_name ?? "—"} />
              <Field label="العناصر" value={String(batch.item_count)} />
              <Field label="أُنشئ" value={String(batch.create_count)} />
              <Field label="عُدّل" value={String(batch.update_count)} />
              <Field label="مُتخطى" value={String(batch.skip_count)} />
              <Field label="Hash" value={batch.approved_plan_hash?.slice(0, 12)} />
              <Field label="بدأ" value={new Date(batch.started_at).toLocaleString("ar")} />
              <Field label="اكتمل" value={batch.completed_at ? new Date(batch.completed_at).toLocaleString("ar") : "—"} />
              {batch.error_summary && <Field label="خطأ" value={batch.error_summary} />}
            </div>

            {batch.status === "succeeded" && batch.mode === "commit" && (
              <div className="mt-4 flex gap-2">
                <button
                  disabled={rolling}
                  onClick={() => void runRollback(false)}
                  className="inline-flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400 disabled:opacity-50"
                >
                  {rolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} تراجع آمن
                </button>
                <button
                  disabled={rolling}
                  onClick={() => void runRollback(true)}
                  className="inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 hover:border-red-400 disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" /> تراجع قسري
                </button>
              </div>
            )}

            {rollbackReport && (
              <div className="mt-4 rounded border border-slate-700 bg-slate-900/40 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-slate-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> نتيجة التراجع
                </div>
                <pre className="whitespace-pre-wrap text-xs text-slate-300">{JSON.stringify(rollbackReport, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-right">#</th>
                <th className="px-3 py-2 text-right">الإجراء</th>
                <th className="px-3 py-2 text-right">النتيجة</th>
                <th className="px-3 py-2 text-right">المعرّف/الـSlug</th>
                <th className="px-3 py-2 text-right">قبل/بعد</th>
                <th className="px-3 py-2 text-right">الخطأ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-800 align-top">
                  <td className="px-3 py-2 text-slate-500">{it.item_index}</td>
                  <td className="px-3 py-2">{it.action}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      it.result === "inserted" || it.result === "updated" || it.result === "aliased" || it.result === "rolled_back"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : it.result === "failed" || it.result === "rollback_failed" || it.result === "rollback_conflict"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-slate-500/15 text-slate-300"
                    }`}>
                      {it.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{it.incoming_slug ?? it.incoming_id ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {it.before_snapshot ? "قبل ✓" : "—"} / {it.after_snapshot ? "بعد ✓" : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-300">{it.error_message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-200">{value}</div>
    </div>
  );
}
