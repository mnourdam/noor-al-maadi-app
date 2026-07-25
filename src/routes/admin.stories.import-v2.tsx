// ============================================================
// /admin/stories/import-v2 — M4 Preview / Apply console
// ------------------------------------------------------------
// Two-stage flow enforced by the M4 RPCs:
//   1) Preview  — never writes, reports create/update/unchanged/
//                 conflict/invalid per story plus planned deletes.
//   2) Apply    — transactional; re-validates internally and aborts
//                 the whole batch with zero writes on any issue.
//                 Stories whose canonical shape already matches the
//                 DB are skipped (action:'unchanged') so re-importing
//                 an unchanged bundle produces no row changes.
// Export button downloads the deterministic v2 envelope.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, Upload, PlayCircle, ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminExportStoriesV2,
  adminImportStoriesV2Preview,
  adminImportStoriesV2Apply,
  canonicalJsonBytes,
  type StoryExportEnvelopeV2,
  type StoryImportPreviewReportV2,
  type StoryImportApplyResultV2,
} from "@/lib/stories/import-v2";

export const Route = createFileRoute("/admin/stories/import-v2")({
  head: () => ({
    meta: [
      { title: "استيراد/تصدير القصص v2 — إرث" },
      { name: "description", content: "خط أنابيب استيراد/تصدير القصص v2." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <ImportV2Page />
    </AdminGate>
  ),
});

type Toast = { kind: "ok" | "err"; msg: string };

function ImportV2Page() {
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<StoryImportPreviewReportV2 | null>(null);
  const [applyResult, setApplyResult] = useState<StoryImportApplyResultV2 | null>(null);
  const [allowDeletes, setAllowDeletes] = useState(false);
  const [clearMedia, setClearMedia] = useState(false);
  const [busy, setBusy] = useState<null | "export" | "preview" | "apply">(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const totals = useMemo(() => preview?.totals ?? null, [preview]);
  const options = useMemo(
    () => ({ allow_deletes: allowDeletes, clear_media: clearMedia }),
    [allowDeletes, clearMedia],
  );


  const onExport = async () => {
    setBusy("export");
    try {
      const bundle = await adminExportStoriesV2(null);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `irth-stories-v2-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("ok", `تم تصدير ${bundle.stories.length} قصة. (بايتات ثابتة: ${canonicalJsonBytes(bundle).length})`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as StoryExportEnvelopeV2;
      if ((parsed as { envelope_version?: number }).envelope_version !== 2) {
        throw new Error("envelope_version must be 2");
      }
      setPayload(parsed);
      setPreview(null);
      setApplyResult(null);
      notify("ok", "تم تحميل الحزمة. اضغط معاينة.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  };

  const onPreview = async () => {
    if (!payload) { notify("err", "حمّل ملف JSON أولاً."); return; }
    setBusy("preview");
    try {
      const rep = await adminImportStoriesV2Preview(payload, { allow_deletes: allowDeletes });
      setPreview(rep);
      setApplyResult(null);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onApply = async () => {
    if (!payload) return;
    if (!preview?.ok) { notify("err", "لا يمكن التطبيق قبل معاينة ناجحة."); return; }
    setBusy("apply");
    try {
      const res = await adminImportStoriesV2Apply(payload, { allow_deletes: allowDeletes });
      setApplyResult(res);
      if (res.ok) {
        notify("ok",
          `تم: أُنشئت ${res.totals.created} / حُدِّثت ${res.totals.updated} / بلا تغيير ${res.totals.unchanged}.`);
      } else {
        notify("err", "فشل التحقق قبل الكتابة. لم تُكتب أي بيانات.");
      }
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-5xl p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">استيراد/تصدير القصص (v2)</h1>
        </div>
        <Link to="/admin/stories" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" /> رجوع للقصص
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onExport}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50">
          <Download className="h-4 w-4" /> تصدير الكل (v2)
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
          <Upload className="h-4 w-4" /> اختيار ملف JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={allowDeletes} onChange={(e) => setAllowDeletes(e.target.checked)} />
          السماح بحذف المشاهد/العلاقات/المصادر الزائدة
        </label>
        <button
          onClick={onPreview}
          disabled={!payload || busy !== null}
          className="ml-auto inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          معاينة
        </button>
        <button
          onClick={onApply}
          disabled={!preview?.ok || busy !== null}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-sm disabled:opacity-50">
          <PlayCircle className="h-4 w-4" /> تطبيق (Transactional)
        </button>
      </div>

      {toast && (
        <div className={`rounded-md border p-2 text-sm ${
          toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}>{toast.msg}</div>
      )}

      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["create","update","unchanged","conflict","invalid"] as const).map((k) => (
            <div key={k} className="rounded-md border p-2 text-sm">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-lg font-semibold">{totals[k]}</div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="rounded-md border p-2 text-sm">
          <div className="flex items-center gap-2">
            {preview.ok
              ? <ShieldCheck className="h-4 w-4 text-emerald-500" />
              : <AlertTriangle className="h-4 w-4 text-destructive" />}
            <span>{preview.ok ? "المعاينة نظيفة — التطبيق مسموح." : "لا يمكن التطبيق: يوجد عناصر غير صالحة أو متضاربة."}</span>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">تفاصيل ({preview.items.length})</summary>
            <div className="mt-2 max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-right p-1">ID</th><th className="text-right p-1">Kind</th><th className="text-right p-1">Scenes/Rel/Src</th><th className="text-right p-1">Deletes</th><th className="text-right p-1">Issues</th></tr>
                </thead>
                <tbody>
                  {preview.items.map((it) => (
                    <tr key={it.id ?? Math.random()} className="border-t">
                      <td className="p-1 font-mono">{it.id}</td>
                      <td className="p-1">{it.kind}</td>
                      <td className="p-1">{it.scene_count}/{it.relation_count}/{it.source_count}</td>
                      <td className="p-1 text-destructive">
                        {(it.scene_deletes.length + it.relation_deletes.length + it.source_deletes.length) || ""}
                      </td>
                      <td className="p-1">{it.issues.map((i) => i.code).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      {applyResult && (
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
          {JSON.stringify(applyResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
