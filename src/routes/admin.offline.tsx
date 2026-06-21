import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, HardDrive, Trash2, RefreshCw } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  generateAndStoreSnapshot,
  type ContentType,
} from "@/lib/offline-snapshot";
import {
  clearSnapshot,
  getSnapshotVersion,
  loadSnapshot,
} from "@/lib/offline-storage";

export const Route = createFileRoute("/admin/offline")({
  head: () => ({
    meta: [
      { title: "لقطة المحتوى دون اتصال — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <OfflinePanel />
    </AdminGate>
  ),
});

const TYPES: ContentType[] = [
  "encyclopedia",
  "campaigns",
  "investigations",
  "today_in_history",
  "daily_facts",
];

function OfflinePanel() {
  const [info, setInfo] = useState<{ version: number; generated_at: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [sizeKB, setSizeKB] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const v = await getSnapshotVersion();
    setInfo(v);
    const snap = await loadSnapshot();
    if (snap) {
      const c: Record<string, number> = {};
      for (const t of TYPES) c[t] = Array.isArray((snap as any)[t]) ? (snap as any)[t].length : 0;
      setCounts(c);
      setSizeKB(Math.round(JSON.stringify(snap).length / 1024));
    } else {
      setCounts(null);
      setSizeKB(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onExport() {
    setBusy(true);
    setMsg(null);
    try {
      const snap = await generateAndStoreSnapshot();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `irth-snapshot-v${snap.version}-${snap.generated_at.replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("تم إنشاء اللقطة وحفظها محليًا.");
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

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center gap-3 border-b border-amber-500/20 pb-4">
          <HardDrive className="h-7 w-7 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-amber-100">لقطة المحتوى دون اتصال</h1>
            <p className="text-sm text-slate-400">المرحلة 1 — بنية تحتية فقط. لا يؤثر على سلوك التطبيق الحالي.</p>
          </div>
        </header>

        <section className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-200">اللقطة المحلية الحالية</h2>
          {info ? (
            <div className="text-xs text-slate-300 space-y-1">
              <div>الإصدار: <span className="text-amber-200">{info.version}</span></div>
              <div>تاريخ التوليد: <span className="text-amber-200">{info.generated_at}</span></div>
              {sizeKB !== null && <div>الحجم التقديري: <span className="text-amber-200">{sizeKB} KB</span></div>}
              {counts && (
                <ul className="mt-2 grid grid-cols-2 gap-1">
                  {TYPES.map((t) => (
                    <li key={t} className="flex justify-between rounded border border-slate-700/50 px-2 py-1">
                      <span>{t}</span>
                      <span className="text-amber-200">{counts[t]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">لا توجد لقطة محلية بعد.</p>
          )}
        </section>

        <section className="flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> تصدير لقطة المحتوى
          </button>
          <button
            disabled={busy}
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
          <button
            disabled={busy || !info}
            onClick={onClear}
            className="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> مسح اللقطة المحلية
          </button>
        </section>

        {msg && <p className="text-xs text-amber-200">{msg}</p>}

        <section className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 text-xs leading-6 text-slate-400">
          <p className="font-semibold text-slate-300">شكل اللقطة:</p>
          <pre className="mt-2 overflow-x-auto text-[11px] text-slate-300">{`{
  "version": 1,
  "generated_at": "ISO-8601",
  "encyclopedia": [...],
  "campaigns": [...],
  "investigations": [...],
  "today_in_history": [...],
  "daily_facts": [...]
}`}</pre>
          <p className="mt-3">التخزين: IndexedDB (مع رجوع تلقائي إلى localStorage).</p>
        </section>
      </div>
    </div>
  );
}
