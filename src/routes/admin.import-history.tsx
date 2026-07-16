// ============================================================
// /admin/import-history — Phase 5.
// Lists every dry-run and commit run, filterable by status / content
// type / mode / date. Opens a detail page for each batch.
// ============================================================
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { listImportBatches } from "@/lib/import/import-batch.functions";
import { Loader2, ScrollText, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/admin/import-history")({
  head: () => ({
    meta: [
      { title: "سجل الاستيراد — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><HistoryPage /></AdminGate>,
});

const STATUS_AR: Record<string, string> = {
  validating: "تحقّق",
  ready: "جاهز (تجريبي)",
  committing: "قيد التنفيذ",
  succeeded: "نجح",
  failed: "فشل",
  rolled_back: "تراجع",
  rollback_failed: "فشل التراجع",
};
const MODE_AR: Record<string, string> = { dry_run: "تشغيل تجريبي", commit: "تنفيذ" };

function HistoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [mode, setMode] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await listImportBatches({
        data: {
          status: status || undefined,
          content_type: type || undefined,
          mode: mode || undefined,
        },
      });
      setRows(res);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [status, type, mode]);

  return (
    <AdminLayout
      title="سجل الاستيراد"
      subtitle="كل تشغيل تجريبي وكل تنفيذ اعتمدته موثّق هنا — مع تفاصيل الصفوف وإمكانية التراجع."
      breadcrumbs={[{ label: "سجل الاستيراد" }]}
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS_AR)} />
          <FilterSelect value={type} onChange={setType} placeholder="كل الأنواع" options={[
            ["encyclopedia","الموسوعة"],["daily_facts","معلومات يومية"],
            ["today_in_history_events","أحداث تاريخية"],["notifications","إشعارات"],
            ["investigations","تحقيقات"],["campaigns","حملات"],
          ]} />
          <FilterSelect value={mode} onChange={setMode} placeholder="كل الأوضاع" options={Object.entries(MODE_AR)} />
          <button
            onClick={() => void load()}
            className="ms-auto inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
          >
            <RefreshCcw className="h-4 w-4" /> تحديث
          </button>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-right">التاريخ</th>
                <th className="px-3 py-2 text-right">النوع</th>
                <th className="px-3 py-2 text-right">الوضع</th>
                <th className="px-3 py-2 text-right">الملف</th>
                <th className="px-3 py-2 text-right">العناصر</th>
                <th className="px-3 py-2 text-right">جديد/تعديل/تخطي</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-slate-500">لا توجد عمليات استيراد بعد.</td></tr>
              )}
              {!loading && rows.map((b) => (
                <tr key={b.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-300">{new Date(b.started_at).toLocaleString("ar")}</td>
                  <td className="px-3 py-2">{b.content_type}</td>
                  <td className="px-3 py-2">{MODE_AR[b.mode] ?? b.mode}</td>
                  <td className="px-3 py-2 text-slate-400">{b.file_name ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{b.item_count}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">
                    <span className="text-emerald-300">+{b.create_count}</span>
                    {" / "}<span className="text-amber-200">~{b.update_count}</span>
                    {" / "}<span className="text-slate-400">·{b.skip_count}</span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="px-3 py-2 text-left">
                    <Link
                      to="/admin/import-history/$id"
                      params={{ id: b.id }}
                      className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-amber-400"
                    >
                      <ScrollText className="h-3.5 w-3.5" /> تفاصيل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
    >
      <option value="">{placeholder}</option>
      {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "succeeded" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
    : status === "failed" || status === "rollback_failed" ? "bg-red-500/15 text-red-300 border-red-500/40"
    : status === "rolled_back" ? "bg-slate-500/15 text-slate-300 border-slate-500/40"
    : status === "ready" ? "bg-sky-500/15 text-sky-300 border-sky-500/40"
    : "bg-amber-500/15 text-amber-200 border-amber-500/40";
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${tone}`}>{STATUS_AR[status] ?? status}</span>;
}
