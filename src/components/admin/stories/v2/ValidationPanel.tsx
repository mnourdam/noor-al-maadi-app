// Stories M5 — Live validation panel. Consumes the M4
// admin_import_stories_v2_preview report as its only source of
// per-story issues. Never duplicates server rules.
import { ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";
import type { StoryImportPreviewReportV2 } from "@/lib/stories/import-v2";

export function ValidationPanel({
  running, preview, error, onValidate,
}: {
  running: boolean;
  preview: StoryImportPreviewReportV2 | null;
  error: string | null;
  onValidate: () => void;
}) {
  return (
    <section className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">التحقق المباشر (M4 preview)</div>
        <button
          onClick={onValidate}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          تحقق الآن
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {preview && (
        <div className="mt-2 space-y-2 text-xs">
          <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 ${
            preview.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700" : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}>
            {preview.ok ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {preview.ok ? "المعاينة نظيفة — يمكن الحفظ." : "توجد أخطاء تمنع الحفظ."}
          </div>
          {preview.items.map((it) => (
            <div key={it.id ?? "?"} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{it.kind}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{it.id}</span>
                <span className="text-[11px]">مشاهد {it.scene_count} · علاقات {it.relation_count} · مصادر {it.source_count}</span>
              </div>
              {it.issues.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-destructive">
                  {it.issues.map((iss, i) => (
                    <li key={i} className="font-mono text-[11px]">{JSON.stringify(iss)}</li>
                  ))}
                </ul>
              )}
              {(it.scene_deletes.length + it.relation_deletes.length + it.source_deletes.length) > 0 && (
                <div className="mt-1 text-amber-700 text-[11px]">
                  حذف مخطط: {it.scene_deletes.length} مشهد، {it.relation_deletes.length} علاقة، {it.source_deletes.length} مصدر.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!preview && !error && !running && (
        <div className="mt-2 text-xs text-muted-foreground">اضغط «تحقق الآن» لتشغيل M4 preview.</div>
      )}
    </section>
  );
}
