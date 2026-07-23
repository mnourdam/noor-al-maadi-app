// ============================================================
// Stories P3 — Admin editor
// ------------------------------------------------------------
// Single-page editor for one story: metadata, scenes (add, edit,
// delete, reorder), cover + scene media upload, unlock spec,
// references (metadata jsonb), publish validation, and lifecycle
// transitions. No player UI here — see /story/$id for that.
//
// Persistence contract:
//   * Every save calls admin_upsert_story / admin_upsert_story_scene
//     — idempotent on stable IDs.
//   * Publish goes through admin_set_story_status which reruns
//     admin_validate_story_publish server-side.
//   * Media uploads use the frozen P2 pipeline (uploadStoryMedia).
// ============================================================

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Save, Trash2, ImageUp, RefreshCw, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronUp, Plus, X, Eye, ExternalLink,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminGetStoryFull, adminUpsertStory, adminUpsertStoryScene,
  adminDeleteStoryScene, adminReorderStoryScenes, adminSetStoryStatus,
  type AdminStoryBundle,
} from "@/lib/stories/admin";
import { validateStoryPublish, type StoryPublishValidation } from "@/lib/stories/media/dao";
import { uploadStoryMedia } from "@/lib/stories/media/pipeline";
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

const SCENE_TYPES: StorySceneType[] = [
  "reading", "perspective", "document", "reveal", "reflection",
];
const SCENE_TYPE_LABEL: Record<StorySceneType, string> = {
  reading: "قراءة",
  perspective: "منظور",
  document: "وثيقة",
  reveal: "كشف",
  reflection: "تأمل",
};
const STATUS_LABEL: Record<StoryStatus, string> = {
  draft: "مسودة", published: "منشورة", archived: "مؤرشفة",
};

function StoryEditorRoute() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<AdminStoryBundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [validation, setValidation] = useState<StoryPublishValidation | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      const v = await validateStoryPublish(id);
      setValidation(v);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    }
  };

  if (err) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl p-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          {err}
        </div>
        <Link to="/admin/stories" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
          <ArrowRight className="h-4 w-4" /> العودة للقصص
        </Link>
      </div>
    );
  }
  if (!bundle) {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/stories" className="rounded-md border p-1.5 hover:bg-muted">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-xs text-muted-foreground">
              {STATUS_LABEL[bundle.story.status]} · {bundle.scenes.length} مشهد
            </div>
            <h1 className="text-lg font-semibold">{bundle.story.title_ar || bundle.story.id}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/story/$id"
            params={{ id: bundle.story.id }}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Eye className="h-4 w-4" /> معاينة
          </Link>
          <button
            onClick={() => void runValidation()}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <CheckCircle2 className="h-4 w-4" /> تحقق قبل النشر
          </button>
          <PublishControls
            story={bundle.story}
            onNotify={notify}
            onChanged={refresh}
            busy={busy}
            setBusy={setBusy}
          />
        </div>
      </header>

      {validation && (
        <ValidationPanel v={validation} onClose={() => setValidation(null)} />
      )}

      <MetadataSection
        story={bundle.story}
        media={bundle.media}
        onNotify={notify}
        onSaved={refresh}
      />

      <ScenesSection
        story={bundle.story}
        scenes={bundle.scenes}
        media={bundle.media}
        onNotify={notify}
        onRefresh={refresh}
      />

      <UnlockAndReferencesSection
        story={bundle.story}
        onNotify={notify}
        onSaved={refresh}
      />

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

      {/* Kept for future keyboard shortcut wiring. */}
      {navigate && null}
    </div>
  );
}

// ------------------------------------------------------------------
// Publish / status controls
// ------------------------------------------------------------------
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
        } else {
          onNotify("err", res.reason ?? "تعذر تغيير الحالة.");
        }
        return;
      }
      onNotify("ok", `الحالة الآن: ${STATUS_LABEL[status]}.`);
      await onChanged();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
        >
          إرجاع لمسودة
        </button>
      )}
      {story.status !== "archived" && (
        <button
          onClick={() => void set("archived")}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          أرشفة
        </button>
      )}
    </div>
  );
}

function ValidationPanel({
  v, onClose,
}: { v: StoryPublishValidation; onClose: () => void }) {
  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        v.ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          {v.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {v.ok ? "جاهزة للنشر." : `يوجد ${v.issues.length} مشكلة قبل النشر.`}
        </div>
        <button onClick={onClose} className="opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!v.ok && (
        <ul className="list-disc space-y-1 pr-6">
          {v.issues.map((i, idx) => (
            <li key={idx}>
              <span className="font-mono text-xs opacity-70">{i.code}</span>
              {typeof i.scene_index === "number" && (
                <span className="mx-1 opacity-70">·مشهد {i.scene_index}</span>
              )}
              <span className="mr-1">— {i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Metadata (title, slug, rewards, world, era, cover)
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
  const [saving, setSaving] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const cover = useMemo(
    () => media.find((m) => m.id === form.cover_media_id) ?? null,
    [media, form.cover_media_id],
  );

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await adminUpsertStory({
        id: story.id,
        slug: form.slug.trim(),
        title_ar: form.title_ar.trim(),
        title_en: form.title_en.trim() || null,
        summary_ar: form.summary_ar.trim() || null,
        summary_en: form.summary_en.trim() || null,
        world_slug: form.world_slug.trim() || null,
        era: form.era.trim() || null,
        display_order: Number(form.display_order) || 0,
        xp_reward: Number(form.xp_reward) || 0,
        dinar_reward: Number(form.dinar_reward) || 0,
        cover_media_id: form.cover_media_id || null,
        unlock_spec: story.unlock_spec,
        metadata: story.metadata,
      });
      onNotify("ok", "تم حفظ البيانات.");
      await onSaved();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const res = await uploadStoryMedia({
        storyId: story.id,
        kind: "cover",
        file,
        metadata: { role: "cover" },
      });
      setForm((f) => ({ ...f, cover_media_id: res.mediaId }));
      await adminUpsertStory({
        id: story.id,
        slug: form.slug.trim(),
        title_ar: form.title_ar.trim(),
        cover_media_id: res.mediaId,
        unlock_spec: story.unlock_spec,
        metadata: story.metadata,
      });
      onNotify("ok", "تم رفع الغلاف والتحقق منه.");
      await onSaved();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingCover(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">البيانات الأساسية</h2>
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
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCover(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            <ImageUp className="h-3.5 w-3.5" />
            {uploadingCover ? "جاري الرفع..." : "رفع غلاف"}
          </button>
        </div>
        {cover ? (
          <div className="text-xs text-muted-foreground">
            <div className="font-mono">{cover.checksum_sha256.slice(0, 12)}… · {cover.width}×{cover.height} · {(cover.byte_size / 1024).toFixed(1)} KB</div>
            <div>{cover.verified ? "متحقق منها ✓" : "غير متحققة (سيُرفض النشر)"} · {cover.preset}</div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">لا يوجد غلاف بعد.</div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ البيانات"}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Scenes list + editor
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
  const ordered = useMemo(
    () => [...scenes].sort((a, b) => a.scene_index - b.scene_index),
    [scenes],
  );

  const move = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir;
    if (next < 0 || next >= ordered.length) return;
    const list = ordered.slice();
    [list[idx], list[next]] = [list[next], list[idx]];
    try {
      await adminReorderStoryScenes(story.id, list.map((s) => s.id));
      onNotify("ok", "تم تحديث الترتيب.");
      await onRefresh();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          المشاهد ({ordered.length})
        </h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> مشهد جديد
        </button>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          لا توجد مشاهد بعد.
        </div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((s, i) => (
            <SceneRow
              key={s.id}
              index={i}
              total={ordered.length}
              scene={s}
              media={media}
              onMove={(dir) => void move(i, dir)}
              onChanged={onRefresh}
              onNotify={onNotify}
            />
          ))}
        </ul>
      )}

      {creating && (
        <CreateSceneModal
          storyId={story.id}
          nextIndex={ordered.length}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            onNotify("ok", "تم إنشاء المشهد.");
            await onRefresh();
          }}
          onError={(m) => onNotify("err", m)}
        />
      )}
    </section>
  );
}

function SceneRow({
  index, total, scene, media, onMove, onChanged, onNotify,
}: {
  index: number;
  total: number;
  scene: StorySceneRow;
  media: StoryMediaRow[];
  onMove: (dir: -1 | 1) => void;
  onChanged: () => Promise<void>;
  onNotify: (k: "ok" | "err", m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    scene_type: scene.scene_type,
    title_ar: scene.title_ar ?? "",
    title_en: scene.title_en ?? "",
    payload: JSON.stringify(scene.payload ?? {}, null, 2),
    primary_media_id: scene.primary_media_id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const attached = useMemo(
    () => media.find((m) => m.id === form.primary_media_id) ?? null,
    [media, form.primary_media_id],
  );

  const save = async () => {
    if (saving) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payload || "{}");
    } catch {
      onNotify("err", "JSON غير صالح في محتوى المشهد.");
      return;
    }
    setSaving(true);
    try {
      await adminUpsertStoryScene({
        id: scene.id,
        story_id: scene.story_id,
        scene_index: scene.scene_index,
        scene_type: form.scene_type,
        title_ar: form.title_ar || null,
        title_en: form.title_en || null,
        payload,
        primary_media_id: form.primary_media_id || null,
      });
      onNotify("ok", "تم حفظ المشهد.");
      await onChanged();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`حذف المشهد "${scene.title_ar || scene.id}"؟`)) return;
    try {
      await adminDeleteStoryScene(scene.story_id, scene.id);
      onNotify("ok", "تم الحذف.");
      await onChanged();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const kind = form.scene_type === "document" ? "document" : "scene";
      const res = await uploadStoryMedia({
        storyId: scene.story_id,
        kind,
        file,
        metadata: { scene_id: scene.id },
      });
      setForm((f) => ({ ...f, primary_media_id: res.mediaId }));
      await adminUpsertStoryScene({
        id: scene.id,
        story_id: scene.story_id,
        scene_index: scene.scene_index,
        scene_type: form.scene_type,
        primary_media_id: res.mediaId,
        payload: JSON.parse(form.payload || "{}"),
      });
      onNotify("ok", "تم رفع الصورة وربطها.");
      await onChanged();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <li className="rounded-md border bg-background">
      <div className="flex items-center gap-2 p-2">
        <div className="flex flex-col">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 cursor-pointer" onClick={() => setOpen((v) => !v)}>
          <div className="text-xs text-muted-foreground">
            #{scene.scene_index} · {SCENE_TYPE_LABEL[scene.scene_type]} · <span className="font-mono">{scene.id}</span>
          </div>
          <div className="font-medium">{scene.title_ar || "(بدون عنوان)"}</div>
        </div>
        <button
          onClick={remove}
          className="rounded p-1 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-xs">
              نوع المشهد
              <select
                value={form.scene_type}
                onChange={(e) => setForm({ ...form, scene_type: e.target.value as StorySceneType })}
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                {SCENE_TYPES.map((t) => (
                  <option key={t} value={t}>{SCENE_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <TextField label="العنوان (عربي)" value={form.title_ar} onChange={(v) => setForm({ ...form, title_ar: v })} />
            <TextField label="العنوان (إنجليزي)" value={form.title_en} onChange={(v) => setForm({ ...form, title_en: v })} />
            <div className="text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span>الصورة/الوثيقة الأساسية</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-50"
                >
                  <ImageUp className="h-3 w-3" />
                  {uploading ? "جاري الرفع..." : "رفع"}
                </button>
              </div>
              {attached ? (
                <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">
                  <div className="font-mono">{attached.checksum_sha256.slice(0, 12)}… · {attached.width}×{attached.height} · {(attached.byte_size / 1024).toFixed(1)} KB</div>
                  <div>{attached.verified ? "متحققة ✓" : "غير متحققة"} · {attached.preset}</div>
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-2 text-muted-foreground">لا يوجد مرفق.</div>
              )}
            </div>
          </div>

          <label className="block text-xs">
            محتوى المشهد (JSON)
            <textarea
              value={form.payload}
              onChange={(e) => setForm({ ...form, payload: e.target.value })}
              rows={10}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
              dir="ltr"
            />
          </label>

          <div className="flex justify-end">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? "جاري الحفظ..." : "حفظ المشهد"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function CreateSceneModal({
  storyId, nextIndex, onClose, onCreated, onError,
}: {
  storyId: string;
  nextIndex: number;
  onClose: () => void;
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [id, setId] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [type, setType] = useState<StorySceneType>("reading");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!/^[a-z0-9_-]{1,120}$/.test(id.trim())) {
      onError("المعرف يجب أن يكون أحرفًا صغيرة/أرقامًا/شرطات.");
      return;
    }
    setBusy(true);
    try {
      await adminUpsertStoryScene({
        id: id.trim(),
        story_id: storyId,
        scene_index: nextIndex,
        scene_type: type,
        title_ar: titleAr.trim() || null,
        payload: {},
      });
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">مشهد جديد</h2>
          <button onClick={onClose} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs">
            المعرف الثابت
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="scene_intro"
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="block text-xs">
            العنوان (عربي)
            <input
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            النوع
            <select
              value={type}
              onChange={(e) => setType(e.target.value as StorySceneType)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {SCENE_TYPES.map((t) => (
                <option key={t} value={t}>{SCENE_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            إلغاء
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy ? "جاري..." : "إنشاء"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Unlock spec + references (metadata jsonb)
// ------------------------------------------------------------------
function UnlockAndReferencesSection({
  story, onNotify, onSaved,
}: {
  story: StoryRow;
  onNotify: (k: "ok" | "err", m: string) => void;
  onSaved: () => Promise<void>;
}) {
  const [unlockText, setUnlockText] = useState(
    JSON.stringify(story.unlock_spec ?? { type: "always" }, null, 2),
  );
  const [refsText, setRefsText] = useState(
    JSON.stringify(story.metadata ?? {}, null, 2),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    let unlock: UnlockSpec;
    let refs: Record<string, unknown>;
    try {
      unlock = JSON.parse(unlockText || '{"type":"always"}');
    } catch {
      onNotify("err", "شرط الفتح غير صالح (JSON).");
      return;
    }
    try {
      refs = JSON.parse(refsText || "{}");
    } catch {
      onNotify("err", "المراجع غير صالحة (JSON).");
      return;
    }
    setSaving(true);
    try {
      await adminUpsertStory({
        id: story.id,
        slug: story.slug,
        title_ar: story.title_ar,
        unlock_spec: unlock,
        metadata: refs,
      });
      onNotify("ok", "تم حفظ شرط الفتح والمراجع.");
      await onSaved();
    } catch (e) {
      onNotify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid grid-cols-1 gap-4 rounded-lg border p-4 md:grid-cols-2">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">شرط الفتح (unlock_spec)</h2>
          <a
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            href="https://en.wikipedia.org/wiki/Boolean_algebra"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3 w-3" /> منطق بولي
          </a>
        </div>
        <textarea
          value={unlockText}
          onChange={(e) => setUnlockText(e.target.value)}
          rows={12}
          dir="ltr"
          className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          الأنواع المدعومة: <span className="font-mono">always</span>,{" "}
          <span className="font-mono">and</span>, <span className="font-mono">or</span>,{" "}
          <span className="font-mono">campaign_completed</span>,{" "}
          <span className="font-mono">investigation_completed</span>,{" "}
          <span className="font-mono">story_completed</span>.
        </p>
      </div>
      <div>
        <h2 className="mb-1 text-sm font-semibold text-muted-foreground">المراجع (metadata)</h2>
        <textarea
          value={refsText}
          onChange={(e) => setRefsText(e.target.value)}
          rows={12}
          dir="ltr"
          className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          حرّة الشكل — تُخزَّن مع القصة كـ jsonb. مثال:{" "}
          <span className="font-mono">{`{"references":[...],"credits":"..."}`}</span>
        </p>
      </div>
      <div className="md:col-span-2 flex justify-end">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "جاري..." : "حفظ"}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------
// Field primitives
// ------------------------------------------------------------------
function TextField({
  label, value, onChange, mono, readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  mono?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block text-xs">
      {label}
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        className={`mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm ${
          mono ? "font-mono" : ""
        } ${readOnly ? "text-muted-foreground" : ""}`}
      />
    </label>
  );
}

function TextArea({
  label, value, onChange, rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-xs md:col-span-2">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function NumField({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs">
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

// Small unused refresh icon reference to avoid tree-shaking issues.
void RefreshCw;
