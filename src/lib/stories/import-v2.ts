// ============================================================
// Stories M4 — Importer v2 / Exporter v2 client wrapper
// ------------------------------------------------------------
// Thin typed wrappers around the three new SECURITY DEFINER RPCs
// added by the M4 migration:
//   - admin_export_stories_v2(text[])
//   - admin_import_stories_v2_preview(jsonb, jsonb)
//   - admin_import_stories_v2_apply(jsonb, jsonb)
//
// The M4 pipeline reuses the frozen M1/M2/M3 contracts exactly:
// no new columns, enums, or normalization rules are introduced here.
// Idempotency is enforced server-side (identical canonical shape ⇒
// zero writes) and transactionality is guaranteed by the apply RPC
// (validation runs first; unexpected write failures roll the whole
// call back at the caller-transaction level).
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export const M4_ENVELOPE_VERSION = 2 as const;

// -------------------- Envelope --------------------

export interface StoryExportEnvelopeV2 {
  envelope_version: 2;
  generator: string;
  exported_at: string;
  story_ids: string[];
  stories: StoryExportItemV2[];
  collections: StoryCollectionExportV2[];
  media: StoryMediaExportV2[];
}

export interface StoryExportItemV2 {
  id: string;
  slug: string;
  schema_version: 2;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  world_slug: string | null;
  era: string | null;
  display_order: number;
  status: string;
  unlock_spec: unknown;
  cover_media_id: string | null;
  xp_reward: number;
  dinar_reward: number;
  metadata: Record<string, unknown>;
  category: string;
  rarity: string;
  production_status: string;
  lock_visibility: string;
  historical_confidence: string;
  hijri_start_year: number | null;
  hijri_start_month: number | null;
  hijri_start_day: number | null;
  hijri_end_year: number | null;
  hijri_end_month: number | null;
  hijri_end_day: number | null;
  gregorian_start: string | null;
  gregorian_end: string | null;
  story_collection_id: string | null;
  collection_order: number | null;
  time_precision: string;
  length_class: string;
  tags: string[];
  snapshot_tier: string;
  scenes: StorySceneExportV2[];
  relations: StoryRelationExportV2[];
  sources: StorySourceExportV2[];
}

export interface StorySceneExportV2 {
  id: string;
  scene_index: number;
  scene_type: string;
  schema_version: 2;
  title_ar: string | null;
  title_en: string | null;
  payload: Record<string, unknown>;
  primary_media_id: string | null;
}

export interface StoryRelationExportV2 {
  id: string;
  target_type: string;
  target_id: string;
  target_extra: Record<string, unknown>;
  role: string;
  notes: string | null;
  display_order: number;
  metadata: Record<string, unknown>;
}

export interface StorySourceExportV2 {
  id: string;
  source_key: string;
  kind: string;
  citation: string;
  title: string | null;
  author: string | null;
  year: string | null;
  page: string | null;
  url: string | null;
  weight: number | null;
  notes: string | null;
  display_order: number;
}

export interface StoryCollectionExportV2 {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  cover_media_id: string | null;
  display_order: number;
  metadata: Record<string, unknown>;
}

export interface StoryMediaExportV2 {
  id: string;
  story_id: string | null;
  owner_scope: string;
  collection_id: string | null;
  kind: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  checksum_sha256: string;
  preset: string;
  processing_version: number;
  metadata: Record<string, unknown>;
}

// -------------------- Preview / Apply --------------------

export type PreviewItemKind =
  | "create" | "update" | "unchanged" | "conflict" | "invalid";

export interface PreviewIssue {
  code: string;
  [k: string]: unknown;
}

export interface StoryImportPreviewItemV2 {
  id: string | null;
  slug: string | null;
  title_ar: string | null;
  kind: PreviewItemKind;
  issues: PreviewIssue[];
  scene_count: number;
  relation_count: number;
  source_count: number;
  scene_deletes: string[];
  relation_deletes: string[];
  source_deletes: string[];
}

export interface StoryImportPreviewReportV2 {
  ok: boolean;
  envelope_version: 2;
  totals: Record<PreviewItemKind, number>;
  items: StoryImportPreviewItemV2[];
  options: { allow_deletes: boolean };
  /** Server-side campaign-link validation for campaign_intro stories. */
  intro_link_issues?: PreviewIssue[];
}

export interface StoryImportApplyOptionsV2 {
  /** Delete scenes/relations/sources that are absent from the payload. */
  allow_deletes?: boolean;
  /**
   * Replace media links even when the incoming value is null.
   * Off by default: an omitted cover_media_id / primary_media_id keeps
   * whatever the database already holds.
   */
  clear_media?: boolean;
  /** Explicitly replace a campaign's currently authored intro link. */
  allow_intro_replace?: boolean;
}

export interface StoryImportApplyItemV2 {
  id: string;
  ok: boolean;
  action: "created" | "updated" | "unchanged";
}

export type StoryImportApplyResultV2 =
  | {
      ok: true;
      phase: "apply";
      envelope_version: 2;
      totals: { created: number; updated: number; unchanged: number };
      items: StoryImportApplyItemV2[];
       campaign_intros_linked?: boolean;
    }
  | {
      ok: false;
      phase: "validate";
      preview: StoryImportPreviewReportV2;
    };

// -------------------- Calls --------------------

function bail(label: string, error: { message: string } | null): never {
  throw new Error(`${label}: ${error?.message ?? "unknown"}`);
}

/** Deterministic export bundle. Omit ids to export everything. */
export async function adminExportStoriesV2(
  ids: string[] | null,
): Promise<StoryExportEnvelopeV2> {
  const { data, error } = await supabase.rpc(
    "admin_export_stories_v2" as never,
    { p_ids: ids } as never,
  );
  if (error) bail("adminExportStoriesV2", error);
  return data as unknown as StoryExportEnvelopeV2;
}

/** Preview only. Never writes. */
export async function adminImportStoriesV2Preview(
  payload: unknown,
  options: StoryImportApplyOptionsV2 = {},
): Promise<StoryImportPreviewReportV2> {
  const { data, error } = await supabase.rpc(
    "admin_import_stories_v2_preview" as never,
    { p_payload: payload as never, p_options: options as never } as never,
  );
  if (error) bail("adminImportStoriesV2Preview", error);
  return data as unknown as StoryImportPreviewReportV2;
}

/**
 * Transactional apply.
 * - Validates first; if any invalid or conflict, returns `{ok:false, phase:'validate'}`
 *   with the preview report and performs zero writes.
 * - Otherwise upserts every story in a single call. Any unexpected write
 *   failure raises and rolls the whole batch back at the caller-transaction level.
 * - Stories whose canonical shape already matches the DB are skipped (action:'unchanged').
 */
export async function adminImportStoriesV2Apply(
  payload: unknown,
  options: StoryImportApplyOptionsV2 = {},
): Promise<StoryImportApplyResultV2> {
  const { data, error } = await supabase.rpc(
    "admin_import_stories_v2_apply" as never,
    { p_payload: payload as never, p_options: options as never } as never,
  );
  if (error) bail("adminImportStoriesV2Apply", error);
  return data as unknown as StoryImportApplyResultV2;
}

// -------------------- Deterministic byte helpers --------------------

/**
 * Canonical JSON stringifier used to compute stable bytes / hashes of an
 * export envelope. Sorts object keys lexicographically at every depth
 * and drops the volatile `exported_at` timestamp so bundle bytes are
 * comparable across runs (round-trip proof).
 */
export function canonicalJsonBytes(bundle: StoryExportEnvelopeV2): string {
  const stripped: Omit<StoryExportEnvelopeV2, "exported_at"> = {
    envelope_version: bundle.envelope_version,
    generator: bundle.generator,
    story_ids: [...bundle.story_ids].sort(),
    stories: bundle.stories,
    collections: bundle.collections,
    media: bundle.media,
  };
  return stableStringify(stripped);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (value as Record<string, unknown>)[k],
        )}`,
    )
    .join(",")}}`;
}
