// ============================================================
// Stories — unified summary (P4.1)
// ------------------------------------------------------------
// One RPC (`list_stories_v2`) powers Home rail, Worlds section,
// entity Related Stories, and story-completion recommendations.
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import { evaluateStoryUnlock, isAlwaysUnlockSpec } from "./unlock/local";
import { buildGuestEvidence, guestUnlockState } from "./unlock/guest-evidence";
import { isCampaignIntroRow, introStoryIdsFromCampaigns } from "./library-filter";


export type StoryPrereqKind =
  | "campaign_completed"
  | "investigation_completed"
  | "story_completed"
  | "entity_discovered";

export interface StoryPrereq {
  kind: StoryPrereqKind;
  ref: string;
  title: string | null;
  satisfied: boolean;
}

export type StoryCategory =
  | "event" | "character" | "city" | "landmark" | "battle"
  | "artifact" | "document" | "daily_life" | "analysis" | "alternate_history";

export type StoryRarity = "standard" | "featured" | "rare" | "legendary";
export type StoryLengthClass = "short" | "standard" | "epic";

export interface StorySummary {
  story_collection_id: string | null;
  collection_order: number | null;
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
  /** Editorial taxonomy — surfaced by `_story_redact_summary_v2`. */
  category: StoryCategory | null;
  rarity: StoryRarity | null;
  length_class: StoryLengthClass | null;
  historical_confidence: string | null;
  tags: string[];
  prereqs: StoryPrereq[];
  /** Authored, player-facing reason a locked story is locked (visible locks). */
  lock_explanation: string | null;
  unlocked: boolean;
  completed: boolean;
  progress: {
    last_scene_index: number;
    max_scene_index_reached: number;
  } | null;
}

// Campaign cinematic intros are authored as stories so they can reuse the
// story renderer, but they are NOT library content — they only ever play at
// the start of their campaign. Server truth: `story_is_campaign_intro(...)`
// already removes them from `list_stories_v3` / `list_stories_guest_v3`.
// The client predicate below is the offline mirror of that rule.
export { CAMPAIGN_INTRO_TAG } from "./library-filter";





export async function listStoriesSummary(
  worldSlug?: string | null,
): Promise<StorySummary[]> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const uid = await currentUid();
  if (online) {
    // GUEST: the device is the unlock authority. `list_stories_guest_v3`
    // is the anon-only mirror of the authoritative RPC — the server still
    // renders the catalog, but `unlocked` is decided from local evidence,
    // so a signed-out player gets the exact same progression experience.
    const { data, error } = uid
      ? await supabase.rpc("list_stories_v2" as never, {
          p_world_slug: worldSlug ?? null,
        } as never)
      : await supabase.rpc("list_stories_guest_v3" as never, {
          p_world_slug: worldSlug ?? null,
          p_collection_id: null,
          p_evidence: buildGuestEvidence(),
        } as never);

    if (error) {
      // Online but the authoritative RPC failed: DO NOT fall back to the
      // local snapshot. Falling back would re-surface stale/legacy story
      // rows and create ghost cards on Home. Surface the error so React
      // Query treats it as a failure and callers show empty state.
      throw new Error(error.message);
    }
    // Normalise the editorial taxonomy so filters never see undefined/null
    // shapes coming from either the authoritative or the guest RPC.
    const rows = ((data ?? []) as StorySummary[])
      .filter((r) => !isCampaignIntroRow(r as never))
      .map((r) => ({
        ...r,
        category: r.category ?? null,
        rarity: r.rarity ?? null,
        length_class: r.length_class ?? null,
        historical_confidence: r.historical_confidence ?? null,
        tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === "string") : [],
        story_collection_id: r.story_collection_id ?? null,
        collection_order: r.collection_order ?? null,
      }));

    if (!worldSlug) {
      void (async () => {
        try {
          const { pruneStoriesToAuthoritative } = await import("@/lib/local-first-store");
          pruneStoriesToAuthoritative(rows.map((r) => r.id));
        } catch { /* ignore */ }
      })();
    }
    if (uid) {
      void (async () => {
        try {
          const { loadUnlockedIds, persistUnlockedIds } = await import("./unlock-cache");
          const prev = await loadUnlockedIds(uid);
          for (const r of rows) if (r.unlocked) prev.add(r.id);
          if (!worldSlug) {
            const authoritative = new Set(rows.filter((r) => r.unlocked).map((r) => r.id));
            for (const id of [...prev]) if (!authoritative.has(id) && rows.find((r) => r.id === id)) prev.delete(id);
          }
          await persistUnlockedIds(uid, prev);
        } catch { /* ignore */ }
      })();
    }
    return rows;
  }
  // Offline fallback: synthesize catalog entries from the local snapshot.
  // Unlocked flag uses the signed unlock cache so previously-unlocked
  // stories remain playable; new unlocks NEVER happen offline.
  try {
    const {
      ensureLocalSnapshotLoaded,
      localStoriesAll,
      localStoryScenes,
      localPublishedCampaigns,
    } = await import("@/lib/local-first-store");
    await ensureLocalSnapshotLoaded();
    const { loadUnlockedIds } = await import("./unlock-cache");
    const unlockedIds = uid ? await loadUnlockedIds(uid) : new Set<string>();
    // Guest: the device is the authority, so offline unlocks are evaluated
    // locally against the same evidence the online guest RPC receives.
    const guestState = uid ? null : guestUnlockState();
    // The snapshot intentionally ships campaign intro rows (the intro player
    // reads them offline), so the library feed filters them out here.
    const introIds = introStoryIdsFromCampaigns(localPublishedCampaigns());
    const all = localStoriesAll()
      .filter((s: any) => !worldSlug || s.world_slug === worldSlug)
      .filter((s: any) => !isCampaignIntroRow(s, introIds))
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));

    return all.map((s: any) => {
      const alwaysOn = isAlwaysUnlockSpec(s.unlock_spec);
      const guestUnlocked = guestState
        ? evaluateStoryUnlock({ unlock_spec: s.unlock_spec }, guestState)
        : false;

      return ({
        id: s.id,
        slug: s.slug,
        title_ar: s.title_ar,
        title_en: s.title_en ?? null,
        summary_ar: s.summary_ar ?? null,
        summary_en: s.summary_en ?? null,
        world_slug: s.world_slug ?? null,
        era: s.era ?? null,
        display_order: s.display_order ?? 0,
        xp_reward: s.xp_reward ?? 0,
        dinar_reward: s.dinar_reward ?? 0,
        cover_media_id: s.cover_media_id ?? null,
        content_version: s.content_version ?? 1,
        published_at: s.published_at ?? null,
        scene_count: localStoryScenes(String(s.id)).length,
        category: s.category ?? null,
        rarity: s.rarity ?? null,
        length_class: s.length_class ?? null,
        historical_confidence: s.historical_confidence ?? null,
        tags: Array.isArray(s.tags) ? s.tags.filter((t: unknown) => typeof t === "string") : [],
        prereqs: [],
        story_collection_id: s.story_collection_id ?? null,
        collection_order: s.collection_order ?? null,
        lock_explanation: s.lock_explanation ?? null,
        unlocked: alwaysOn || guestUnlocked || unlockedIds.has(s.id),
        completed: guestState ? guestState.completed_story_ids?.has(s.id) ?? false : false,
        progress: null,
      } as StorySummary);
    });
  } catch {
    return [];
  }
}

async function currentUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch { return null; }
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
    case "entity_discovered":       return "اكتشاف في الموسوعة";
  }
}
