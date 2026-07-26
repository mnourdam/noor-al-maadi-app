// ============================================================
// Admin · Crash Diagnostics
// ------------------------------------------------------------
// Reads the locally persisted crash ring buffer written by
// `captureCrash` right before the fatal recovery screen renders.
// Nothing is uploaded; nothing here contains tokens, emails or
// personal data (see `redact` in lib/diagnostics/crash-report).
//
// Also exposes the same safe navigation reset the recovery
// screen offers, plus a controlled fatal simulation so the
// clean-boot contract can be verified on a real device.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { AlertTriangle, Copy, RefreshCcw, Trash2 } from "lucide-react";
import { AppShell, Screen } from "@/components/AppShell";
import { AdminGate } from "@/lib/admin-guard";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  clearCrashReports,
  formatCrashReport,
  readCrashReports,
  type CrashReport,
} from "@/lib/diagnostics/crash-report";
import { resetNavigationState } from "@/lib/diagnostics/safe-boot";

export const Route = createFileRoute("/admin/crash-diagnostics")({
  head: () => ({
    meta: [
      { title: "تشخيص الأعطال — إرث" },
      { name: "description", content: "سجل محلي لآخر الأعطال الفادحة مع حالة التنقل والتخزين وقت العطل." },
      { property: "og:title", content: "تشخيص الأعطال — إرث" },
      { property: "og:description", content: "سجل محلي لآخر الأعطال الفادحة في التطبيق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CrashDiagnosticsPage,
});

function CrashDiagnosticsPage() {
  const [reports, setReports] = useState<CrashReport[]>(() => readCrashReports());
  const [note, setNote] = useState<string>("");

  const refresh = useCallback(() => {
    setReports(readCrashReports());
    setNote("تم التحديث.");
  }, []);

  const copyAll = useCallback(() => {
    const text = reports.map(formatCrashReport).join("\n\n---\n\n");
    try {
      void navigator.clipboard?.writeText(text);
      setNote("تم نسخ التقارير.");
    } catch {
      setNote("تعذّر النسخ.");
    }
  }, [reports]);

  return (
    <AdminGate>
      <AppShell>
        <Screen title="تشخيص الأعطال">
          <Breadcrumbs items={[{ label: "الإدارة", to: "/admin" }, { label: "تشخيص الأعطال" }]} />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={refresh}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm">
              <RefreshCcw className="h-4 w-4" /> تحديث
            </button>
            <button type="button" onClick={copyAll}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm">
              <Copy className="h-4 w-4" /> نسخ الكل
            </button>
            <button type="button"
              onClick={() => { clearCrashReports(); setReports([]); setNote("تم مسح السجل."); }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm text-muted-foreground">
              <Trash2 className="h-4 w-4" /> مسح السجل
            </button>
            <button type="button"
              onClick={() => {
                const cleared = resetNavigationState();
                setNote(`تم مسح ${cleared.length} مفتاحًا مؤقتًا للتنقل.`);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> إعادة ضبط حالة التنقل
            </button>
          </div>

          {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}

          {reports.length === 0 ? (
            <p className="mt-8 text-sm text-muted-foreground">لا توجد أعطال مسجّلة على هذا الجهاز.</p>
          ) : (
            <div className="mt-6 space-y-4">
              {reports.map((r, i) => (
                <details key={`${r.at}-${i}`} open={i === 0}
                  className="rounded-xl border border-input bg-muted/20 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    {r.name}: {r.message.slice(0, 90)}
                  </summary>
                  <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    <span>الوقت: {r.at}</span>
                    <span>الوجهة: {r.targetRoute}</span>
                    <span>آخر مسار ناجح: {r.lastSuccessfulRoute || "—"}</span>
                    <span>الحدود: {r.boundary}</span>
                    <span>الحالة: {r.authState} · {r.online ? "متصل" : "غير متصل"}</span>
                  </div>
                  <pre dir="ltr"
                    className="mt-2 max-h-72 overflow-auto rounded-lg bg-background/60 p-2 text-left text-[10px] leading-relaxed text-muted-foreground">
                    {formatCrashReport(r)}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </Screen>
      </AppShell>
    </AdminGate>
  );
}
