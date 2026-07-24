// ============================================================
// /admin/stories — content-editor console
// ------------------------------------------------------------
// Editor-oriented UX: multi-select, safe bulk actions,
// JSON import/export, auto-slug from Arabic title, and a
// simplified "New Story" dialog that hides technical fields.
// All destructive/bulk RPCs go through public.is_content_editor().
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText, Plus, Pencil, ExternalLink, RefreshCw,
  CheckCircle2, AlertTriangle, X, Download, Upload, Trash2,
  Archive, RotateCcw, CheckSquare, Square, ChevronDown, Copy,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminListStories,
  adminUpsertStory,
  adminSetStoryStatus,
  adminDeleteStory,
  adminStoryDeleteImpact,
  adminSlugAvailable,
  adminExportStories,
  adminImportStoriesPreview,
  adminImportStoriesApply,
  type AdminStorySummary,
  type StoryDeleteImpact,
  type StoryImportPreview,
  type ImportApplyOptions,
} from "@/lib/stories/admin";
import type { StoryStatus } from "@/lib/stories/types";
import { suggestSlug, suggestStoryId } from "@/lib/stories/slug";

export const Route = createFileRoute("/admin/stories/")({
  head: () => ({
    meta: [
      { title: "إدارة القصص — إرث" },
      { name: "description", content: "لوحة إدارة قصص إرث." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <AdminStoriesPage />
    </AdminGate>
  ),
});

type Toast = { kind: "ok" | "err"; msg: string };
type FilterKey = "all" | StoryStatus | "test";

const STATUS_LABEL: Record<StoryStatus, string> = {
  draft: "مسودة",
  published: "منشورة",
  archived: "مؤرشفة",
};

const TEST_PREFIXES = ["p1e2e_", "pub_probe_", "draft_probe_", "test_", "probe_"];
const isTestStory = (id: string) => TEST_PREFIXES.some((p) => id.toLowerCase().startsWith(p));

function AdminStoriesPage() {
  const [rows, setRows] = useState<AdminStorySummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showIds, setShowIds] = useState(false);

  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3800);
  };

  const refresh = async () => {
    try {
      setErr(null);
      const data = await adminListStories();
      setRows(data);
      // Prune stale selection.
      setSelected((prev) => {
        const ids = new Set(data.map((r) => r.id));
        const next = new Set<string>();
        prev.forEach((id) => { if (ids.has(id)) next.add(id); });
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => {
    const list = rows ?? [];
    const needle = q.trim().toLowerCase();
    return list
      .filter((r) => {
        if (filter === "test") return isTestStory(r.id);
        return filter === "all" || r.status === filter;
      })
      .filter((r) =>
        !needle ||
        r.id.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        r.title_ar.toLowerCase().includes(needle) ||
        (r.title_en?.toLowerCase().includes(needle) ?? false),
      );
  }, [rows, filter, q]);

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const setStatus = async (r: AdminStorySummary, next: StoryStatus) => {
    try {
      const res = await adminSetStoryStatus(r.id, next);
      if (!res.ok) {
        if (res.reason === "validation_failed" && res.validation) {
          const first = res.validation.issues[0]?.message ?? "لا يمكن النشر.";
          notify("err", `فشل التحقق قبل النشر: ${first}`);
        } else {
          notify("err", res.reason ?? "تعذر تغيير الحالة.");
        }
        return;
      }
      notify("ok", `الحالة الآن: ${STATUS_LABEL[next]}.`);
      await refresh();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  };

  // ---- Bulk operations ----
  const bulkStatus = async (ids: string[], next: StoryStatus) => {
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        const r = await adminSetStoryStatus(id, next);
        if (r.ok) ok++; else fail++;
      } catch { fail++; }
    }
    notify(fail === 0 ? "ok" : "err",
      `تم تغيير الحالة: ${ok} — فشل: ${fail}`);
    await refresh();
  };

  const bulkExport = async (ids: string[] | null) => {
    try {
      const bundle = await adminExportStories(ids);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `irth-stories-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("ok", `تم تصدير ${(bundle.stories as unknown[]).length} قصة.`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  };

  const takenSlugs = useMemo(() => new Set((rows ?? []).map((r) => r.slug)), [rows]);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpenText className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">إدارة القصص</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> قصة جديدة
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary">
            <Upload className="h-4 w-4" /> استيراد JSON
          </button>
          <button onClick={() => void bulkExport(null)} className="btn-secondary">
            <Download className="h-4 w-4" /> تصدير الكل
          </button>
          <Link to="/admin/stories/import-v2" className="btn-secondary">
            <Upload className="h-4 w-4" /> استيراد v2
          </Link>
          <Link to="/admin/stories/export-v2" className="btn-secondary">
            <Download className="h-4 w-4" /> تصدير v2
          </Link>
          <button onClick={() => void refresh()} className="btn-secondary">
            <RefreshCw className="h-4 w-4" /> تحديث
          </button>
      </header>

      <style>{`
        .btn-primary{display:inline-flex;align-items:center;gap:.25rem;border-radius:.375rem;background:hsl(var(--primary));color:hsl(var(--primary-foreground));padding:.375rem .75rem;font-size:.875rem}
        .btn-primary:hover{opacity:.9}
        .btn-secondary{display:inline-flex;align-items:center;gap:.25rem;border:1px solid hsl(var(--border));border-radius:.375rem;padding:.375rem .75rem;font-size:.875rem;background:hsl(var(--background))}
        .btn-secondary:hover{background:hsl(var(--muted))}
        .btn-danger{display:inline-flex;align-items:center;gap:.25rem;border:1px solid hsl(var(--destructive)/.4);border-radius:.375rem;padding:.375rem .75rem;font-size:.875rem;color:hsl(var(--destructive))}
        .btn-danger:hover{background:hsl(var(--destructive)/.1)}
      `}</style>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "draft", "published", "archived", "test"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            {k === "all" ? "الكل"
              : k === "test" ? "قصص اختبار"
              : STATUS_LABEL[k as StoryStatus]}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالمعرف أو العنوان..."
          className="mr-auto rounded-md border bg-background px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />
          إظهار المعرفات
        </label>
      </div>

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} محددة
          </span>
          <button onClick={() => void bulkExport([...selected])} className="btn-secondary">
            <Download className="h-4 w-4" /> تصدير المحدد
          </button>
          <button onClick={() => void bulkStatus([...selected], "published")} className="btn-secondary">
            <CheckCircle2 className="h-4 w-4" /> نشر (يجب اجتياز التحقق)
          </button>
          <button onClick={() => void bulkStatus([...selected], "draft")} className="btn-secondary">
            <RotateCcw className="h-4 w-4" /> إرجاع لمسودة
          </button>
          <button onClick={() => void bulkStatus([...selected], "archived")} className="btn-secondary">
            <Archive className="h-4 w-4" /> أرشفة
          </button>
          <button onClick={() => setDeleteTarget([...selected])} className="btn-danger">
            <Trash2 className="h-4 w-4" /> حذف/أرشفة آمن
          </button>
          <button onClick={clearSelection} className="mr-auto text-xs text-muted-foreground hover:text-foreground">
            إلغاء التحديد
          </button>
        </div>
      )}

      {rows === null ? (
        <div className="text-sm text-muted-foreground">جاري التحميل...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          لا توجد قصص مطابقة.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="w-10 px-2 py-2">
                  <button onClick={toggleAllVisible} title="تحديد الكل المرئي">
                    {allVisibleSelected
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </th>
                <th className="px-3 py-2 text-right">العنوان</th>
                <th className="px-3 py-2 text-right">الرابط</th>
                {showIds && <th className="px-3 py-2 text-right">المعرف</th>}
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">المشاهد</th>
                <th className="px-3 py-2">آخر تحديث</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const isSel = selected.has(r.id);
                const isTest = isTestStory(r.id);
                return (
                  <tr key={r.id} className={`border-t ${isSel ? "bg-primary/5" : ""}`}>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => toggleOne(r.id)}>
                        {isSel
                          ? <CheckSquare className="h-4 w-4 text-primary" />
                          : <Square className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium flex items-center gap-1.5">
                        {r.title_ar}
                        {isTest && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700">
                            اختبار
                          </span>
                        )}
                      </div>
                      {r.title_en && <div className="text-xs text-muted-foreground">{r.title_en}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                    {showIds && (
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => { void navigator.clipboard?.writeText(r.id); notify("ok", "نُسخ المعرّف."); }}
                          title="نسخ المعرّف"
                        >
                          <Copy className="h-3 w-3" /> {r.id}
                        </button>
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          r.status === "published" ? "bg-emerald-500/15 text-emerald-600"
                          : r.status === "draft" ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{r.scene_count}</td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {new Date(r.updated_at).toLocaleDateString("ar")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Link
                          to="/admin/stories/$id/edit"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Pencil className="h-3.5 w-3.5" /> P3
                        </Link>
                        <Link
                          to="/admin/stories/v2/$id"
                          params={{ id: r.id }}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10"
                          title="محرر v2 (Contract v2 Core)"
                        >
                          <Pencil className="h-3.5 w-3.5" /> v2
                        </Link>
                        {r.status !== "published" ? (
                          <button
                            onClick={() => void setStatus(r, "published")}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> نشر
                          </button>
                        ) : (
                          <button
                            onClick={() => void setStatus(r, "draft")}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            إرجاع لمسودة
                          </button>
                        )}
                        {r.status !== "archived" && (
                          <button
                            onClick={() => void setStatus(r, "archived")}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                          >
                            أرشفة
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget([r.id])}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          title="حذف / أرشفة آمنة"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {r.status === "published" && (
                          <Link
                            to="/story/$id"
                            params={{ id: r.id }}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateStoryModal
          takenSlugs={takenSlugs}
          onClose={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            notify("ok", `تم إنشاء القصة.`);
            await refresh();
            void id;
          }}
          onError={(m) => notify("err", m)}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={async (n) => {
            setImportOpen(false);
            notify("ok", `تم استيراد ${n} قصة.`);
            await refresh();
          }}
          onError={(m) => notify("err", m)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          ids={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDone={async (msg) => {
            setDeleteTarget(null);
            notify("ok", msg);
            clearSelection();
            await refresh();
          }}
          onError={(m) => notify("err", m)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 left-4 z-50 flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------- Create Story --------------------
// Editor-first: only Arabic title + optional English title are required.
// Slug auto-generates via Arabic → Latin transliteration and stops
// tracking the title once the editor edits it manually.
// The stable ID is generated internally; hidden under Advanced.
function CreateStoryModal({
  takenSlugs, onClose, onCreated, onError,
}: {
  takenSlugs: Set<string>;
  onClose: () => void;
  onCreated: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [summaryAr, setSummaryAr] = useState("");
  const [world, setWorld] = useState("");
  const [era, setEra] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [id, setId] = useState("");
  const [idManual, setIdManual] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slugStatus, setSlugStatus] = useState<"idle" | "ok" | "taken" | "checking">("idle");

  // Auto-suggest slug + id while the editor types the Arabic title.
  useEffect(() => {
    if (!slugManual) {
      const base = suggestSlug(titleAr);
      let s = base;
      let n = 2;
      while (s && takenSlugs.has(s)) { s = `${base}-${n++}`; }
      setSlug(s);
    }
    if (!idManual) setId(suggestStoryId(titleAr));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleAr]);

  // Debounced server-side slug check.
  const checkRef = useRef<number | null>(null);
  useEffect(() => {
    if (!slug) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    if (checkRef.current) window.clearTimeout(checkRef.current);
    checkRef.current = window.setTimeout(async () => {
      try {
        const ok = await adminSlugAvailable(slug);
        setSlugStatus(ok ? "ok" : "taken");
      } catch { setSlugStatus("idle"); }
    }, 350);
    return () => { if (checkRef.current) window.clearTimeout(checkRef.current); };
  }, [slug]);

  const submit = async () => {
    if (busy) return;
    if (!titleAr.trim()) { onError("العنوان بالعربية مطلوب."); return; }
    if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug)) {
      onError("الرابط غير صالح — يُسمح بحروف صغيرة وأرقام وشرطات فقط.");
      return;
    }
    if (!id || !/^[a-z0-9_-]{3,80}$/.test(id)) {
      onError("المعرّف غير صالح.");
      return;
    }
    if (slugStatus === "taken") { onError("الرابط مستخدم بالفعل."); return; }
    setBusy(true);
    try {
      const row = await adminUpsertStory({
        id: id.trim(),
        slug: slug.trim(),
        title_ar: titleAr.trim(),
        title_en: titleEn.trim() || null,
        summary_ar: summaryAr.trim() || null,
        world_slug: world.trim() || null,
        era: era.trim() || null,
      });
      onCreated(row.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div dir="rtl" className="w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">قصة جديدة</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">
            العنوان بالعربية *
            <input
              autoFocus
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              placeholder="مثال: رحلة الهجرة"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            العنوان بالإنجليزية (اختياري)
            <input
              value={titleEn}
              onChange={(e) => setTitleEn(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            الرابط في العنوان (يُولَّد تلقائيًا)
            <div className="mt-1 flex items-center gap-2">
              <input
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                className="flex-1 rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
                placeholder="hijra"
              />
              {slugManual && (
                <button
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => { setSlugManual(false); setSlug(suggestSlug(titleAr)); }}
                >إعادة التوليد</button>
              )}
              <span className={`text-[11px] ${
                slugStatus === "ok" ? "text-emerald-600"
                : slugStatus === "taken" ? "text-destructive"
                : "text-muted-foreground"
              }`}>
                {slugStatus === "ok" ? "متاح" : slugStatus === "taken" ? "مستخدم" : slugStatus === "checking" ? "..." : ""}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              يُستخدم في الرابط فقط. المعرّف الداخلي مستقل ولا يتغيّر مع الرابط.
            </div>
          </label>
          <label className="block text-xs">
            ملخّص قصير (اختياري)
            <textarea
              value={summaryAr}
              onChange={(e) => setSummaryAr(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              العالم (اختياري)
              <input value={world} onChange={(e) => setWorld(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs">
              الحقبة (اختياري)
              <input value={era} onChange={(e) => setEra(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>

          <button
            onClick={() => setAdvanced(!advanced)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advanced ? "rotate-180" : ""}`} />
            خيارات متقدّمة
          </button>
          {advanced && (
            <label className="block text-xs">
              المعرّف الداخلي (نادرًا ما يحتاج التعديل)
              <input
                value={id}
                onChange={(e) => { setId(e.target.value); setIdManual(true); }}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
              />
            </label>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
          <button
            onClick={() => void submit()}
            disabled={busy || slugStatus === "taken"}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy ? "جاري الإنشاء..." : "إنشاء"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Delete / Archive --------------------
function DeleteModal({
  ids, onClose, onDone, onError,
}: {
  ids: string[];
  onClose: () => void;
  onDone: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [impact, setImpact] = useState<StoryDeleteImpact | null>(null);
  const [mode, setMode] = useState<"archive" | "hard">("archive");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);

  useEffect(() => {
    (async () => {
      try { setImpact(await adminStoryDeleteImpact(ids)); }
      catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPlayerData = (impact?.totals.progress ?? 0) + (impact?.totals.completions ?? 0) > 0;
  const hasPublished  = (impact?.totals.published ?? 0) > 0;
  const totalStories  = impact?.totals.stories ?? ids.length;

  const requireConfirm = mode === "hard";
  const canProceed = !requireConfirm || confirm === "DELETE";

  const submit = async () => {
    if (busy || !canProceed) return;
    setBusy(true);
    let ok = 0, fail = 0, blocked = 0;
    for (const id of ids) {
      try {
        const r = await adminDeleteStory(id, mode, force);
        if (r.ok) ok++;
        else if (r.reason === "has_player_data") blocked++;
        else fail++;
      } catch { fail++; }
    }
    setBusy(false);
    if (fail + blocked === 0) {
      await onDone(`تم ${mode === "archive" ? "أرشفة" : "حذف"} ${ok} قصة.`);
    } else {
      onError(`أُنجزت ${ok}، حُظرت ${blocked}، فشلت ${fail}.`);
      await onDone(`تم بشكل جزئي.`);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div dir="rtl" className="w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">حذف / أرشفة قصص</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>

        {!impact ? (
          <div className="text-sm text-muted-foreground">جاري احتساب الأثر...</div>
        ) : (
          <>
            <p className="mb-2 text-sm">
              محدد: <b>{totalStories}</b> قصة
              {" — "}منشورة: <b>{impact.totals.published}</b>
              {" — "}مسودة: <b>{impact.totals.draft}</b>
              {" — "}مؤرشفة: <b>{impact.totals.archived}</b>
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">
              <div>مشاهد: <b>{impact.totals.scenes}</b></div>
              <div>وسائط القصة: <b>{impact.totals.story_media}</b></div>
              <div>وسائط المجموعة: <b>{impact.totals.collection_media}</b></div>
              <div>سجلات تقدّم اللاعبين: <b>{impact.totals.progress}</b></div>
              <div>إتمامات اللاعبين: <b>{impact.totals.completions}</b></div>
              <div>تعليقات: <b>{impact.totals.comments}</b></div>
              <div>تفاعلات: <b>{impact.totals.reactions}</b></div>
            </div>

            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" checked={mode === "archive"} onChange={() => setMode("archive")} />
                <span>
                  <b>أرشفة (موصى به)</b>
                  <div className="text-xs text-muted-foreground">
                    تخفي القصة عن اللاعبين دون حذف أي بيانات — قابلة للاستعادة.
                  </div>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" checked={mode === "hard"} onChange={() => setMode("hard")} />
                <span>
                  <b>حذف نهائي</b>
                  <div className="text-xs text-muted-foreground">
                    يُزيل القصة والمشاهد وملفات الوسائط الخاصة بها. لا يمس الوسائط المشتركة أو سجلّ التدقيق.
                  </div>
                </span>
              </label>
              {mode === "hard" && (hasPlayerData || hasPublished) && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
                  {hasPlayerData
                    ? "توجد بيانات لاعبين مرتبطة. الحذف النهائي محظور افتراضيًا."
                    : "بعض القصص منشورة — يُوصى بالأرشفة."}
                  {hasPlayerData && (
                    <label className="mt-2 flex items-center gap-2">
                      <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                      أوافق على تجاوز الحماية وحذف بيانات اللاعبين نهائيًا.
                    </label>
                  )}
                </div>
              )}
              {mode === "hard" && (
                <label className="block text-xs">
                  اكتب <code className="rounded bg-muted px-1">DELETE</code> للتأكيد:
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
                  />
                </label>
              )}
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
          <button
            onClick={() => void submit()}
            disabled={!impact || busy || !canProceed || (mode === "hard" && hasPlayerData && !force)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              mode === "hard"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            } disabled:opacity-50`}
          >
            {busy ? "جاري..." : mode === "archive" ? "أرشفة" : "حذف نهائي"}
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------- Import JSON --------------------
function ImportModal({
  onClose, onDone, onError,
}: {
  onClose: () => void;
  onDone: (n: number) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [raw, setRaw] = useState<string>("");
  const [preview, setPreview] = useState<StoryImportPreview | null>(null);
  const [options, setOptions] = useState<ImportApplyOptions>({ skip_existing: false, sync_scenes: true, publish: false });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<unknown[] | null>(null);

  const onFile = async (f: File) => {
    const text = await f.text();
    setRaw(text);
    await runPreview(text);
  };

  const runPreview = async (text: string) => {
    setPreview(null);
    setErrors(null);
    try {
      const payload = JSON.parse(text);
      const normalized = Array.isArray(payload) ? { stories: payload } : payload;
      const res = await adminImportStoriesPreview(normalized);
      setPreview(res);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const apply = async () => {
    if (!raw || busy) return;
    setBusy(true);
    try {
      const payload = JSON.parse(raw);
      const normalized = Array.isArray(payload) ? { stories: payload } : payload;
      const res = await adminImportStoriesApply(normalized, options);
      const failed = res.items.filter((i) => !i.ok);
      const succeeded = res.items.length - failed.length;
      if (failed.length > 0) setErrors(failed);
      else await onDone(succeeded);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const downloadErrors = () => {
    if (!errors) return;
    const blob = new Blob([JSON.stringify({ errors }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `irth-import-errors-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const c = { new: 0, updated: 0, unchanged: 0, conflict: 0, invalid: 0 };
    (preview?.items ?? []).forEach((i) => { c[i.kind] = (c[i.kind] ?? 0) + 1; });
    return c;
  }, [preview]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div dir="rtl" className="w-full max-w-3xl rounded-lg border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">استيراد قصص (JSON)</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input type="file" accept="application/json,.json"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          <span className="text-xs text-muted-foreground">
            الشكل: {"{ \"version\": 1, \"stories\": [ ... ] }"} أو مصفوفة قصص مباشرة.
          </span>
        </div>

        {preview && (
          <>
            <div className="grid grid-cols-5 gap-2 rounded-md border p-3 text-center text-xs">
              <div><b className="text-emerald-600">{counts.new}</b><div>جديدة</div></div>
              <div><b className="text-sky-600">{counts.updated}</b><div>مُحدَّثة</div></div>
              <div><b>{counts.unchanged}</b><div>دون تغيير</div></div>
              <div><b className="text-amber-600">{counts.conflict}</b><div>تعارض</div></div>
              <div><b className="text-destructive">{counts.invalid}</b><div>غير صالحة</div></div>
            </div>
            <div className="mt-3 max-h-60 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-1 text-right">المعرّف</th>
                    <th className="px-2 py-1 text-right">العنوان</th>
                    <th className="px-2 py-1">النوع</th>
                    <th className="px-2 py-1">مشاهد</th>
                    <th className="px-2 py-1 text-right">مشاكل</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1 font-mono">{i.id ?? "—"}</td>
                      <td className="px-2 py-1">{i.title_ar ?? "—"}</td>
                      <td className="px-2 py-1 text-center">{i.kind}</td>
                      <td className="px-2 py-1 text-center">{i.scene_count}</td>
                      <td className="px-2 py-1 text-destructive">
                        {[...i.issues, ...i.missing_media.map((m) => `missing_media:${m}`)].join("، ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!options.skip_existing}
                  onChange={(e) => setOptions((o) => ({ ...o, skip_existing: e.target.checked }))} />
                تخطّي القصص الموجودة
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!options.sync_scenes}
                  onChange={(e) => setOptions((o) => ({ ...o, sync_scenes: e.target.checked }))} />
                مزامنة المشاهد (حذف غير المذكور)
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!options.publish}
                  onChange={(e) => setOptions((o) => ({ ...o, publish: e.target.checked }))} />
                نشر بعد الاستيراد إن اجتاز التحقق
              </label>
            </div>
          </>
        )}

        {errors && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            فشل {errors.length} عنصر.
            <button className="ml-2 underline" onClick={downloadErrors}>تنزيل تقرير الأخطاء</button>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إغلاق</button>
          <button
            onClick={() => void apply()}
            disabled={!preview || busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy ? "جاري التطبيق..." : "تطبيق الاستيراد"}
          </button>
        </div>
      </div>
    </div>
  );
}
