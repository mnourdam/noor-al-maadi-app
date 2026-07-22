// ============================================================
// Stories — local normalization contracts (P1)
// ------------------------------------------------------------
// Shared TS shape for stories, scenes and progress. UI layers
// (added in later phases) MUST read through these types so the
// server payloads and local snapshot stay compatible.
// ============================================================

export type StoryStatus = "draft" | "published" | "archived";

export type StorySceneType =
  | "reading"
  | "perspective"
  | "document"
  | "reveal"
  | "reflection";

export interface UnlockSpec {
  type:
    | "always"
    | "and"
    | "or"
    | "campaign_completed"
    | "investigation_completed"
    | "story_completed";
  children?: UnlockSpec[];
  campaign_id?: string;
  investigation_id?: string;
  story_id?: string;
}

export interface StoryRow {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  world_slug: string | null;
  era: string | null;
  display_order: number;
  status: StoryStatus;
  content_version: number;
  unlock_spec: UnlockSpec;
  cover_media_id: string | null;
  xp_reward: number;
  dinar_reward: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface StorySceneRow {
  id: string;
  story_id: string;
  scene_index: number;
  scene_type: StorySceneType;
  title_ar: string | null;
  title_en: string | null;
  payload: Record<string, unknown>;
  primary_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryProgressRow {
  user_id: string;
  story_id: string;
  last_scene_index: number;
  max_scene_index_reached: number;
  content_version_seen: number;
  created_at: string;
  updated_at: string;
}

export interface StoryCompletionRow {
  user_id: string;
  story_id: string;
  first_completed_at: string;
  content_version_at_completion: number;
  reward_delta_id: string;
  reward_xp: number;
  reward_dinars: number;
}

export interface StoryAccessBundle {
  ok: boolean;
  reason?: string;
  story?: StoryRow;
  scenes?: StorySceneRow[];
  progress?: StoryProgressRow | null;
  completed?: boolean;
}

export interface StoryCompletionResult {
  ok: boolean;
  reason?: string;
  first_completion?: boolean;
  first_completed_at?: string;
  reward_delta_id?: string;
  reward_granted_xp?: number;
  reward_granted_dinars?: number;
  content_version_at_completion?: number;
}
