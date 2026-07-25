// ============================================================
// Investigation Export dialog (admin only)
// ------------------------------------------------------------
// Read-only: pulls complete records from the server in batches,
// validates them with the canonical validator, then offers three
// artifacts (full JSON bundle · CSV summary · validation report).
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  X, Download, FileJson, FileSpreadsheet, ShieldCheck, AlertTriangle,
  CheckCircle2, Loader2, RefreshCw,
} from "lucide-react";
import {
  buildBundle, buildCsv, buildReport, downloadFile, exportFileName,
  fetchInvestigationsForExport,
  type ExportedInvestigation, type ExportReport,
} from "@/lib/investigations/export";

interface Props {
  /** `null` = export the entire library. */
  ids: string[] | null;
  /** Human label for the scope, used in the filename. */
  scopeLabel: string;
  onClose: () => void;
}

export function InvestigationExportDialog({ ids, scopeLabel, onClose }: Props) {
  const scope: "all" | "selection" = ids === null ? "all" : "selection";
  const [rows, setRows] = useState<ExportedInvestigation[] | null>(null);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setRows(null);
    setReport(null);
    setProgress({ loaded: 0, total: ids?.length ?? 0 });
    try {
      const { rows: fetched } = await fetchInvestigationsForExport(ids, setProgress);
      setRows(fetched);
      setReport(buildReport(fetched));
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تجهيز التصدير.");
    } finally {
      setBusy(false);
    }
  }, [ids]);

  useEffect(() => { run(); }, [run]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;

  const worst = useMemo(() => {
    if (!report) return [];
    return [...report.items]
      .filter((i) => i.errors.length > 0 || i.warnings.length > 0)
      .sort((a, b) => (b.errors.length - a.errors.length) || (b.warnings.length - a.warnings.length))
      .slice(0, 12);
  }, [report]);

  const dlBundle = () => rows && downloadFile(
    exportFileName("bundle", scope),
    JSON.stringify(buildBundle(rows, scope, progress.total), null, 2),
    "application/json",
  );
  const dlCsv = () => rows && downloadFile(exportFileName("summary", scope), buildCsv(rows), "text/csv");
  const dlReport = () => report && downloadFile(
    exportFileName("report", scope), JSON.stringify(report, null, 2), "application/json",
  );
  const dlAll = () => { dlBundle(); dlCsv(); dlReport(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-amber-100">
              <Download className="h-5 w-5 text-amber-400" /> تصدير التحقيقات
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              النطاق: <span className="text-amber-200">{scopeLabel}</span> — تصدير للقراءة فقط، لا يغيّر أي بيانات.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {busy && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              جارٍ تجهيز الحزمة… {progress.loaded}
              {progress.total ? ` / ${progress.total}` : ""}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-amber-400/70 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error}</div>
            <button onClick={run} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 px-2 py-1 text-xs">
              <RefreshCw className="h-3 w-3" /> إعادة المحاولة
            </button>
          </div>
        )}

        {report && rows && (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              <Stat label="تحقيقات" value={report.totals.investigations} tone="neutral" />
              <Stat label="جاهزة للاستيراد" value={report.totals.importSafe} tone="ok" />
              <Stat label="بها أخطاء" value={report.totals.withErrors} tone={report.totals.withErrors ? "err" : "neutral"} />
              <Stat label="متوسط الإكمال" value={`${report.totals.averageCompleteness}%`} tone="warn" />
            </div>

            {report.totals.withErrors === 0 ? (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" /> جميع التحقيقات في هذا النطاق تجتاز مدقّق الاستيراد.
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                {report.totals.withErrors} تحقيق سيُرفض عند إعادة الاستيراد — راجع تقرير التحقق.
              </p>
            )}

            {worst.length > 0 && (
              <section className="mt-3 overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Slug</th>
                      <th className="px-3 py-2">أخطاء</th>
                      <th className="px-3 py-2">تحذيرات</th>
                      <th className="px-3 py-2">الإكمال</th>
                      <th className="px-3 py-2">أول مشكلة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {worst.map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-300" dir="ltr">{i.slug}</td>
                        <td className={`px-3 py-2 ${i.errors.length ? "text-red-300" : "text-slate-500"}`}>{i.errors.length}</td>
                        <td className={`px-3 py-2 ${i.warnings.length ? "text-amber-300" : "text-slate-500"}`}>{i.warnings.length}</td>
                        <td className="px-3 py-2 text-slate-300">{i.completeness}%</td>
                        <td className="px-3 py-2 text-slate-400">
                          {(i.errors[0] ?? i.warnings[0])?.message ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ActionBtn onClick={dlBundle} icon={FileJson} title="حزمة JSON كاملة"
                sub="كل الحقول والخطوات والمراجع — جاهزة لإعادة الاستيراد" />
              <ActionBtn onClick={dlCsv} icon={FileSpreadsheet} title="ملخّص CSV"
                sub="جدول تدقيق (UTF-8 BOM) يفتح في Excel بالعربية" />
              <ActionBtn onClick={dlReport} icon={ShieldCheck} title="تقرير التحقق"
                sub="الأخطاء والتحذيرات ونسبة الإكمال لكل تحقيق" />
              <ActionBtn onClick={dlAll} icon={Download} title="تنزيل الثلاثة" sub="الحزمة + الملخّص + التقرير" primary />
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <CheckCircle2 className="h-3 w-3" /> المصدر: الخادم فقط — تمّت القراءة على دفعات مرتّبة بالـ slug.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "ok" | "err" | "warn" | "neutral" }) {
  const cls = tone === "ok"
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
    : tone === "err"
    ? "border-red-400/30 bg-red-500/10 text-red-200"
    : tone === "warn"
    ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
    : "border-slate-700 bg-slate-900/60 text-slate-200";
  return (
    <div className={`rounded-xl border p-3 text-center ${cls}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[11px] opacity-80">{label}</div>
    </div>
  );
}

function ActionBtn({ onClick, icon: Icon, title, sub, primary }: {
  onClick: () => void; icon: any; title: string; sub: string; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-start gap-2 rounded-xl border p-3 text-right transition ${
        primary
          ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20"
          : "border-slate-700 bg-slate-900/50 hover:border-amber-400/40"
      }`}>
      <Icon className="mt-0.5 h-4 w-4 text-amber-300" />
      <span>
        <span className="block text-sm font-semibold text-amber-100">{title}</span>
        <span className="block text-[11px] text-slate-400">{sub}</span>
      </span>
    </button>
  );
}
