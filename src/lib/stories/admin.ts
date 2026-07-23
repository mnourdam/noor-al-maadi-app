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
    | { ok: true; story: StoryRow; scenes: StorySceneRow[]; media: StoryMediaRow[] }
    | { ok: false; reason: string }
    | null;
  if (!parsed || parsed.ok !== true) return null;
  return { story: parsed.story, scenes: parsed.scenes, media: parsed.media };
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
