// Phase 2.5 — Admin: bulk JSON import for atlas_entities.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Upload, RefreshCw, CheckCircle2, AlertTriangle, SkipForward } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  parseBatch,
  runImportBatch,
  fetchCoverage,
  type ImportBatch,
  type ImportSummary,
  type CoverageRow,
} from "@/lib/atlas-import";

export const Route = createFileRoute("/admin/atlas-import")({
  head: () => ({
    meta: [
      { title: "استيراد كيانات الأطلس — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminAtlasImportPage />
    </AdminGate>
  ),
});

const BUNDLED_BATCHES = [
  { id: "01-cities-priority", label: "Batch 1 — Cities (30)", path: "/data/atlas/imports/01-cities-priority.json" },
  { id: "02-battles-priority", label: "Batch 2 — Battles (25)", path: "/data/atlas/imports/02-battles-priority.json" },
  { id: "03-landmarks-priority", label: "Batch 3 — Landmarks (20)", path: "/data/atlas/imports/03-landmarks-priority.json" },
  { id: "04-states-completion", label: "Batch 4 — States (18)", path: "/data/atlas/imports/04-states-completion.json" },
];

function AdminAtlasImportPage() {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [rawText, setRawText] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadCoverage = async () => {
    try {
      setCoverage(await fetchCoverage());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => { reloadCoverage(); }, []);

  const loadBundled = async (path: string) => {
    setError(null); setSummary(null);
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setRawText(text);
      setBatch(parseBatch(text));
    } catch (e) {
      setError((e as Error).message);
      setBatch(null);
    }
  };

  const onFile = async (f: File) => {
    setError(null); setSummary(null);
    try {
      const text = await f.text();
      setRawText(text);
      setBatch(parseBatch(text));
    } catch (e) {
      setError((e as Error).message);
      setBatch(null);
    }
  };

  const onRun = async (dryRun: boolean) => {
    if (!batch) return;
    setBusy(true); setError(null);
    try {
      const s = await runImportBatch(batch, { dryRun });
      setSummary(s);
      if (!dryRun) await reloadCoverage();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Upload className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-xl font-bold text-amber-100">استيراد كيانات الأطلس (Phase 2.5)</h1>
            <p className="text-xs text-slate-400">
              الصفوف المستوردة تُحفظ كـ <code className="text-amber-300">status=review</code> و
              <code className="text-amber-300"> aps_verified=false</code> ولا تظهر للاعبين حتى المراجعة اليدوية.
            </p>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
        )}

        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-200">تغطية الأطلس الحالية</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-amber-300/80">
                <tr><th className="px-2 py-1 text-right">النوع</th><th>الإجمالي</th><th>منشور</th><th>مراجعة</th><th>مسودة</th><th>موثّق APS</th></tr>
              </thead>
              <tbody>
                {coverage.map((r) => (
                  <tr key={r.kind} className="border-t border-slate-800">
                    <td className="px-2 py-1 text-right font-mono">{r.kind}</td>
                    <td className="text-center">{r.total}</td>
                    <td className="text-center text-emerald-300">{r.published}</td>
                    <td className="text-center text-amber-300">{r.review}</td>
                    <td className="text-center text-slate-400">{r.draft}</td>
                    <td className="text-center text-sky-300">{r.verified}</td>
                  </tr>
                ))}
                {coverage.length === 0 && (
                  <tr><td colSpan={6} className="py-3 text-center text-slate-500">…</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <button onClick={reloadCoverage} className="mt-2 inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200">
            <RefreshCw className="h-3 w-3" /> تحديث
          </button>
        </section>

        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-200">دفعات جاهزة</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {BUNDLED_BATCHES.map((b) => (
              <button
                key={b.id}
                onClick={() => loadBundled(b.path)}
                className="rounded-md border border-amber-500/30 bg-slate-950/40 px-3 py-2 text-right text-sm text-amber-100 hover:border-amber-400"
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3">
            <label className="block text-xs text-slate-400">أو ارفع ملف JSON يدويًا</label>
            <input
              type="file"
              accept="application/json"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="mt-1 text-xs text-slate-300"
            />
          </div>
        </section>

        {batch && (
          <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-amber-200">دفعة محمّلة: <span className="font-mono">{batch.batch}</span></div>
                <div className="text-xs text-slate-400">
                  النوع الافتراضي: <code className="text-amber-300">{batch.default_kind}</code> · عدد الصفوف: {batch.entities.length}
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => onRun(true)} className="rounded-md border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50">
                  محاكاة (Dry-run)
                </button>
                <button disabled={busy} onClick={() => onRun(false)} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
                  تنفيذ الاستيراد
                </button>
              </div>
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400">عرض JSON</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950/60 p-2 text-[11px] text-slate-300">{rawText}</pre>
            </details>
          </section>
        )}

        {summary && (
          <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-200">نتيجة الاستيراد</h2>
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <Pill icon={<CheckCircle2 className="h-3 w-3" />} color="emerald" label={`إدراج: ${summary.inserted}`} />
              <Pill icon={<SkipForward className="h-3 w-3" />} color="slate" label={`تخطّي: ${summary.skipped}`} />
              <Pill icon={<AlertTriangle className="h-3 w-3" />} color="red" label={`فشل: ${summary.failed}`} />
              <span className="text-slate-400">من إجمالي {summary.total}</span>
            </div>
            <div className="max-h-64 overflow-auto rounded border border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-950/60 text-amber-300/80">
                  <tr><th className="px-2 py-1 text-right">الـ slug</th><th>الحالة</th><th className="text-right">السبب</th></tr>
                </thead>
                <tbody>
                  {summary.rows.map((r) => (
                    <tr key={r.slug} className="border-t border-slate-800">
                      <td className="px-2 py-1 text-right font-mono">{r.slug}</td>
                      <td className={`text-center ${r.status === "inserted" ? "text-emerald-300" : r.status === "skipped" ? "text-slate-400" : "text-red-300"}`}>{r.status}</td>
                      <td className="px-2 py-1 text-right text-slate-400">{r.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Pill({ icon, color, label }: { icon: React.ReactNode; color: "emerald" | "slate" | "red"; label: string }) {
  const cls = color === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : color === "red"
    ? "border-red-500/40 bg-red-500/10 text-red-200"
    : "border-slate-500/40 bg-slate-500/10 text-slate-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 ${cls}`}>
      {icon}{label}
    </span>
  );
}
