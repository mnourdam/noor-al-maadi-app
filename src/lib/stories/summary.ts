// ============================================================
// Stories — unified summary (P4.1)
// ------------------------------------------------------------
// One RPC (`list_stories_v2`) powers Home rail, Worlds section,
// entity Related Stories, and story-completion recommendations.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

export type StoryPrereqKind =
  | "campaign_completed"
  | "investigation_completed"
  | "story_completed";

export interface StoryPrereq {
  kind: StoryPrereqKind;
  ref: string;
  title: string | null;
  satisfied: boolean;
}

export interface StorySummary {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  summary_ar: string | null;
  summary_en: string | null;
  world_slug: string | null;
  era: string | null;
  display_order: number;
  xp_reward: number;
  dinar_reward: number;
  cover_media_id: string | null;
  content_version: number;
  published_at: string | null;
  scene_count: number;
  prereqs: StoryPrereq[];
  unlocked: boolean;
  completed: boolean;
  progress: {
    last_scene_index: number;
    max_scene_index_reached: number;
  } | null;
}

export async function listStoriesSummary(
  worldSlug?: string | null,
): Promise<StorySummary[]> {
  const { data, error } = await supabase.rpc("list_stories_v2" as never, {
    p_world_slug: worldSlug ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as StorySummary[];
}

/** 45s per scene, min 1 minute — deterministic, no scene body loads. */
export function estimateReadingMinutes(sceneCount: number): number {
  const seconds = Math.max(60, sceneCount * 45);
  return Math.max(1, Math.ceil(seconds / 60));
}

export function progressFraction(s: StorySummary): number {
  if (s.completed) return 1;
  if (!s.progress || s.scene_count <= 0) return 0;
  const reached = s.progress.max_scene_index_reached ?? 0;
  return Math.min(1, (reached + 1) / s.scene_count);
}

export type StoryState = "locked" | "new" | "in_progress" | "completed";
export function storyState(s: StorySummary): StoryState {
  if (!s.unlocked) return "locked";
  if (s.completed) return "completed";
  if (s.progress) return "in_progress";
  return "new";
}

/** Home rail: prioritise resume → newly unlocked → completed → locked. */
export function pickHomeStories(all: StorySummary[], limit = 6): StorySummary[] {
  const inProg = all.filter((s) => s.unlocked && !s.completed && s.progress);
  const fresh  = all.filter((s) => s.unlocked && !s.completed && !s.progress);
  const done   = all.filter((s) => s.completed);
  const locked = all.filter((s) => !s.unlocked);
  return [...inProg, ...fresh, ...done, ...locked].slice(0, limit);
}

export function pickNextStory(
  all: StorySummary[],
  justFinishedId: string,
): StorySummary | null {
  const finished = all.find((s) => s.id === justFinishedId);
  const pool = all.filter(
    (s) => s.id !== justFinishedId && s.unlocked && !s.completed,
  );
  if (pool.length === 0) return null;
  if (finished?.world_slug) {
    const same = pool.filter((s) => s.world_slug === finished.world_slug);
    if (same.length > 0) return same[0];
  }
  return pool[0];
}

export function labelPrereqKind(k: StoryPrereqKind): string {
  switch (k) {
    case "campaign_completed":      return "إتمام حملة";
    case "investigation_completed": return "إتمام تحقيق";
    case "story_completed":         return "إتمام قصة";
  }
}
