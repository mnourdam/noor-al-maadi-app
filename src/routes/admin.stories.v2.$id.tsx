// ============================================================
// /admin/stories/v2/$id — Story Create/Edit v2 (M5).
// ------------------------------------------------------------
// This page reads the current v2 state via the frozen M4
// admin_export_stories_v2 RPC and writes changes exclusively
// through admin_import_stories_v2_preview / _apply — the only
// server-authoritative pipeline for the v2 fields.
//
// Scenes, media, cover, references and publish state remain
// owned by the existing P3 editor at /admin/stories/$id/edit;
// this page mutates ONLY the story-level v2 fields, unlock_spec,
// relations and sources. Scenes/media/collections lists from the
// bundle are echoed verbatim so an unchanged v2 save is a
// zero-write idempotent import.
// ============================================================

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Save, Loader2, Pencil, ExternalLink, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";
import {
  adminExportStoriesV2, adminImportStoriesV2Preview, adminImportStoriesV2Apply,
  type StoryExportEnvelopeV2, type StoryExportItemV2,
  type StoryImportPreviewReportV2,
} from "@/lib/stories/import-v2";
import {
  STORY_CATEGORY, STORY_CATEGORY_LABEL,
  STORY_RARITY, STORY_RARITY_LABEL,
  STORY_LOCK_VISIBILITY, STORY_LOCK_VISIBILITY_LABEL,
  STORY_LENGTH_CLASS, STORY_LENGTH_CLASS_LABEL,
  STORY_HISTORICAL_CONFIDENCE, STORY_HISTORICAL_CONFIDENCE_LABEL,
  STORY_SNAPSHOT_TIER, STORY_SNAPSHOT_TIER_LABEL,
  STORY_PRODUCTION_STATUS, STORY_PRODUCTION_STATUS_LABEL,
  type StoryCategory, type StoryRarity, type StoryLockVisibility,
  type StoryLengthClass, type StoryHistoricalConfidence, type StorySnapshotTier,
  type StoryProductionStatus,
} from "@/lib/stories/v2/enums";
import { listCollections, type CollectionOption } from "@/lib/stories/v2/collections";
import { TimeEditor, type TimeValue } from "@/components/admin/stories/v2/TimeEditor";
import { TagsEditor } from "@/components/admin/stories/v2/TagsEditor";
import { UnlockBuilder } from "@/components/admin/stories/v2/UnlockBuilder";
import { RelationsEditor, type RelationItem } from "@/components/admin/stories/v2/RelationsEditor";
import { SourcesEditor, type SourceItem } from "@/components/admin/stories/v2/SourcesEditor";
import { ValidationPanel } from "@/components/admin/stories/v2/ValidationPanel";
import { ALWAYS_SPEC, type UnlockSpecV2 } from "@/lib/stories/unlock/spec";

export const Route = createFileRoute("/admin/stories/v2/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `تحرير قصة v2 · ${params.id} — إرث` },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (<AdminGate><StoryV2EditorPage /></AdminGate>),
});

type Toast = { kind: "ok" | "err"; msg: string };

interface EditorState {
  // Identifiers (read-only in v2 editor; use legacy editor to change slug)
  id: string;
  slug: string;
  // Classification
  category: StoryCategory;
  rarity: StoryRarity;
  lock_visibility: StoryLockVisibility;
  length_class: StoryLengthClass;
  historical_confidence: StoryHistoricalConfidence;
  snapshot_tier: StorySnapshotTier;
  production_status: StoryProductionStatus;
  tags: string[];
  // Collection
  story_collection_id: string | null;
  collection_order: number | null;
  // Time
  time: TimeValue;
  // Unlock / relations / sources
  unlock_spec: UnlockSpecV2;
  relations: RelationItem[];
  sources: SourceItem[];
}

function toEditorState(item: StoryExportItemV2): EditorState {
  return {
    id: item.id,
    slug: item.slug,
    category: (item.category as StoryCategory) ?? "event",
    rarity: (item.rarity as StoryRarity) ?? "standard",
    lock_visibility: (item.lock_visibility as StoryLockVisibility) ?? "visible",
    length_class: (item.length_class as StoryLengthClass) ?? "standard",
    historical_confidence: (item.historical_confidence as StoryHistoricalConfidence) ?? "established",
    snapshot_tier: (item.snapshot_tier as StorySnapshotTier) ?? "standard",
    production_status: (item.production_status as StoryProductionStatus) ?? "writing",
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    story_collection_id: item.story_collection_id ?? null,
    collection_order: item.collection_order ?? null,
    time: {
      hijri_start_year: item.hijri_start_year,
      hijri_start_month: item.hijri_start_month,
      hijri_start_day: item.hijri_start_day,
      hijri_end_year: item.hijri_end_year,
      hijri_end_month: item.hijri_end_month,
      hijri_end_day: item.hijri_end_day,
      gregorian_start: item.gregorian_start,
      gregorian_end: item.gregorian_end,
      time_precision: (item.time_precision as TimeValue["time_precision"]) ?? "unknown",
    },
    unlock_spec: normalizeSpec(item.unlock_spec),
    relations: (item.relations ?? []).map((r) => ({
      id: r.id,
      target_type: r.target_type as RelationItem["target_type"],
      target_id: r.target_id,
      target_extra: (r.target_extra ?? {}) as Record<string, unknown>,
      role: r.role as RelationItem["role"],
      notes: r.notes,
      display_order: r.display_order,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })),
    sources: (item.sources ?? []).map((s) => ({
      id: s.id,
      source_key: s.source_key,
      kind: s.kind as SourceItem["kind"],
      citation: s.citation,
      title: s.title, author: s.author, year: s.year, page: s.page,
      url: s.url, weight: s.weight, notes: s.notes,
      display_order: s.display_order,
    })),
  };
}

function normalizeSpec(u: unknown): UnlockSpecV2 {
  if (u && typeof u === "object" && (u as { version?: unknown }).version === 2 && "expr" in (u as object)) {
    return u as UnlockSpecV2;
  }
  return ALWAYS_SPEC;
}

/** Build a single-story v2 envelope by patching the loaded bundle. */
function buildEnvelope(bundle: StoryExportEnvelopeV2, state: EditorState): StoryExportEnvelopeV2 {
  const originals = bundle.stories;
  const target = originals.find((s) => s.id === state.id);
  if (!target) throw new Error("story missing from bundle");
  const patched: StoryExportItemV2 = {
    ...target,
    category: state.category,
    rarity: state.rarity,
    lock_visibility: state.lock_visibility,
    length_class: state.length_class,
    historical_confidence: state.historical_confidence,
    snapshot_tier: state.snapshot_tier,
    production_status: state.production_status,
    tags: [...state.tags],
    story_collection_id: state.story_collection_id,
    collection_order: state.collection_order,
    hijri_start_year: state.time.hijri_start_year,
    hijri_start_month: state.time.hijri_start_month,
    hijri_start_day: state.time.hijri_start_day,
    hijri_end_year: state.time.hijri_end_year,
    hijri_end_month: state.time.hijri_end_month,
    hijri_end_day: state.time.hijri_end_day,
    gregorian_start: state.time.gregorian_start,
    gregorian_end: state.time.gregorian_end,
    time_precision: state.time.time_precision,
    unlock_spec: state.unlock_spec,
    relations: state.relations.map((r) => ({
      id: r.id,
      target_type: r.target_type,
      target_id: r.target_id,
      target_extra: r.target_extra ?? {},
      role: r.role,
      notes: r.notes,
      display_order: r.display_order,
      metadata: r.metadata ?? {},
    })),
    sources: state.sources.map((s) => ({
      id: s.id, source_key: s.source_key, kind: s.kind,
      citation: s.citation, title: s.title, author: s.author,
      year: s.year, page: s.page, url: s.url, weight: s.weight,
      notes: s.notes, display_order: s.display_order,
    })),
  };
  return { ...bundle, stories: [patched] };
}

function StoryV2EditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<StoryExportEnvelopeV2 | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [preview, setPreview] = useState<StoryImportPreviewReportV2 | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const dirtyRef = useRef(false);

  const notify = (kind: Toast["kind"], msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 3800);
  };

  const load = async () => {
    setErr(null);
    try {
      const b = await adminExportStoriesV2([id]);
      if (!b.stories.length) { setErr("القصة غير موجودة."); return; }
      setBundle(b);
      setState(toEditorState(b.stories[0]));
      dirtyRef.current = false;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, [id]);
  useEffect(() => { void listCollections().then(setCollections).catch(() => { /* non-fatal */ }); }, []);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const update = (patch: Partial<EditorState>) => {
    setState((prev) => (prev ? { ...prev, ...patch } : prev));
    dirtyRef.current = true;
    setPreview(null); // invalidate stale validation
  };

  const runPreview = async (): Promise<StoryImportPreviewReportV2 | null> => {
    if (!bundle || !state) return null;
    setPreviewBusy(true); setPreviewErr(null);
    try {
      const env = buildEnvelope(bundle, state);
      const rep = await adminImportStoriesV2Preview(env, { allow_deletes: true });
      setPreview(rep);
      return rep;
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setPreviewBusy(false);
    }
  };

  const save = async () => {
    if (!bundle || !state) return;
    setSaveBusy(true);
    try {
      const rep = preview?.ok ? preview : await runPreview();
      if (!rep || !rep.ok) { notify("err", "التحقق فشل. لم يُكتب شيء."); return; }
      const env = buildEnvelope(bundle, state);
      const res = await adminImportStoriesV2Apply(env, { allow_deletes: true });
      if (!res.ok) {
        setPreview(res.preview);
        notify("err", "رفض الخادم الحزمة عند التطبيق.");
        return;
      }
      const item = res.items[0];
      notify("ok", `تم الحفظ: ${item?.action ?? "ok"} — أُنشئت ${res.totals.created} / حُدِّثت ${res.totals.updated} / بلا تغيير ${res.totals.unchanged}.`);
      dirtyRef.current = false;
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
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
  if (!state || !bundle) {
    return <div dir="rtl" className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> جاري التحميل...</div>;
  }

  const activeStory = bundle.stories[0];

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-4 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to="/admin/stories" className="rounded-md border p-1.5 hover:bg-muted">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-[11px] text-muted-foreground">
              محرر v2 · slug: <span className="font-mono">{state.slug}</span> · حالة: {activeStory.status}
            </div>
            <h1 className="text-lg font-semibold">{activeStory.title_ar}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/stories/$id/edit" params={{ id: state.id }}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <Pencil className="h-4 w-4" /> محرر P3 (مشاهد/غلاف)
          </Link>
          <Link to="/story/$id" params={{ id: state.id }} target="_blank"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <ExternalLink className="h-4 w-4" /> صفحة اللاعب
          </Link>
          <button
            onClick={() => void runPreview()}
            disabled={previewBusy}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            {previewBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            تحقق
          </button>
          <button
            onClick={() => void save()}
            disabled={saveBusy || previewBusy}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
            {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ (transactional)
          </button>
        </div>
      </header>

      {/* Classification */}
      <section className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-3">
        <SelectField label="التصنيف (category)" value={state.category}
          options={STORY_CATEGORY.map((c) => [c, STORY_CATEGORY_LABEL[c]])}
          onChange={(v) => update({ category: v as StoryCategory })} />
        <SelectField label="الندرة (rarity)" value={state.rarity}
          options={STORY_RARITY.map((c) => [c, STORY_RARITY_LABEL[c]])}
          onChange={(v) => update({ rarity: v as StoryRarity })} />
        <SelectField label="طول القصة (length_class)" value={state.length_class}
          options={STORY_LENGTH_CLASS.map((c) => [c, STORY_LENGTH_CLASS_LABEL[c]])}
          onChange={(v) => update({ length_class: v as StoryLengthClass })} />
        <SelectField label="ظهور القفل (lock_visibility)" value={state.lock_visibility}
          options={STORY_LOCK_VISIBILITY.map((c) => [c, STORY_LOCK_VISIBILITY_LABEL[c]])}
          onChange={(v) => update({ lock_visibility: v as StoryLockVisibility })} />
        <SelectField label="الثقة التاريخية (historical_confidence)" value={state.historical_confidence}
          options={STORY_HISTORICAL_CONFIDENCE.map((c) => [c, STORY_HISTORICAL_CONFIDENCE_LABEL[c]])}
          onChange={(v) => update({ historical_confidence: v as StoryHistoricalConfidence })} />
        <SelectField label="مستوى اللقطة (snapshot_tier)" value={state.snapshot_tier}
          options={STORY_SNAPSHOT_TIER.map((c) => [c, STORY_SNAPSHOT_TIER_LABEL[c]])}
          onChange={(v) => update({ snapshot_tier: v as StorySnapshotTier })} />
        <SelectField label="حالة الإنتاج (production_status)" value={state.production_status}
          options={STORY_PRODUCTION_STATUS.map((c) => [c, STORY_PRODUCTION_STATUS_LABEL[c]])}
          onChange={(v) => update({ production_status: v as StoryProductionStatus })} />
        <div className="md:col-span-2">
          <div className="mb-1 text-xs text-muted-foreground">الوسوم (tags)</div>
          <TagsEditor tags={state.tags} onChange={(tags) => update({ tags })} />
        </div>
      </section>

      {/* Collection */}
      <section className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-3">
        <label className="block text-xs md:col-span-2">
          المجموعة (story_collection_id)
          <select
            value={state.story_collection_id ?? ""}
            onChange={(e) => update({
              story_collection_id: e.target.value || null,
              collection_order: e.target.value ? (state.collection_order ?? 0) : null,
            })}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">— بدون مجموعة —</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.title_ar} <span dir="ltr">({c.slug})</span></option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          ترتيب داخل المجموعة (collection_order)
          <input
            type="number"
            disabled={!state.story_collection_id}
            value={state.collection_order ?? ""}
            onChange={(e) => update({ collection_order: e.target.value === "" ? null : Math.trunc(Number(e.target.value)) })}
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-50"
          />
        </label>
      </section>

      {/* Time */}
      <section className="rounded-lg border p-4">
        <TimeEditor value={state.time} onChange={(time) => update({ time })} />
      </section>

      {/* Unlock */}
      <section className="rounded-lg border p-4">
        <UnlockBuilder spec={state.unlock_spec} onChange={(unlock_spec) => update({ unlock_spec })} />
      </section>

      {/* Relations */}
      <section className="rounded-lg border p-4">
        <RelationsEditor items={state.relations} onChange={(relations) => update({ relations })} />
      </section>

      {/* Sources */}
      <section className="rounded-lg border p-4">
        <SourcesEditor items={state.sources} onChange={(sources) => update({ sources })} />
      </section>

      {/* Validation panel */}
      <ValidationPanel
        running={previewBusy}
        preview={preview}
        error={previewErr}
        onValidate={() => void runPreview()}
      />

      {toast && (
        <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-md ${
          toast.kind === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
          : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}>
          {toast.kind === "ok" ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
