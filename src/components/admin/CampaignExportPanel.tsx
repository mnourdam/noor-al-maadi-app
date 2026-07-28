/**
 * Campaign export toolbar — selection summary, export actions and the
 * validation/audit report. Strictly read-only: it never writes to the DB.
 */

import { useState } from "react";
import {
  FileJson, FileSpreadsheet, ShieldCheck, Loader2, X,
  AlertTriangle, CheckCircle2, Download,
} from "lucide-react";
import {
  fetchCampaignExportRows,
  fetchKnownEntityIds,
  buildEnvelope,
  buildAuditCsv,
  buildAuditReport,
  type CampaignAuditReport,
  type CampaignExportEntry,
} from "@/lib/admin/campaignExport";

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  totalCount: number;
  filteredCount: number;
  selectedIds: string[];
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type Busy = null | "json" | "csv" | "audit";

export function CampaignExportPanel({
  totalCount, filteredCount, selectedIds,
  onSelectAllFiltered, onClearSelection, onError, onSuccess,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [report, setReport] = useState<CampaignAuditReport | null>(null);

  const hasSelection = selectedIds.length > 0;

  const load = async (scoped: boolean): Promise<CampaignExportEntry[]> => {
    const rows = await fetchCampaignExportRows(scoped ? selectedIds : null);
    return buildEnvelope(rows, { scope: scoped ? "selection" : "all", includeAudit: false }).campaigns;
  };

  const exportJson = async (scoped: boolean) => {
    setBusy("json");
    try {
      const rows = await fetchCampaignExportRows(scoped ? selectedIds : null);
      const envelope = buildEnvelope(rows, { scope: scoped ? "selection" : "all", includeAudit: true });
      const label = scoped ? `selected-${envelope.counts.campaigns}` : "all";
      download(
        `irth-campaigns-${label}-${stamp()}.json`,
        JSON.stringify(envelope, null, 2),
        "application/json;charset=utf-8",
      );
      onSuccess(`تم تصدير ${envelope.counts.campaigns} حملة (${envelope.counts.chapters} فصلًا، ${envelope.counts.activities} نشاطًا).`);
    } catch (e: any) {
      onError(e?.message ?? "تعذّر التصدير.");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = async (scoped: boolean) => {
    setBusy("csv");
    try {
      const entries = await load(scoped);
      const csv = buildAuditCsv(entries);
      const label = scoped ? `selected-${entries.length}` : "all";
      // BOM so Excel opens Arabic correctly
      download(`irth-campaigns-audit-${label}-${stamp()}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
      onSuccess(`تم تصدير ورقة التدقيق (${entries.length} حملة).`);
    } catch (e: any) {
      onError(e?.message ?? "تعذّر التصدير.");
    } finally {
      setBusy(null);
    }
  };

  const runAudit = async (scoped: boolean) => {
    setBusy("audit");
    try {
      const entries = await load(scoped);
      const known = await fetchKnownEntityIds();
      setReport(buildAuditReport(entries, known));
    } catch (e: any) {
      onError(e?.message ?? "تعذّر إنشاء التقرير.");
    } finally {
      setBusy(null);
    }
  };

  const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition disabled:opacity-40";
  const neutral = `${btn} border-slate-700 text-slate-200 hover:border-amber-400 hover:text-amber-300`;
  const accent = `${btn} border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20`;

  return (
    <section className="rounded-xl border border-amber-500/20 bg-slate-900/40 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-100">
          <Download className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold">تصدير الحملات (قراءة فقط)</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300">
            المحدد: <strong className="text-amber-200">{selectedIds.length}</strong> من {filteredCount}
            {filteredCount !== totalCount && <span className="text-slate-500"> (الإجمالي {totalCount})</span>}
          </span>
          <button onClick={onSelectAllFiltered} className={neutral}>تحديد نتائج الفلترة</button>
          <button onClick={onClearSelection} disabled={!hasSelection} className={neutral}>إلغاء التحديد</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button disabled={!hasSelection || busy !== null} onClick={() => exportJson(true)} className={accent}>
          {busy === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
          JSON — المحدد
        </button>
        <button disabled={busy !== null} onClick={() => exportJson(false)} className={neutral}>
          <FileJson className="h-3.5 w-3.5" /> JSON — كل الحملات
        </button>
        <button disabled={!hasSelection || busy !== null} onClick={() => exportCsv(true)} className={accent}>
          {busy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          CSV تدقيق — المحدد
        </button>
        <button disabled={busy !== null} onClick={() => exportCsv(false)} className={neutral}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> CSV تدقيق — الكل
        </button>
        <button disabled={busy !== null} onClick={() => runAudit(hasSelection)} className={neutral}>
          {busy === "audit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          تقرير التحقق {hasSelection ? "— المحدد" : "— الكل"}
        </button>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
        ملف JSON كامل الدقة: يحتوي مستند الحملة كما هو مخزّن حرفيًا (المعرّفات، الفصول، الأنشطة، الخيارات،
        الإجابات، المكافآت، الفتوحات، الروابط والبيانات الوصفية) مع الحفاظ على الترتيب وأنواع البيانات،
        وهو صالح لإعادة الاستيراد دون تغيير أي معرّف. ملف CSV مسطّح للمراجعة البشرية فقط.
      </p>

      {report && <AuditReportModal report={report} onClose={() => setReport(null)} />}
    </section>
  );
}

function AuditReportModal({ report, onClose }: { report: CampaignAuditReport; onClose: () => void }) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const list = onlyProblems
    ? report.campaigns.filter((c) => c.errors > 0 || c.warnings > 0)
    : report.campaigns;

  const downloadReport = () => {
    download(`irth-campaigns-validation-${stamp()}.json`, JSON.stringify(report, null, 2), "application/json;charset=utf-8");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-950 p-6 text-slate-100 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-amber-100">تقرير التحقق من الحملات</h2>
            <p className="mt-1 text-[11px] text-slate-400">
              {report.totals.campaigns} حملة · {report.totals.chapters} فصلًا · {report.totals.activities} نشاطًا
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-amber-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-lg border px-2 py-1 ${report.totals.errors > 0 ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"}`}>
            {report.totals.errors > 0 ? <AlertTriangle className="me-1 inline h-3.5 w-3.5" /> : <CheckCircle2 className="me-1 inline h-3.5 w-3.5" />}
            أخطاء: <strong>{report.totals.errors}</strong>
          </span>
          <span className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-amber-200">
            تنبيهات: <strong>{report.totals.warnings}</strong>
          </span>
          <label className="ms-auto flex items-center gap-1.5 text-slate-300">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)}
              className="h-3.5 w-3.5 accent-amber-500" />
            إظهار الحملات ذات الملاحظات فقط
          </label>
          <button onClick={downloadReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1 text-slate-200 hover:border-amber-400 hover:text-amber-300">
            <FileJson className="h-3.5 w-3.5" /> تنزيل التقرير
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {list.length === 0 && (
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-200">
              لا توجد ملاحظات — كل الحملات المفحوصة سليمة.
            </p>
          )}
          {list.map((c) => (
            <div key={c.campaign_id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-amber-100">{c.title}</p>
                  <p className="text-[10px] text-slate-500">{c.slug || c.campaign_id} · {c.chapter_count} فصلًا · {c.activity_count} نشاطًا</p>
                </div>
                <div className="flex gap-1.5 text-[10px]">
                  {c.errors > 0 && <span className="rounded border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-red-200">{c.errors} خطأ</span>}
                  {c.warnings > 0 && <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-200">{c.warnings} تنبيه</span>}
                  {c.errors === 0 && c.warnings === 0 && <span className="rounded border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">سليمة</span>}
                </div>
              </div>
              {c.issues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.issues.map((i, idx) => (
                    <li key={idx} className={`text-[11px] ${i.severity === "error" ? "text-red-200" : "text-amber-200/90"}`}>
                      • {i.message}
                      {(i.chapter_id || i.activity_id) && (
                        <span className="text-slate-500"> ({[i.chapter_id, i.activity_id].filter(Boolean).join(" / ")})</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
