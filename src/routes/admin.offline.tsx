import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  COLLECTIONS,
  REQUIRED_COLLECTION_KEYS,
  generateAndStoreSnapshot,
  loadBundledSnapshot,
} from "@/lib/offline-snapshot";
import {
  clearSnapshot,
  getSnapshotInfo,
  loadSnapshot,
  type OfflineSnapshot,
} from "@/lib/offline-storage";
import {
  validateSnapshot,
  type ValidationReport,
} from "@/lib/offline-snapshot-validate";

export const Route = createFileRoute("/admin/offline")({
  head: () => ({
    meta: [
      { title: "مركز لقطة المحتوى دون اتصال — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <OfflinePanel />
    </AdminGate>
  ),
});

interface Info {
  snapshot_version: number;
  schema_version?: number;
  generated_at: string;
  source?: string;
  content_counts: Record<string, number>;
  checksum?: string;
}

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function ageLabel(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!t) return "—";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 48) return `قبل ${h} ساعة`;
  return `قبل ${Math.round(h / 24)} يومًا`;
}

const MUSEUM_ENTITY_TYPES = new Set([
  "figure", "artifact", "landmark", "city", "battle", "event",
]);

function OfflinePanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [bundledInfo, setBundledInfo] = useState<Info | null>(null);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [museumCount, setMuseumCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [wroteBundled, setWroteBundled] = useState<boolean | null>(null);

  async function refresh() {
    const v = await getSnapshotInfo();
    setInfo(v);
    const snap = await loadSnapshot();
    setSizeBytes(snap ? new Blob([JSON.stringify(snap)]).size : null);
    const enc = (snap?.collections?.encyclopedia_entities ?? []) as Array<{ entity_type?: string }>;
    setMuseumCount(enc.filter((e) => MUSEUM_ENTITY_TYPES.has(String(e?.entity_type))).length);
    const bundled = await loadBundledSnapshot();
    setBundledInfo(
      bundled
        ? {
            snapshot_version: bundled.snapshot_version,
            schema_version: bundled.schema_version,
            generated_at: bundled.generated_at,
            source: "bundled",
            content_counts: bundled.content_counts ?? {},
            checksum: bundled.checksum,
          }
        : null,
    );
  }

  useEffect(() => { void refresh(); }, []);

  function downloadSnapshot(snap: OfflineSnapshot) {
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offline-snapshot.v${snap.snapshot_version}.${snap.generated_at.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onGenerate() {
    setBusy(true); setMsg(null); setWroteBundled(null);
    try {
      const snap = await generateAndStoreSnapshot();
      // Check whether the bundled file on disk was actually overwritten.
      const bundled = await loadBundledSnapshot();
      const wrote = !!bundled && bundled.snapshot_version === snap.snapshot_version;
      setWroteBundled(wrote);
      setMsg(
        wrote
          ? `تم توليد لقطة جديدة (${Object.values(snap.content_counts).reduce((a, b) => a + b, 0)} عنصرًا) وتحديث الملف المضمّن.`
          : `تم توليد اللقطة محليًا. الملف المضمّن لم يُكتب (متاح فقط أثناء التطوير). نزّل الـ JSON ثم استبدله يدويًا.`,
      );
      await refresh();
    } catch (e: any) {
      setMsg("فشل التوليد: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadLocal() {
    const snap = await loadSnapshot();
    if (!snap) { setMsg("لا توجد لقطة محلية لتنزيلها."); return; }
    downloadSnapshot(snap);
  }

  async function onValidate() {
    setBusy(true); setMsg(null);
    try {
      const snap = await loadSnapshot();
      setReport(validateSnapshot(snap));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    await clearSnapshot();
    setMsg("تم مسح اللقطة المحلية.");
    setReport(null);
    await refresh();
    setBusy(false);
  }

  const requiredMissing = REQUIRED_COLLECTION_KEYS.filter(
    (k) => !info || (info.content_counts?.[k] ?? 0) === 0,
  );

  const totals = info?.content_counts ?? {};
  const totalAll = Object.values(totals).reduce((a, b) => a + b, 0);

  // Bundled vs local comparison.
  let bundledStatus: "same" | "older" | "newer" | "missing" | "no-local" = "missing";
  if (!bundledInfo) bundledStatus = "missing";
  else if (!info) bundledStatus = "no-local";
  else if (bundledInfo.snapshot_version === info.snapshot_version) bundledStatus = "same";
  else if (bundledInfo.snapshot_version < info.snapshot_version) bundledStatus = "older";
  else bundledStatus = "newer";

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <HardDrive className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">مركز لقطة المحتوى دون اتصال</h1>
            <p className="text-sm text-slate-400">
              يولّد ملف JSON موثوقًا، يكتب فوق الملف المضمّن أثناء التطوير، ويتحقّق من سلامة المحتوى قبل بناء APK.
            </p>
          </div>
        </header>

        {/* Local snapshot metadata */}
        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-amber-200">اللقطة المخزّنة محليًا</h2>
          {info ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <Stat label="snapshot_version" value={String(info.snapshot_version)} />
                <Stat label="schema_version" value={String(info.schema_version ?? "—")} />
                <Stat label="generated_at" value={info.generated_at} />
                <Stat label="عمر اللقطة" value={ageLabel(info.generated_at)} />
                <Stat label="المصدر" value={info.source ?? "—"} />
                <Stat label="الحجم" value={fmtBytes(sizeBytes)} />
                <Stat label="checksum" value={info.checksum ? info.checksum.slice(0, 16) + "…" : "—"} className="col-span-2 break-all" />
              </div>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                <Total label="إجمالي العناصر" value={totalAll} accent />
                <Total label="الموسوعة" value={totals.encyclopedia_entities ?? 0} />
                <Total label="الحملات" value={totals.admin_campaigns ?? 0} />
                <Total label="أطلس (موثّق)" value={totals.atlas_entities ?? 0} />
                <Total label="التحقيقات" value={totals.investigations ?? 0} />
                <Total label="في مثل هذا اليوم" value={totals.today_in_history_events ?? 0} />
                <Total label="الحقيقة اليومية" value={totals.daily_facts ?? 0} />
                <Total label="سجل المتحف" value={totals.content_registry ?? 0} />
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">لا توجد لقطة محلية بعد. اضغط «توليد لقطة».</p>
          )}
          {requiredMissing.length > 0 && (
            <p className="text-xs text-red-300">
              ⚠️ مجموعات مطلوبة فارغة: {requiredMissing.join(", ")}.
            </p>
          )}
        </section>

        {/* Bundled snapshot status */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-xs text-slate-300 space-y-2">
          <h2 className="text-sm font-semibold text-amber-200">اللقطة المضمّنة في APK</h2>
          {bundledInfo ? (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="snapshot_version" value={String(bundledInfo.snapshot_version)} />
              <Stat label="schema_version" value={String(bundledInfo.schema_version ?? "—")} />
              <Stat label="generated_at" value={bundledInfo.generated_at} />
              <Stat label="عمر اللقطة" value={ageLabel(bundledInfo.generated_at)} />
              <Stat label="checksum" value={bundledInfo.checksum ? bundledInfo.checksum.slice(0, 16) + "…" : "—"} className="col-span-2 break-all" />
            </div>
          ) : (
            <p className="text-slate-400">لم يتم العثور على <code>public/offline-snapshot.json</code>.</p>
          )}
          <BundledComparison status={bundledStatus} />
          {wroteBundled === false && (
            <p className="text-amber-300">
              الملف المضمّن لم يُحدَّث تلقائيًا — هذه الميزة تعمل أثناء تشغيل dev server فقط. استخدم «تنزيل JSON» واستبدل الملف يدويًا.
            </p>
          )}
        </section>

        {/* Sections / collections list */}
        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold text-amber-200 mb-2">المجموعات المشمولة</h2>
          <ul className="space-y-1 text-xs">
            {COLLECTIONS.map((c) => {
              const count = info?.content_counts?.[c.key] ?? 0;
              const required = REQUIRED_COLLECTION_KEYS.includes(c.key);
              const missing = required && count === 0;
              return (
                <li key={c.key} className="flex items-center justify-between rounded border border-slate-700/50 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    {missing
                      ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                      : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    <span className="text-slate-200">{c.label}</span>
                    {required && <span className="text-[10px] text-amber-300">مطلوب</span>}
                  </div>
                  <span className="text-amber-200 font-mono">{count}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Actions */}
        <section className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> توليد لقطة (يكتب فوق المضمّن في dev)
          </button>
          <button disabled={busy || !info} onClick={onDownloadLocal}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
            <Download className="h-4 w-4" /> تنزيل JSON
          </button>
          <button disabled={busy || !info} onClick={onValidate}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50">
            <ShieldCheck className="h-4 w-4" /> التحقّق من اللقطة
          </button>
          <button disabled={busy} onClick={refresh}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button disabled={busy || !info} onClick={onClear}
            className="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> مسح المحلي
          </button>
        </section>

        {msg && <p className="text-xs text-amber-200">{msg}</p>}

        {/* Validation report */}
        {report && (
          <section className={`rounded-xl border p-4 text-xs space-y-2 ${
            report.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"
          }`}>
            <div className="flex items-center gap-2 text-sm">
              {report.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-red-400" />}
              <span className={report.ok ? "text-emerald-200" : "text-red-200"}>
                {report.ok ? "اللقطة سليمة." : `فشل التحقّق: ${report.errors} أخطاء، ${report.warnings} تحذيرات.`}
              </span>
            </div>
            {report.issues.length > 0 && (
              <ul className="space-y-1">
                {report.issues.map((i, idx) => (
                  <li key={idx} className={i.level === "error" ? "text-red-300" : "text-amber-300"}>
                    [{i.level}{i.collection ? `:${i.collection}` : ""}] {i.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-xs leading-6 text-slate-400">
          <p className="font-semibold text-slate-200">قواعد المحتوى</p>
          <ul className="mt-1 list-disc pr-5 space-y-1">
            <li>Supabase هو المصدر الموثوق عند الاتصال.</li>
            <li>عند فقد الاتصال يقرأ التطبيق من الكاش المحلي ثم من اللقطة المضمّنة.</li>
            <li>المحتوى المنشور والمتاح للاعب فقط — لا مسودات، لا مستخدمين، لا إحالات، لا سجلات إدارية.</li>
            <li>المخطّط الحالي جاهز لمزامنة دلتا مستقبلية عبر <code>collection_manifest[]</code> دون كسر الـ runtime.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded border border-slate-700/50 px-2 py-1 ${className}`}>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-amber-200 font-mono text-[11px]">{value}</div>
    </div>
  );
}

function Total({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex justify-between rounded border px-2 py-1 ${
      accent ? "border-amber-500/40 bg-amber-500/5" : "border-slate-700/50"
    }`}>
      <span>{label}</span>
      <span className={`font-mono ${accent ? "text-amber-200 font-semibold" : "text-amber-200"}`}>{value}</span>
    </div>
  );
}

function BundledComparison({ status }: { status: "same" | "older" | "newer" | "missing" | "no-local" }) {
  if (status === "missing") return null;
  if (status === "no-local") return <p className="text-slate-400">لا توجد لقطة محلية للمقارنة بعد.</p>;
  if (status === "same") return <p className="text-emerald-300">✓ اللقطة المضمّنة مطابقة للمحلية.</p>;
  if (status === "older") return <p className="text-amber-300">⚠ اللقطة المضمّنة أقدم من المحلية — أعد التوليد لتحديث الملف المضمّن.</p>;
  return <p className="text-amber-300">⚠ اللقطة المضمّنة أحدث من المحلية — يبدو أن المحلية قديمة، اضغط «تحديث» أو ولّد من جديد.</p>;
}
