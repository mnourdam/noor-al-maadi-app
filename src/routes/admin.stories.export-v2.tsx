// ============================================================
// /admin/stories/export-v2 — dedicated Exporter page (M5).
// Delegates to the frozen M4 admin_export_stories_v2 RPC.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ArrowLeft, Loader2 } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminExportStoriesV2, canonicalJsonBytes, type StoryExportEnvelopeV2,
} from "@/lib/stories/import-v2";
import { adminListStories, type AdminStorySummary } from "@/lib/stories/admin";

export const Route = createFileRoute("/admin/stories/export-v2")({
  head: () => ({
    meta: [
      { title: "تصدير القصص (v2) — إرث" },
      { name: "description", content: "تصدير القصص كحزمة v2 قابلة للاستيراد." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (<AdminGate><ExportV2Page /></AdminGate>),
});

function ExportV2Page() {
  const [rows, setRows] = useState<AdminStorySummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setRows(await adminListStories()); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })();
  }, []);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(rows.map((r) => r.id)));
  const clear = () => setSelected(new Set());

  const doExport = async (ids: string[] | null) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const bundle: StoryExportEnvelopeV2 = await adminExportStoriesV2(ids);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = ids ? `subset-${ids.length}` : "all";
      a.href = url;
      a.download = `irth-stories-v2-${label}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`تم تصدير ${bundle.stories.length} قصة · بايتات ثابتة: ${canonicalJsonBytes(bundle).length}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">تصدير القصص (v2)</h1>
        <Link to="/admin/stories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" /> رجوع
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => void doExport(null)} disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          تصدير الكل
        </button>
        <button onClick={() => void doExport(Array.from(selected))}
          disabled={busy || selected.size === 0}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          <Download className="h-4 w-4" /> تصدير المحدد ({selected.size})
        </button>
        <button onClick={selectAll} className="rounded-md border px-2 py-1 text-xs">حدد الكل</button>
        <button onClick={clear} className="rounded-md border px-2 py-1 text-xs">مسح</button>
        <Link to="/admin/stories/import-v2" className="ml-auto text-xs text-primary underline">استيراد v2 →</Link>
      </div>

      {msg && <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700">{msg}</div>}
      {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{err}</div>}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="p-2 text-right">اختيار</th>
              <th className="p-2 text-right">العنوان</th>
              <th className="p-2 text-right">الحالة</th>
              <th className="p-2 text-right">المشاهد</th>
              <th className="p-2 text-right font-mono">ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2">{r.title_ar}</td>
                <td className="p-2 text-xs">{r.status}</td>
                <td className="p-2 text-xs">{r.scene_count}</td>
                <td className="p-2 font-mono text-[11px] text-muted-foreground">{r.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
