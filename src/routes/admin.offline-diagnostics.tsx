import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminGate } from "@/lib/admin-guard";
import { AlertTriangle, CheckCircle2, RefreshCw, Trash2, Wifi, WifiOff, Database, HardDrive, Image as ImageIcon, Inbox, User as UserIcon } from "lucide-react";
import {
  loadSnapshot,
  clearSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  type OfflineSnapshot,
  type OfflineCollectionKey,
} from "@/lib/offline-storage";
import {
  COLLECTIONS,
  REQUIRED_COLLECTION_KEYS,
  refreshSnapshotIncremental,
  generateAndStoreSnapshot,
} from "@/lib/offline-snapshot";
import { localSnapshotInfo, ensureLocalSnapshotLoaded, applyLocalSnapshot } from "@/lib/local-first-store";
import { supabase } from "@/integrations/supabase/client";
import { peekAll, type OutboxItem } from "@/lib/offline/outbox";
import { flushOutbox, getLastFlushAt } from "@/lib/offline/flush";
import { resetCompletion as resetCinematicOpening, readCompletedVersion as readCinematicOpeningVersion } from "@/lib/cinematic-opening/persistence";
import { TutorialDiagnosticsCard } from "@/components/admin/TutorialDiagnosticsCard";

export const Route = createFileRoute("/admin/offline-diagnostics")({
  head: () => ({
    meta: [
      { title: "تشخيص العمل دون اتصال — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AdminGate><OfflineDiagnostics /></AdminGate>,
});

const IMAGE_CACHE_NAME = "irth-images-v1";

type CacheStats = { count: number; approxBytes: number | null } | null;
type StorageStats = { usage: number; quota: number } | null;

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("ar-EG"); } catch { return iso; }
}

async function readImageCacheStats(): Promise<CacheStats> {
  try {
    if (typeof caches === "undefined") return { count: 0, approxBytes: null };
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    let bytes = 0;
    let measured = 0;
    // Sample up to 50 entries to approximate size without stalling.
    const sample = keys.slice(0, 50);
    for (const req of sample) {
      try {
        const res = await cache.match(req);
        if (!res) continue;
        const cl = res.headers.get("content-length");
        if (cl) { bytes += Number(cl); measured++; continue; }
        const blob = await res.clone().blob();
        bytes += blob.size; measured++;
      } catch { /* ignore */ }
    }
    const approx = measured > 0 ? Math.round((bytes / measured) * keys.length) : null;
    return { count: keys.length, approxBytes: approx };
  } catch { return null; }
}

async function readStorageStats(): Promise<StorageStats> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch { return null; }
}

async function clearImageCache(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    await caches.delete(IMAGE_CACHE_NAME);
  } catch { /* ignore */ }
}

function OfflineDiagnostics() {
  const [snap, setSnap] = useState<OfflineSnapshot | null>(null);
  const [localInfo, setLocalInfo] = useState<ReturnType<typeof localSnapshotInfo>>(null);
  const [imgStats, setImgStats] = useState<CacheStats>(null);
  const [storage, setStorage] = useState<StorageStats>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [scopedUid, setScopedUid] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number>(0);

  const appendLog = (msg: string) =>
    setLog((prev) => [`[${new Date().toLocaleTimeString("ar-EG")}] ${msg}`, ...prev].slice(0, 20));

  const refresh = useCallback(async () => {
    const [s, ic, st, sess] = await Promise.all([
      loadSnapshot(),
      readImageCacheStats(),
      readStorageStats(),
      supabase.auth.getSession(),
    ]);
    setSnap(s);
    setImgStats(ic);
    setStorage(st);
    setLocalInfo(localSnapshotInfo());
    const uid = sess.data.session?.user?.id ?? null;
    setScopedUid(uid);
    setOutbox(uid ? await peekAll(uid) : []);
    setLastSyncAt(getLastFlushAt());
  }, []);

  useEffect(() => {
    void refresh();
    const onOn = () => { setOnline(true); void refresh(); };
    const onOff = () => setOnline(false);
    const onOutbox = () => { void refresh(); };
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    window.addEventListener("irth:outbox:changed", onOutbox);
    window.addEventListener("irth:outbox:flushed", onOutbox);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("irth:outbox:changed", onOutbox);
      window.removeEventListener("irth:outbox:flushed", onOutbox);
    };
  }, [refresh]);

  const syncProgress = async () => {
    if (!scopedUid) { appendLog("لا يوجد مستخدم مسجّل — لا يمكن المزامنة."); return; }
    setBusy("progress");
    appendLog(`بدء مزامنة تقدّم اللاعب لـ ${scopedUid.slice(0, 8)}…`);
    try {
      const res = await flushOutbox(scopedUid);
      appendLog(`تمت المزامنة: نجح ${res.flushed}، فشل ${res.failed}.`);
      await refresh();
    } catch (e: any) {
      appendLog(`فشلت المزامنة: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };


  const source: string = (() => {
    if (!snap) return online ? "Supabase (لا يوجد كاش محلي)" : "لا يوجد مصدر متاح";
    if (snap.source === "bundled") return "Bundled Snapshot (المرفق مع التطبيق)";
    return "IndexedDB (Cache محلي)";
  })();

  const requiredMissing: OfflineCollectionKey[] = REQUIRED_COLLECTION_KEYS.filter(
    (k) => !snap || !(snap.content_counts?.[k] > 0),
  );

  const runIncremental = async () => {
    setBusy("incremental");
    appendLog("بدء المزامنة التزايدية…");
    try {
      const next = await refreshSnapshotIncremental();
      applyLocalSnapshot(next);
      appendLog(`اكتملت المزامنة التزايدية (نسخة ${next.snapshot_version}).`);
      await refresh();
    } catch (e: any) {
      appendLog(`فشلت المزامنة: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };

  const runFull = async () => {
    setBusy("full");
    appendLog("بدء المزامنة الكاملة…");
    try {
      const next = await generateAndStoreSnapshot();
      applyLocalSnapshot(next);
      appendLog(`اكتملت المزامنة الكاملة (نسخة ${next.snapshot_version}).`);
      await refresh();
    } catch (e: any) {
      appendLog(`فشلت المزامنة الكاملة: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };

  const clearAll = async () => {
    if (!confirm("سيتم حذف الـ Offline Snapshot و Image Cache بالكامل. متابعة؟")) return;
    setBusy("clear");
    appendLog("جارٍ مسح الكاش المحلي…");
    try {
      await clearSnapshot();
      await clearImageCache();
      applyLocalSnapshot(null);
      await ensureLocalSnapshotLoaded();
      appendLog("تم مسح الكاش. أعد تحميل الصفحة إذا لزم.");
      await refresh();
    } catch (e: any) {
      appendLog(`فشل المسح: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <Database className="h-7 w-7 text-amber-400" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-amber-100">تشخيص العمل دون اتصال</h1>
            <p className="text-sm text-slate-400">أداة تطويرية للتحقق من الكاش المحلي والمزامنة (APK / Web)</p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
          >
            تحديث
          </button>
        </header>

        {/* Status grid */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <StatBox
            icon={online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-rose-400" />}
            label="حالة الاتصال"
            value={online ? "متصل" : "غير متصل"}
            tone={online ? "ok" : "warn"}
          />
          <StatBox
            icon={<Database className="h-4 w-4 text-amber-300" />}
            label="مصدر البيانات الحالي"
            value={source}
          />
          <StatBox
            icon={<RefreshCw className="h-4 w-4 text-amber-300" />}
            label="آخر مزامنة ناجحة"
            value={fmtDate(snap?.generated_at)}
          />
          <StatBox
            icon={<HardDrive className="h-4 w-4 text-amber-300" />}
            label="نسخة الـ Snapshot"
            value={snap ? `v${snap.snapshot_version} (schema ${snap.schema_version}/${SNAPSHOT_SCHEMA_VERSION})` : "—"}
          />
        </section>

        {/* Required warnings */}
        {requiredMissing.length > 0 && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-rose-200">
              <AlertTriangle className="h-4 w-4" />
              <h2 className="text-sm font-semibold">مجموعات مطلوبة مفقودة أو فارغة</h2>
            </div>
            <ul className="list-disc pr-5 text-xs text-rose-100/90">
              {requiredMissing.map((k) => {
                const def = COLLECTIONS.find((c) => c.key === k);
                return <li key={k}>{def?.label ?? k} <span className="text-rose-300/70">({k})</span></li>;
              })}
            </ul>
            <p className="mt-2 text-xs text-rose-200/80">
              التطبيق يحتاج اتصالاً بالإنترنت مرة واحدة على الأقل لتحميل هذه المجموعات.
            </p>
          </div>
        )}

        {/* Collections table */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-amber-200">المجموعات المخزّنة</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-slate-700 text-xs text-slate-400">
                <tr>
                  <th className="py-2">المجموعة</th>
                  <th>المفتاح</th>
                  <th>العدد</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {COLLECTIONS.map((c) => {
                  const count = snap?.content_counts?.[c.key] ?? 0;
                  const missing = c.required && count === 0;
                  return (
                    <tr key={c.key} className="border-b border-slate-800/70">
                      <td className="py-2 text-slate-100">{c.label}{c.required && <span className="mr-1 text-[10px] text-amber-300">*مطلوبة</span>}</td>
                      <td className="text-xs text-slate-400">{c.key}</td>
                      <td className="tabular-nums text-slate-100">{count.toLocaleString("ar-EG")}</td>
                      <td>
                        {missing ? (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-300"><AlertTriangle className="h-3 w-3" /> مفقودة</span>
                        ) : count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3 w-3" /> جاهزة</span>
                        ) : (
                          <span className="text-xs text-slate-400">فارغة</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {localInfo && (
            <p className="mt-3 text-xs text-slate-400">
              الذاكرة الحيّة (local-first store): نسخة v{localInfo.snapshot_version} — مصدر {localInfo.source ?? "غير محدد"} — تاريخ {fmtDate(localInfo.generated_at)}
            </p>
          )}
        </section>

        {/* Image cache + storage */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-amber-200">
              <ImageIcon className="h-4 w-4" />
              <h2 className="text-sm font-semibold">كاش الصور</h2>
            </div>
            <p className="text-xs text-slate-300">
              العدد: <span className="tabular-nums text-slate-100">{imgStats?.count?.toLocaleString("ar-EG") ?? "—"}</span>
            </p>
            <p className="text-xs text-slate-300">
              الحجم التقريبي: <span className="tabular-nums text-slate-100">{fmtBytes(imgStats?.approxBytes ?? null)}</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-amber-200">
              <HardDrive className="h-4 w-4" />
              <h2 className="text-sm font-semibold">استخدام تخزين الجهاز</h2>
            </div>
            {storage ? (
              <>
                <p className="text-xs text-slate-300">
                  المستخدم: <span className="tabular-nums text-slate-100">{fmtBytes(storage.usage)}</span>
                  {" / "}
                  <span className="tabular-nums text-slate-400">{fmtBytes(storage.quota)}</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">غير متوفر على هذا الجهاز.</p>
            )}
          </div>
        </section>

        {/* Player-progress outbox */}
        <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center gap-2 text-amber-200">
            <Inbox className="h-4 w-4" />
            <h2 className="text-sm font-semibold">قائمة انتظار تقدّم اللاعب (Outbox)</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatBox
              icon={<UserIcon className="h-4 w-4 text-amber-300" />}
              label="المستخدم الحالي"
              value={scopedUid ? scopedUid.slice(0, 8) + "…" : "ضيف / غير مسجّل"}
            />
            <StatBox
              icon={<Inbox className="h-4 w-4 text-amber-300" />}
              label="عناصر معلّقة"
              value={String(outbox.length)}
              tone={outbox.length === 0 ? "ok" : undefined}
            />
            <StatBox
              icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}
              label="عناصر فشلت (≥3 محاولات)"
              value={String(outbox.filter((i) => i.attempts >= 3).length)}
              tone={outbox.some((i) => i.attempts >= 3) ? "warn" : "ok"}
            />
          </div>
          <p className="mt-3 text-xs text-slate-400">
            آخر مزامنة تقدّم ناجحة: {lastSyncAt ? fmtDate(new Date(lastSyncAt).toISOString()) : "—"}
          </p>
          {outbox.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-700 text-slate-400">
                  <tr>
                    <th className="py-1">النوع</th>
                    <th>المحاولات</th>
                    <th>آخر خطأ</th>
                    <th>تاريخ الإضافة</th>
                  </tr>
                </thead>
                <tbody>
                  {outbox.slice(0, 20).map((it) => (
                    <tr key={it.id} className="border-b border-slate-800/70">
                      <td className="py-1 font-mono text-slate-200">{it.kind}</td>
                      <td className="tabular-nums text-slate-100">{it.attempts}</td>
                      <td className="text-rose-300">{it.lastError ?? "—"}</td>
                      <td className="text-slate-400">{fmtDate(new Date(it.createdAt).toISOString())}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>


        {/* Actions */}
        <section className="flex flex-wrap gap-3">
          <button
            onClick={runIncremental}
            disabled={!!busy || !online}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {busy === "incremental" ? "جارٍ المزامنة…" : "تشغيل المزامنة التزايدية"}
          </button>
          <button
            onClick={runFull}
            disabled={!!busy || !online}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {busy === "full" ? "جارٍ التحميل…" : "إعادة توليد Snapshot كامل"}
          </button>
          <button
            onClick={clearAll}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {busy === "clear" ? "جارٍ المسح…" : "مسح الكاش دون الاتصال"}
          </button>
          <button
            onClick={syncProgress}
            disabled={!!busy || !online || !scopedUid}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            {busy === "progress" ? "جارٍ المزامنة…" : "مزامنة تقدّم اللاعب"}
          </button>
          {!online && (
            <span className="self-center text-xs text-slate-400">أزرار المزامنة معطّلة أثناء انقطاع الاتصال.</span>
          )}
        </section>

        {/* Cinematic Opening — developer replay */}
        <CinematicOpeningReset />

        {/* Guided Tutorial — admin diagnostics */}
        <TutorialDiagnosticsCard />





        {/* Log */}
        {log.length > 0 && (
          <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-amber-200">سجل العمليات</h2>
            <ul className="space-y-1 text-xs text-slate-300">
              {log.map((line, i) => <li key={i} className="font-mono">{line}</li>)}
            </ul>
          </section>
        )}

        <p className="text-center text-[11px] text-slate-500">
          هذه الصفحة للتطوير والاختبار فقط — غير مرئية للمستخدمين ولا مرتبطة من القوائم.
        </p>
      </div>
    </div>
  );
}

function StatBox({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "warn" }) {
  const border = tone === "warn" ? "border-rose-500/40" : tone === "ok" ? "border-emerald-500/40" : "border-slate-700";
  return (
    <div className={`rounded-xl border ${border} bg-slate-900/50 p-3`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
        {icon}<span>{label}</span>
      </div>
      <div className="text-sm text-slate-100">{value}</div>
    </div>
  );
}

function CinematicOpeningReset() {
  const [version, setVersion] = useState<string | null>(() => readCinematicOpeningVersion());
  const [notice, setNotice] = useState<string | null>(null);
  const onReset = () => {
    resetCinematicOpening();
    setVersion(readCinematicOpeningVersion());
    setNotice("تم مسح علامة اكتمال المقدمة السينمائية. ستُعرض عند إعادة تشغيل التطبيق.");
  };
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
      <h2 className="mb-2 text-sm font-semibold text-amber-200">المقدمة السينمائية (مطوّر فقط)</h2>
      <p className="mb-3 text-xs text-slate-400">
        الإصدار المُكتمل الحالي: <span className="font-mono text-slate-200">{version ?? "— (لم تُشاهد)"}</span>
      </p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-2 text-sm text-fuchsia-100 hover:bg-fuchsia-500/20"
      >
        <RefreshCw className="h-4 w-4" />
        إعادة تشغيل المقدمة السينمائية
      </button>
      {notice && <p className="mt-2 text-xs text-emerald-300">{notice}</p>}
      <p className="mt-2 text-[11px] text-slate-500">
        يمسح فقط <span className="font-mono">irth.cinematic-opening.completed-version.v1</span> — لا يؤثر على تقدّم اللاعب أو الحساب أو الجولة الإرشادية.
      </p>
    </section>
  );
}

