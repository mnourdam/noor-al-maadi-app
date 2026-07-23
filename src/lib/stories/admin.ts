// ============================================================
// Stories P3 — Admin authoring DAO
// ------------------------------------------------------------
// Thin, typed wrappers around the admin_* RPCs added in the P3
// migration. Every writer here is idempotent: the RPCs upsert on
// stable IDs, so the editor can save the same payload twice
// without producing duplicates.
//
// All calls are RLS-gated to admins. Never invoke from public
// routes.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import type {
  StoryRow,
  StorySceneRow,
  StoryStatus,
  StorySceneType,
  UnlockSpec,
} from "./types";
import type { StoryMediaRow } from "./media/dao";
import type { StoryPublishValidation } from "./media/dao";

export interface AdminStorySummary {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  status: StoryStatus;
  world_slug: string | null;
  era: string | null;
  display_order: number;
  content_version: number;
  xp_reward: number;
  dinar_reward: number;
  cover_media_id: string | null;
  scene_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface AdminStoryBundle {
  story: StoryRow;
  scenes: StorySceneRow[];
  media: StoryMediaRow[];
  hasPreviousDraft: boolean;
  previousDraftAt: string | null;
}

export interface StoryUpsertInput {
  id: string;
  slug: string;
  title_ar: string;
  title_en?: string | null;
  summary_ar?: string | null;
  summary_en?: string | null;
  world_slug?: string | null;
  era?: string | null;
  display_order?: number;
  unlock_spec?: UnlockSpec;
  cover_media_id?: string | null;
  xp_reward?: number;
  dinar_reward?: number;
  metadata?: Record<string, unknown>;
}

export interface SceneUpsertInput {
  id: string;
  story_id: string;
  scene_index: number;
  scene_type: StorySceneType;
  title_ar?: string | null;
  title_en?: string | null;
  payload?: Record<string, unknown>;
  primary_media_id?: string | null;
}

export interface SetStatusResult {
  ok: boolean;
  reason?: string;
  status?: StoryStatus;
  validation?: StoryPublishValidation;
}

function bad(label: string, error: { message: string } | null): never {
  throw new Error(`${label}: ${error?.message ?? "unknown"}`);
}

/** List every story (admins only). */
export async function adminListStories(): Promise<AdminStorySummary[]> {
  const { data, error } = await supabase.rpc("admin_list_stories" as never);
  if (error) bad("adminListStories", error);
  return (data ?? []) as unknown as AdminStorySummary[];
}

/** Fetch a story + its scenes + attached media, for the editor. */
export async function adminGetStoryFull(storyId: string): Promise<AdminStoryBundle | null> {
  const { data, error } = await supabase.rpc(
    "admin_get_story_full" as never,
    { p_story_id: storyId } as never,
  );
  if (error) bad("adminGetStoryFull", error);
  const parsed = data as
    | {
        ok: true;
        story: StoryRow;
        scenes: StorySceneRow[];
        media: StoryMediaRow[];
        has_previous_draft?: boolean;
        previous_draft_at?: string | null;
      }
    | { ok: false; reason: string }
    | null;
  if (!parsed || parsed.ok !== true) return null;
  return {
    story: parsed.story,
    scenes: parsed.scenes,
    media: parsed.media,
    hasPreviousDraft: !!parsed.has_previous_draft,
    previousDraftAt: parsed.previous_draft_at ?? null,
  };
}

/** Restore the last snapshot taken before a publish. Consumes the snapshot. */
export async function adminRestorePreviousDraft(storyId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc(
    "admin_restore_previous_draft" as never,
    { p_story_id: storyId } as never,
  );
  if (error) bad("adminRestorePreviousDraft", error);
  return (data ?? { ok: false, reason: "empty_response" }) as { ok: boolean; reason?: string };
}

/** Insert or update a story draft. */
export async function adminUpsertStory(input: StoryUpsertInput): Promise<StoryRow> {
  const { data, error } = await supabase.rpc(
    "admin_upsert_story" as never,
    { p_payload: input as unknown as Record<string, unknown> } as never,
  );
  if (error) bad("adminUpsertStory", error);
  const parsed = data as { ok: boolean; story?: StoryRow } | null;
  if (!parsed?.ok || !parsed.story) throw new Error("adminUpsertStory: bad response");
  return parsed.story;
}

/** Insert or update one scene. `scene_index` is authoritative — reorder
 *  via `adminReorderStoryScenes` after all scenes exist. */
export async function adminUpsertStoryScene(input: SceneUpsertInput): Promise<StorySceneRow> {
  const { data, error } = await supabase.rpc(
    "admin_upsert_story_scene" as never,
    { p_payload: input as unknown as Record<string, unknown> } as never,
  );
  if (error) bad("adminUpsertStoryScene", error);
  const parsed = data as { ok: boolean; scene?: StorySceneRow } | null;
  if (!parsed?.ok || !parsed.scene) throw new Error("adminUpsertStoryScene: bad response");
  return parsed.scene;
}

/** Remove a scene from a story. */
export async function adminDeleteStoryScene(storyId: string, sceneId: string): Promise<void> {
  const { error } = await supabase.rpc(
    "admin_delete_story_scene" as never,
    { p_story_id: storyId, p_scene_id: sceneId } as never,
  );
  if (error) bad("adminDeleteStoryScene", error);
}

/** Rewrite scene_index for the story from an ordered id list.
 *  Length must match the story's current scene count. */
export async function adminReorderStoryScenes(
  storyId: string,
  orderedIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc(
    "admin_reorder_story_scenes" as never,
    { p_story_id: storyId, p_ordered_ids: orderedIds } as never,
  );
  if (error) bad("adminReorderStoryScenes", error);
}

/** Transition a story between draft / published / archived.
 *  Publishing runs `admin_validate_story_publish` and refuses with
 *  `{ ok:false, reason:'validation_failed', validation:{...} }` on
 *  any issues. Draft and archived transitions are always allowed. */
export async function adminSetStoryStatus(
  storyId: string,
  status: StoryStatus,
): Promise<SetStatusResult> {
  const { data, error } = await supabase.rpc(
    "admin_set_story_status" as never,
    { p_story_id: storyId, p_status: status } as never,
  );
  if (error) bad("adminSetStoryStatus", error);
  return (data ?? { ok: false, reason: "empty_response" }) as SetStatusResult;
}

// ============================================================
// Story delete impact / delete
// ============================================================

export interface StoryDeleteImpactItem {
  id: string;
  slug: string;
  title_ar: string;
  status: StoryStatus;
  scenes: number;
  owned_media: number;
  shared_media: number;
  progress_rows: number;
  completions: number;
  comments: number;
  reactions: number;
}
export interface StoryDeleteImpact {
  items: StoryDeleteImpactItem[];
  totals: {
    stories: number; published: number; draft: number; archived: number;
    scenes: number; owned_media: number; shared_media: number;
    progress: number; completions: number; comments: number; reactions: number;
  };
}
export async function adminStoryDeleteImpact(ids: string[]): Promise<StoryDeleteImpact> {
  const { data, error } = await supabase.rpc(
    "admin_story_delete_impact" as never,
    { p_ids: ids } as never,
  );
  if (error) bad("adminStoryDeleteImpact", error);
  return (data ?? { items: [], totals: {} }) as unknown as StoryDeleteImpact;
}

export type StoryDeleteMode = "archive" | "hard";
export interface StoryDeleteResult {
  ok: boolean;
  reason?: string;
  mode?: StoryDeleteMode;
  progress?: number;
  completions?: number;
  storage?: Array<{ bucket: string; path: string }>;
}
export async function adminDeleteStory(
  storyId: string,
  mode: StoryDeleteMode,
  force = false,
): Promise<StoryDeleteResult> {
  const { data, error } = await supabase.rpc(
    "admin_delete_story" as never,
    { p_story_id: storyId, p_mode: mode, p_force: force } as never,
  );
  if (error) bad("adminDeleteStory", error);
  return (data ?? { ok: false, reason: "empty_response" }) as StoryDeleteResult;
}

// ============================================================
// Slug availability
// ============================================================

export async function adminSlugAvailable(slug: string, ignoreId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "admin_slug_available" as never,
    { p_slug: slug, p_ignore_id: ignoreId ?? null } as never,
  );
  if (error) bad("adminSlugAvailable", error);
  return Boolean(data);
}

// ============================================================
// Export / Import
// ============================================================

export interface StoryExportBundle {
  version: number;
  exported_at: string;
  stories: unknown[];
}
export async function adminExportStories(ids: string[] | null): Promise<StoryExportBundle> {
  const { data, error } = await supabase.rpc(
    "admin_export_stories" as never,
    { p_ids: ids } as never,
  );
  if (error) bad("adminExportStories", error);
  return (data ?? { version: 1, exported_at: "", stories: [] }) as StoryExportBundle;
}

export type ImportKind = "new" | "updated" | "unchanged" | "conflict" | "invalid";
export interface StoryImportPreviewItem {
  id: string | null;
  slug: string | null;
  title_ar: string | null;
  kind: ImportKind;
  issues: string[];
  missing_media: string[];
  scene_count: number;
}
export interface StoryImportPreview { items: StoryImportPreviewItem[]; }

export async function adminImportStoriesPreview(payload: unknown): Promise<StoryImportPreview> {
  const { data, error } = await supabase.rpc(
    "admin_import_stories_preview" as never,
    { p_payload: payload as never } as never,
  );
  if (error) bad("adminImportStoriesPreview", error);
  return (data ?? { items: [] }) as StoryImportPreview;
}

export interface ImportApplyOptions {
  skip_existing?: boolean;
  sync_scenes?: boolean;
  publish?: boolean;
}
export interface StoryImportApplyItem {
  id: string | null;
  ok: boolean;
  action: "created" | "updated" | "skipped" | "error";
  scenes?: number;
  published?: boolean;
  publish?: unknown;
  error?: string;
}
export interface StoryImportApplyResult { items: StoryImportApplyItem[]; }

export async function adminImportStoriesApply(
  payload: unknown,
  options: ImportApplyOptions = {},
): Promise<StoryImportApplyResult> {
  const { data, error } = await supabase.rpc(
    "admin_import_stories_apply" as never,
    { p_payload: payload as never, p_options: options as never } as never,
  );
  if (error) bad("adminImportStoriesApply", error);
  return (data ?? { items: [] }) as StoryImportApplyResult;
}
