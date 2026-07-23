// ============================================================
// Stories P3 — Admin editor (auto-save + preview + health)
// ------------------------------------------------------------
// P3 quality-pass edition:
//   * Auto-save (~1s debounce) for story metadata / references /
//     unlock spec and for each scene edit. Visible Saving.../Saved.
//   * beforeunload guard while dirty or in-flight.
//   * Draft snapshot restore after an accidental publish.
//   * Source references (primary/secondary + editor notes).
//   * Continuous scene-health panel (client-side).
//   * Live preview uses the same SceneRenderer as the player.
//   * Bulk ops: duplicate scene, delete confirmation, up/down move.
// ============================================================

import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Save, Trash2, ImageUp, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Plus, X, Eye, ExternalLink, Undo2, Copy,
  Cloud, CloudOff, Loader2, ShieldAlert,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminGetStoryFull, adminUpsertStory, adminUpsertStoryScene,
  adminDeleteStoryScene, adminReorderStoryScenes, adminSetStoryStatus,
  adminRestorePreviousDraft, type AdminStoryBundle,
} from "@/lib/stories/admin";
import { validateStoryPublish, type StoryPublishValidation } from "@/lib/stories/media/dao";
import { uploadStoryMedia } from "@/lib/stories/media/pipeline";
import { readReferences, writeReferences, type StoryReferences, type StoryReference } from "@/lib/stories/references";
import { computeStoryHealth, summarizeHealth, type HealthFinding } from "@/lib/stories/health";
import { useAutoSave, type SaveStatus } from "@/hooks/useAutoSave";
import { SceneRenderer } from "@/components/stories/scenes/SceneRenderer";
import { StoryMediaImage } from "@/components/stories/StoryMediaImage";
import type {
  StoryRow, StorySceneRow, StorySceneType, StoryStatus, UnlockSpec,
} from "@/lib/stories/types";
import type { StoryMediaRow } from "@/lib/stories/media/dao";

export const Route = createFileRoute("/admin/stories/$id/edit")({
  head: ({ params }) => ({
    meta: [
      { title: `تحرير قصة ${params.id} — إرث` },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <StoryEditorRoute />
    </AdminGate>
  ),
});

type Toast = { kind: "ok" | "err"; msg: string };

const SCENE_TYPES: StorySceneType[] = ["reading", "perspective", "document", "reveal", "reflection"];
const SCENE_TYPE_LABEL: Record<StorySceneType, string> = {
  reading: "قراءة", perspective: "منظور", document: "وثيقة", reveal: "كشف", reflection: "تأمل",
};
const STATUS_LABEL: Record<StoryStatus, string> = {
  draft: "مسودة", published: "منشورة", archived: "مؤرشفة",
};

function StoryEditorRoute() {
  const { id } = Route.useParams();
  const [bundle, setBundle] = useState<AdminStoryBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [validation, setValidation] = useState<StoryPublishValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = async () => {
    setErr(null);
    try {
      const b = await adminGetStoryFull(id);
      if (!b) { setErr("القصة غير موجودة."); setBundle(null); return; }
      setBundle(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => { void refresh(); }, [id]);

  const runValidation = async () => {
    try { setValidation(await validateStoryPublish(id)); }
    catch (e) { notify("err", e instanceof Error ? e.message : String(e)); }
  };

  const restore = async () => {
    if (!confirm("استعادة آخر مسودة قبل النشر؟ سيتم استبدال المحتوى الحالي.")) return;
    try {
      const r = await adminRestorePreviousDraft(id);
      if (!r.ok) { notify("err", r.reason ?? "لا يوجد نسخة سابقة."); return; }
      notify("ok", "تمت الاستعادة.");
      await refresh();
    } catch (e) { notify("err", e instanceof Error ? e.message : String(e)); }
  };

  if (err) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl p-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">{err}</div>
        <Link to="/admin/stories" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
          <ArrowRight className="h-4 w-4" /> العودة للقصص
        </Link>
      </div>
    );
  }
  if (!bundle) {
    return <div dir="rtl" className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  }

  const health = computeStoryHealth(bundle.story, bundle.scenes, bundle.media);
  const healthSummary = summarizeHealth(health);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/stories" className="rounded-md border p-1.5 hover:bg-muted">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs text-muted-foreground">
              {STATUS_LABEL[bundle.story.status]} · {bundle.scenes.length} مشهد · نسخة {bundle.story.content_version}
            </div>
            <h1 className="text-lg font-semibold">{bundle.story.title_ar || bundle.story.id}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {bundle.hasPreviousDraft && (
            <button
              onClick={() => void restore()}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-500/20"
              title={bundle.previousDraftAt ? `اللقطة: ${new Date(bundle.previousDraftAt).toLocaleString("ar")}` : ""}
            >
              <Undo2 className="h-4 w-4" /> استرجاع المسودة السابقة
            </button>
          )}
          <button
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Eye className="h-4 w-4" /> معاينة مباشرة
          </button>
          <Link
            to="/story/$id"
            params={{ id: bundle.story.id }}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> صفحة اللاعب
          </Link>
          <button
            onClick={() => void runValidation()}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <CheckCircle2 className="h-4 w-4" /> تحقق قبل النشر
          </button>
          <PublishControls story={bundle.story} onNotify={notify} onChanged={refresh} busy={busy} setBusy={setBusy} />
        </div>
      </header>

      {validation && <ValidationPanel v={validation} onClose={() => setValidation(null)} />}

      <HealthPanel findings={health} summary={healthSummary} />

      <MetadataSection story={bundle.story} media={bundle.media} onNotify={notify} onSaved={refresh} />

      <ReferencesSection story={bundle.story} onNotify={notify} onSaved={refresh} />

      <ScenesSection
        story={bundle.story} scenes={bundle.scenes} media={bundle.media}
        onNotify={notify} onRefresh={refresh}
      />

      <UnlockSection story={bundle.story} onNotify={notify} onSaved={refresh} />

      {previewOpen && (
        <LivePreviewModal
          bundle={bundle}
          onClose={() => setPreviewOpen(false)}
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

// ------------------------------------------------------------------
function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "idle") return null;
  const map: Record<SaveStatus, { icon: React.ReactNode; label: string; className: string }> = {
    idle:    { icon: <Cloud className="h-3.5 w-3.5" />, label: "", className: "" },
    dirty:   { icon: <Cloud className="h-3.5 w-3.5" />, label: "تغييرات غير محفوظة", className: "text-muted-foreground" },
    saving:  { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "جاري الحفظ...", className: "text-muted-foreground" },
    saved:   { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "تم الحفظ", className: "text-emerald-600" },
    error:   { icon: <CloudOff className="h-3.5 w-3.5" />, label: error ?? "فشل الحفظ", className: "text-destructive" },
  };
  const s = map[status];
  return <span className={`inline-flex items-center gap-1 text-xs ${s.className}`}>{s.icon}{s.label}</span>;
}

function PublishControls({
  story, onNotify, onChanged, busy, setBusy,
}: {
  story: StoryRow;
  onNotify: (k: "ok" | "err", m: string) => void;
  onChanged: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const set = async (status: StoryStatus) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await adminSetStoryStatus(story.id, status);
      if (!res.ok) {
        if (res.reason === "validation_failed" && res.validation) {
          const first = res.validation.issues[0]?.message ?? "لا يمكن النشر.";
          onNotify("err", `تحقق قبل النشر: ${first}`);
        } else onNotify("err", res.reason ?? "تعذر تغيير الحالة.");
        return;
      }
      onNotify("ok", `الحالة الآن: ${STATUS_LABEL[status]}.`);
      await onChanged();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-1">
      {story.status !== "published" && (
        <button
          onClick={() => void set("published")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" /> نشر
        </button>
      )}
      {story.status !== "draft" && (
        <button
          onClick={() => void set("draft")}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >إرجاع لمسودة</button>
      )}
      {story.status !== "archived" && (
        <button
          onClick={() => void set("archived")}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >أرشفة</button>
      )}
    </div>
  );
}

function ValidationPanel({ v, onClose }: { v: StoryPublishValidation; onClose: () => void }) {
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {v.ok
            ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> جاهزة للنشر.</>
            : <><AlertTriangle className="h-4 w-4 text-amber-600" /> يوجد {v.issues.length} مانع.</>}
        </div>
        <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
      </div>
      {v.issues.length > 0 && (
        <ul className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
          {v.issues.map((i, k) => <li key={k}>• {i.message}</li>)}
        </ul>
      )}
      {v.warnings.length > 0 && (
        <ul className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-800">
          <li className="mb-1 font-medium">تنبيهات (لا تمنع النشر):</li>
          {v.warnings.map((w, k) => <li key={k}>• {w.message}</li>)}
        </ul>
      )}
    </div>
  );
}

function HealthPanel({ findings, summary }: { findings: HealthFinding[]; summary: ReturnType<typeof summarizeHealth> }) {
  const [open, setOpen] = useState(false);
  const bg = summary.errors > 0 ? "border-destructive/40 bg-destructive/5"
    : summary.warnings > 0 ? "border-amber-500/40 bg-amber-500/5"
    : "border-emerald-500/40 bg-emerald-500/5";
  return (
    <section className={`rounded-lg border ${bg} p-3`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          صحة المشاهد — {summary.errors} خطأ · {summary.warnings} تنبيه · {summary.infos} ملاحظة
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && findings.length === 0 && (
        <div className="mt-2 text-xs text-muted-foreground">كل شيء يبدو جيدًا.</div>
      )}
      {open && findings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {findings.map((f, i) => (
            <li key={i} className={`flex items-start gap-2 ${
              f.severity === "error" ? "text-destructive"
              : f.severity === "warning" ? "text-amber-700"
              : "text-muted-foreground"
            }`}>
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current" />
              <div>
                {typeof f.sceneIndex === "number" && <span className="opacity-70">مشهد #{f.sceneIndex + 1} · </span>}
                <span className="font-mono opacity-70">{f.code}</span> — {f.message}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------
// Metadata section with auto-save
// ------------------------------------------------------------------
function MetadataSection({
  story, media, onNotify, onSaved,
}: {
  story: StoryRow;
  media: StoryMediaRow[];
  onNotify: (k: "ok" | "err", m: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    slug: story.slug,
    title_ar: story.title_ar,
    title_en: story.title_en ?? "",
    summary_ar: story.summary_ar ?? "",
    summary_en: story.summary_en ?? "",
    world_slug: story.world_slug ?? "",
    era: story.era ?? "",
    display_order: story.display_order,
    xp_reward: story.xp_reward,
    dinar_reward: story.dinar_reward,
    cover_media_id: story.cover_media_id ?? "",
  });
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const saver = useRef(async (v: typeof form) => {
    await adminUpsertStory({
      id: story.id,
      slug: v.slug.trim(),
      title_ar: v.title_ar.trim(),
      title_en: v.title_en.trim() || null,
      summary_ar: v.summary_ar.trim() || null,
      summary_en: v.summary_en.trim() || null,
      world_slug: v.world_slug.trim() || null,
      era: v.era.trim() || null,
      display_order: Number(v.display_order) || 0,
      xp_reward: Number(v.xp_reward) || 0,
      dinar_reward: Number(v.dinar_reward) || 0,
      cover_media_id: v.cover_media_id || null,
      unlock_spec: story.unlock_spec,
      metadata: story.metadata,
    });
  }).current;

  const { status, error, flushNow } = useAutoSave(form, saver, { delayMs: 1000 });

  const cover = useMemo(
    () => media.find((m) => m.id === form.cover_media_id) ?? null,
    [media, form.cover_media_id],
  );

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const res = await uploadStoryMedia({ storyId: story.id, kind: "cover", file, metadata: { role: "cover" } });
      const next = { ...form, cover_media_id: res.mediaId };
      setForm(next);
      await saver(next);
      onNotify("ok", "تم رفع الغلاف والتحقق منه.");
      await onSaved();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
    finally { setUploadingCover(false); }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">البيانات الأساسية</h2>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} error={error} />
          <button onClick={() => void flushNow()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
            <Save className="h-3.5 w-3.5" /> حفظ الآن
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField label="المعرف" value={story.id} readOnly mono />
        <TextField label="الرابط (slug)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} mono />
        <TextField label="العنوان (عربي)" value={form.title_ar} onChange={(v) => setForm({ ...form, title_ar: v })} />
        <TextField label="العنوان (إنجليزي)" value={form.title_en} onChange={(v) => setForm({ ...form, title_en: v })} />
        <TextArea label="ملخّص (عربي)" value={form.summary_ar} onChange={(v) => setForm({ ...form, summary_ar: v })} />
        <TextArea label="ملخّص (إنجليزي)" value={form.summary_en} onChange={(v) => setForm({ ...form, summary_en: v })} />
        <TextField label="العالم (slug)" value={form.world_slug} onChange={(v) => setForm({ ...form, world_slug: v })} mono />
        <TextField label="العصر" value={form.era} onChange={(v) => setForm({ ...form, era: v })} />
        <NumField label="ترتيب العرض" value={form.display_order} onChange={(v) => setForm({ ...form, display_order: v })} />
        <NumField label="مكافأة الخبرة" value={form.xp_reward} onChange={(v) => setForm({ ...form, xp_reward: v })} />
        <NumField label="مكافأة الدنانير" value={form.dinar_reward} onChange={(v) => setForm({ ...form, dinar_reward: v })} />
      </div>
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium">صورة الغلاف</div>
          <input ref={coverInputRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ""; }} />
          <button onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
            <ImageUp className="h-3.5 w-3.5" />{uploadingCover ? "جاري الرفع..." : "رفع غلاف"}
          </button>
        </div>
        {cover ? (
          <div className="flex items-center gap-3">
            <StoryMediaImage media={cover} alt="غلاف" className="h-16 w-24 rounded object-cover" />
            <div className="text-xs text-muted-foreground">
              <div className="font-mono">{cover.checksum_sha256.slice(0, 12)}… · {cover.width}×{cover.height} · {(cover.byte_size / 1024).toFixed(1)} KB</div>
              <div>{cover.verified ? "متحقق منها ✓" : "غير متحققة (سيُرفض النشر)"} · {cover.preset}</div>
            </div>
          </div>
        ) : (<div className="text-xs text-muted-foreground">لا يوجد غلاف بعد.</div>)}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// References
// ------------------------------------------------------------------
function ReferencesSection({
  story, onNotify, onSaved,
}: {
  story: StoryRow;
  onNotify: (k: "ok" | "err", m: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [refs, setRefs] = useState<StoryReferences>(readReferences(story.metadata));

  const saver = useRef(async (v: StoryReferences) => {
    await adminUpsertStory({
      id: story.id,
      slug: story.slug,
      title_ar: story.title_ar,
      unlock_spec: story.unlock_spec,
      metadata: writeReferences(story.metadata, v),
    });
  }).current;

  const { status, error, flushNow } = useAutoSave(refs, saver, { delayMs: 1000 });

  const updateList = (key: "primary" | "secondary", i: number, next: Partial<StoryReference>) => {
    const list = refs[key].slice();
    list[i] = { ...list[i], ...next };
    setRefs({ ...refs, [key]: list });
  };
  const addRef = (key: "primary" | "secondary") => setRefs({ ...refs, [key]: [...refs[key], { title: "" }] });
  const rmRef = (key: "primary" | "secondary", i: number) =>
    setRefs({ ...refs, [key]: refs[key].filter((_, k) => k !== i) });

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">المصادر التاريخية</h2>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} error={error} />
          <button onClick={() => void flushNow().then(() => onSaved())}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
            <Save className="h-3.5 w-3.5" /> حفظ الآن
          </button>
        </div>
      </div>
      <RefList label="مصادر أوّلية" list={refs.primary} onChange={(i, r) => updateList("primary", i, r)}
        onAdd={() => addRef("primary")} onRemove={(i) => rmRef("primary", i)} />
      <RefList label="مصادر ثانوية" list={refs.secondary} onChange={(i, r) => updateList("secondary", i, r)}
        onAdd={() => addRef("secondary")} onRemove={(i) => rmRef("secondary", i)} />
      <label className="block text-xs">
        ملاحظات للمحرر (لا تظهر للاعبين)
        <textarea value={refs.notes ?? ""} rows={3}
          onChange={(e) => setRefs({ ...refs, notes: e.target.value })}
          className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
      </label>
      {onNotify && null}
    </section>
  );
}

function RefList({
  label, list, onChange, onAdd, onRemove,
}: {
  label: string;
  list: StoryReference[];
  onChange: (i: number, r: Partial<StoryReference>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium">{label} <span className="text-muted-foreground">({list.length})</span></div>
        <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
          <Plus className="h-3 w-3" /> إضافة
        </button>
      </div>
      {list.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          لا يوجد بعد.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((r, i) => (
            <li key={i} className="grid grid-cols-12 gap-2 rounded-md border bg-muted/30 p-2">
              <input placeholder="العنوان" value={r.title}
                onChange={(e) => onChange(i, { title: e.target.value })}
                className="col-span-4 rounded-md border bg-background px-2 py-1 text-xs" />
              <input placeholder="المؤلف" value={r.author ?? ""}
                onChange={(e) => onChange(i, { author: e.target.value })}
                className="col-span-3 rounded-md border bg-background px-2 py-1 text-xs" />
              <input placeholder="السنة" value={r.year ?? ""}
                onChange={(e) => onChange(i, { year: e.target.value })}
                className="col-span-2 rounded-md border bg-background px-2 py-1 text-xs" />
              <input placeholder="رابط" value={r.url ?? ""}
                onChange={(e) => onChange(i, { url: e.target.value })}
                className="col-span-2 rounded-md border bg-background px-2 py-1 text-xs" dir="ltr" />
              <button onClick={() => onRemove(i)} className="col-span-1 rounded-md border text-destructive hover:bg-destructive/10">
                <Trash2 className="mx-auto h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Scenes section — up/down, duplicate, delete with confirmation
// ------------------------------------------------------------------
function ScenesSection({
  story, scenes, media, onNotify, onRefresh,
}: {
  story: StoryRow;
  scenes: StorySceneRow[];
  media: StoryMediaRow[];
  onNotify: (k: "ok" | "err", m: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const ordered = useMemo(() => [...scenes].sort((a, b) => a.scene_index - b.scene_index), [scenes]);

  const reorder = async (list: StorySceneRow[]) => {
    try {
      await adminReorderStoryScenes(story.id, list.map((s) => s.id));
      onNotify("ok", "تم تحديث الترتيب.");
      await onRefresh();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
  };
  const move = (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= ordered.length) return;
    const list = ordered.slice();
    [list[idx], list[next]] = [list[next], list[idx]];
    void reorder(list);
  };
  const duplicate = async (scene: StorySceneRow) => {
    const suffix = Date.now().toString(36).slice(-5);
    const newId = `${scene.id}_dup_${suffix}`.slice(0, 120);
    try {
      await adminUpsertStoryScene({
        id: newId,
        story_id: scene.story_id,
        scene_index: ordered.length,
        scene_type: scene.scene_type,
        title_ar: scene.title_ar ? `${scene.title_ar} (نسخة)` : null,
        title_en: scene.title_en,
        payload: scene.payload,
        primary_media_id: scene.primary_media_id,
      });
      onNotify("ok", "تم نسخ المشهد.");
      await onRefresh();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">المشاهد ({ordered.length})</h2>
        <button onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> مشهد جديد
        </button>
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مشاهد بعد.</div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((s, i) => (
            <SceneRow key={s.id} index={i} total={ordered.length} scene={s} media={media}
              onMove={(dir) => move(i, dir)} onDuplicate={() => void duplicate(s)}
              onChanged={onRefresh} onNotify={onNotify} />
          ))}
        </ul>
      )}
      {creating && (
        <CreateSceneModal storyId={story.id} nextIndex={ordered.length}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); onNotify("ok", "تم إنشاء المشهد."); await onRefresh(); }}
          onError={(m) => onNotify("err", m)} />
      )}
    </section>
  );
}

function SceneRow({
  index, total, scene, media, onMove, onDuplicate, onChanged, onNotify,
}: {
  index: number; total: number;
  scene: StorySceneRow; media: StoryMediaRow[];
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onChanged: () => Promise<void>;
  onNotify: (k: "ok" | "err", m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState({
    scene_type: scene.scene_type,
    title_ar: scene.title_ar ?? "",
    title_en: scene.title_en ?? "",
    payload: JSON.stringify(scene.payload ?? {}, null, 2),
    primary_media_id: scene.primary_media_id ?? "",
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // parse payload once per form.payload change; invalid JSON prevents auto-save
  const parsedPayload = useMemo(() => {
    try { return JSON.parse(form.payload || "{}") as Record<string, unknown>; }
    catch { return null; }
  }, [form.payload]);

  const saver = useRef(async (v: typeof form & { payload: string }) => {
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(v.payload || "{}"); }
    catch { throw new Error("محتوى المشهد ليس JSON صالحًا."); }
    await adminUpsertStoryScene({
      id: scene.id,
      story_id: scene.story_id,
      scene_index: scene.scene_index,
      scene_type: v.scene_type,
      title_ar: v.title_ar || null,
      title_en: v.title_en || null,
      payload,
      primary_media_id: v.primary_media_id || null,
    });
  }).current;

  const { status, error } = useAutoSave(form, saver, { delayMs: 1000, enabled: parsedPayload !== null });

  const attached = useMemo(
    () => media.find((m) => m.id === form.primary_media_id) ?? null,
    [media, form.primary_media_id],
  );

  const remove = async () => {
    try {
      await adminDeleteStoryScene(scene.story_id, scene.id);
      onNotify("ok", "تم الحذف.");
      await onChanged();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const kind = form.scene_type === "document" ? "document" : "scene";
      const res = await uploadStoryMedia({ storyId: scene.story_id, kind, file, metadata: { scene_id: scene.id } });
      const next = { ...form, primary_media_id: res.mediaId };
      setForm(next);
      await saver(next);
      onNotify("ok", "تم رفع الصورة وربطها.");
      await onChanged();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
    finally { setUploading(false); }
  };

  return (
    <li className="rounded-md border bg-background">
      <div className="flex items-center gap-2 p-2">
        <div className="flex flex-col">
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30" title="نقل لأعلى">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30" title="نقل لأسفل">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 cursor-pointer" onClick={() => setOpen((v) => !v)}>
          <div className="text-xs text-muted-foreground">
            #{scene.scene_index + 1} · {SCENE_TYPE_LABEL[scene.scene_type]} · <span className="font-mono">{scene.id}</span>
          </div>
          <div className="font-medium">{scene.title_ar || "(بدون عنوان)"}</div>
        </div>
        <SaveIndicator status={status} error={error} />
        <button onClick={onDuplicate} title="نسخ المشهد"
          className="rounded p-1 text-muted-foreground hover:bg-muted"><Copy className="h-4 w-4" /></button>
        <button onClick={() => setConfirming(true)} title="حذف"
          className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-xs">
              نوع المشهد
              <select value={form.scene_type}
                onChange={(e) => setForm({ ...form, scene_type: e.target.value as StorySceneType })}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
                {SCENE_TYPES.map((t) => <option key={t} value={t}>{SCENE_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <TextField label="العنوان (عربي)" value={form.title_ar} onChange={(v) => setForm({ ...form, title_ar: v })} />
            <TextField label="العنوان (إنجليزي)" value={form.title_en} onChange={(v) => setForm({ ...form, title_en: v })} />
            <div className="text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span>الوسائط الأساسية</span>
                <input ref={fileRef} type="file" accept="image/*" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50">
                  <ImageUp className="h-3 w-3" />{uploading ? "جاري الرفع..." : "رفع"}
                </button>
              </div>
              {attached ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                  <StoryMediaImage media={attached} alt="" className="h-12 w-16 rounded object-cover" />
                  <div className="text-muted-foreground">
                    <div className="font-mono">{attached.width}×{attached.height} · {(attached.byte_size / 1024).toFixed(1)} KB</div>
                    <div>{attached.verified ? "متحققة ✓" : "غير متحققة"} · {attached.preset}</div>
                  </div>
                </div>
              ) : <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">لا يوجد مرفق.</div>}
            </div>
          </div>
          <label className="block text-xs">
            محتوى المشهد (JSON)
            {parsedPayload === null && (
              <span className="mr-2 text-destructive">JSON غير صالح — إيقاف الحفظ التلقائي</span>
            )}
            <textarea value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })}
              rows={10} dir="ltr"
              className={`mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs ${
                parsedPayload === null ? "border-destructive/50" : ""
              }`} />
          </label>
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-xl" dir="rtl">
            <div className="mb-2 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> تأكيد الحذف
            </div>
            <p className="mb-4 text-sm">حذف المشهد <span className="font-mono">{scene.id}</span>؟ لا يمكن التراجع.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(false)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
              <button onClick={() => { setConfirming(false); void remove(); }}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground">حذف</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function CreateSceneModal({
  storyId, nextIndex, onClose, onCreated, onError,
}: {
  storyId: string; nextIndex: number;
  onClose: () => void; onCreated: () => void; onError: (m: string) => void;
}) {
  const [id, setId] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [type, setType] = useState<StorySceneType>("reading");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!/^[a-z0-9_-]{1,120}$/.test(id.trim())) { onError("المعرف: أحرف صغيرة/أرقام/شرطات."); return; }
    setBusy(true);
    try {
      await adminUpsertStoryScene({
        id: id.trim(), story_id: storyId, scene_index: nextIndex,
        scene_type: type, title_ar: titleAr.trim() || null, payload: {},
      });
      onCreated();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-xl" dir="rtl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">مشهد جديد</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">المعرف الثابت
            <input value={id} onChange={(e) => setId(e.target.value)} placeholder="scene_intro"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm" />
          </label>
          <label className="block text-xs">العنوان (عربي)
            <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="block text-xs">النوع
            <select value={type} onChange={(e) => setType(e.target.value as StorySceneType)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
              {SCENE_TYPES.map((t) => <option key={t} value={t}>{SCENE_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">إلغاء</button>
          <button onClick={() => void submit()} disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? "جاري..." : "إنشاء"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Unlock (+ raw metadata) — kept for advanced editors
// ------------------------------------------------------------------
function UnlockSection({
  story, onNotify, onSaved,
}: {
  story: StoryRow;
  onNotify: (k: "ok" | "err", m: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [unlockText, setUnlockText] = useState(JSON.stringify(story.unlock_spec ?? { type: "always" }, null, 2));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    let unlock: UnlockSpec;
    try { unlock = JSON.parse(unlockText || '{"type":"always"}'); }
    catch { onNotify("err", "شرط الفتح غير صالح (JSON)."); return; }
    setSaving(true);
    try {
      await adminUpsertStory({
        id: story.id, slug: story.slug, title_ar: story.title_ar,
        unlock_spec: unlock, metadata: story.metadata,
      });
      onNotify("ok", "تم حفظ شرط الفتح.");
      await onSaved();
    } catch (e) { onNotify("err", e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">شرط الفتح (unlock_spec)</h2>
      <textarea value={unlockText} onChange={(e) => setUnlockText(e.target.value)}
        rows={8} dir="ltr"
        className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs" />
      <p className="text-xs text-muted-foreground">
        الأنواع: <span className="font-mono">always | and | or | campaign_completed | investigation_completed | story_completed</span>
      </p>
      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "جاري..." : "حفظ"}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Live preview — reuses the player SceneRenderer
// ------------------------------------------------------------------
function LivePreviewModal({ bundle, onClose }: { bundle: AdminStoryBundle; onClose: () => void }) {
  const ordered = useMemo(
    () => [...bundle.scenes].sort((a, b) => a.scene_index - b.scene_index),
    [bundle.scenes],
  );
  const [idx, setIdx] = useState(0);
  const scene = ordered[idx];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b p-2" dir="rtl">
          <div className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4" /> معاينة مباشرة — يستخدم نفس مكوّنات اللاعب
          </div>
          <button onClick={onClose} className="rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {scene ? (
            <SceneRenderer scene={scene} media={bundle.media} />
          ) : (
            <div dir="rtl" className="p-6 text-center text-sm text-muted-foreground">لا توجد مشاهد.</div>
          )}
        </div>
        <div className="flex items-center justify-between border-t p-2" dir="rtl">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40">السابق</button>
          <div className="text-xs text-muted-foreground">
            {ordered.length ? `${idx + 1} / ${ordered.length}` : ""}
          </div>
          <button onClick={() => setIdx((i) => Math.min(ordered.length - 1, i + 1))}
            disabled={idx >= ordered.length - 1}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40">التالي</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Field primitives
// ------------------------------------------------------------------
function TextField({
  label, value, onChange, mono, readOnly,
}: { label: string; value: string; onChange?: (v: string) => void; mono?: boolean; readOnly?: boolean }) {
  return (
    <label className="block text-xs">
      {label}
      <input value={value} onChange={(e) => onChange?.(e.target.value)} readOnly={readOnly}
        className={`mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm ${
          mono ? "font-mono" : ""} ${readOnly ? "text-muted-foreground" : ""}`} />
    </label>
  );
}
function TextArea({
  label, value, onChange, rows = 3,
}: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block text-xs md:col-span-2">
      {label}
      <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}
function NumField({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs">
      {label}
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
    </label>
  );
}
