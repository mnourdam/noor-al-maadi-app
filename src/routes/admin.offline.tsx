import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, HardDrive, RefreshCw, Trash2 } from "lucide-react";
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
  generated_at: string;
  source?: string;
  content_counts: Record<string, number>;
  checksum?: string;
}

function OfflinePanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [bundledInfo, setBundledInfo] = useState<Info | null>(null);
  const [sizeKB, setSizeKB] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const v = await getSnapshotInfo();
    setInfo(v);
    const snap = await loadSnapshot();
    setSizeKB(snap ? Math.round(JSON.stringify(snap).length / 1024) : null);
    const bundled = await loadBundledSnapshot();
    setBundledInfo(
      bundled
        ? {
            snapshot_version: bundled.snapshot_version,
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
    setBusy(true); setMsg(null);
    try {
      const snap = await generateAndStoreSnapshot();
      setMsg(`تم توليد لقطة جديدة (${Object.values(snap.content_counts).reduce((a, b) => a + b, 0)} عنصرًا).`);
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

  async function onDownloadAndGenerate() {
    setBusy(true); setMsg(null);
    try {
      const snap = await generateAndStoreSnapshot();
      downloadSnapshot(snap);
      setMsg("تم توليد اللقطة وتنزيلها. ضع الملف في public/offline-snapshot.json قبل بناء APK.");
      await refresh();
    } catch (e: any) {
      setMsg("فشل التصدير: " + (e?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setBusy(true);
    await clearSnapshot();
    setMsg("تم مسح اللقطة المحلية.");
    await refresh();
    setBusy(false);
  }

  const requiredMissing = REQUIRED_COLLECTION_KEYS.filter(
    (k) => !info || (info.content_counts?.[k] ?? 0) === 0,
  );

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <HardDrive className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">مركز لقطة المحتوى دون اتصال</h1>
            <p className="text-sm text-slate-400">
              يولّد ملف JSON موثوقًا يضم المحتوى العام المنشور فقط، لاستخدامه داخل APK وعند انقطاع الاتصال.
            </p>
          </div>
        </header>

        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-200">اللقطة المخزّنة محليًا</h2>
          {info ? (
            <div className="text-xs text-slate-300 space-y-1">
              <div>إصدار المخطط: <span className="text-amber-200">v{info.snapshot_version}</span></div>
              <div>تاريخ التوليد: <span className="text-amber-200">{info.generated_at}</span></div>
              {info.source && <div>المصدر: <span className="text-amber-200">{info.source}</span></div>}
              {sizeKB !== null && <div>الحجم التقديري: <span className="text-amber-200">{sizeKB} KB</span></div>}
              {info.checksum && <div className="break-all">checksum: <span className="text-amber-200">{info.checksum.slice(0, 24)}…</span></div>}
            </div>
          ) : (
            <p className="text-xs text-slate-400">لا توجد لقطة محلية بعد. اضغط «توليد» لإنشاء واحدة من Supabase.</p>
          )}
        </section>

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
                    {missing ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    <span className="text-slate-200">{c.label}</span>
                    {required && <span className="text-[10px] text-amber-300">مطلوب</span>}
                  </div>
                  <span className="text-amber-200 font-mono">{count}</span>
                </li>
              );
            })}
          </ul>
          {requiredMissing.length > 0 && (
            <p className="mt-3 text-xs text-red-300">
              ⚠️ مجموعات مطلوبة فارغة: {requiredMissing.join(", ")}. ولّد اللقطة من جديد للتأكد من توفر المحتوى الأساسي.
            </p>
          )}
        </section>

        <section className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> توليد لقطة
          </button>
          <button disabled={busy} onClick={onDownloadAndGenerate}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
            <Download className="h-4 w-4" /> توليد + تنزيل JSON
          </button>
          <button disabled={busy || !info} onClick={onDownloadLocal}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
            <Download className="h-4 w-4" /> تنزيل اللقطة المحلية
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

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-xs leading-6 text-slate-300 space-y-2">
          <p className="font-semibold text-slate-100">اللقطة المضمّنة في الـ APK</p>
          {bundledInfo ? (
            <div className="space-y-0.5">
              <div>v{bundledInfo.snapshot_version} — {bundledInfo.generated_at}</div>
              <div>المجموع: {Object.values(bundledInfo.content_counts).reduce((a, b) => a + b, 0)} عنصرًا</div>
            </div>
          ) : (
            <p className="text-slate-400">
              لم يتم العثور على <code>public/offline-snapshot.json</code>. بعد توليد + تنزيل، استبدل الملف داخل المستودع قبل بناء APK.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-xs leading-6 text-slate-400">
          <p className="font-semibold text-slate-200">قواعد المحتوى</p>
          <ul className="mt-1 list-disc pr-5 space-y-1">
            <li>Supabase هو المصدر الموثوق عند الاتصال.</li>
            <li>عند فقد الاتصال يقرأ التطبيق من الكاش المحلي، ثم من اللقطة المضمّنة.</li>
            <li>تشمل اللقطة المحتوى المنشور والمتاح للاعب فقط — لا مسودات، لا مستخدمين، لا إحالات، لا سجلات إدارية.</li>
            <li>تقدّم اللاعب يبقى محلي-أوّلاً ويُزامن لاحقًا عند الاتصال.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
