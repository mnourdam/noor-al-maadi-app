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
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const uid = await currentUid();
  if (online) {
    const { data, error } = await supabase.rpc("list_stories_v2" as never, {
      p_world_slug: worldSlug ?? null,
    } as never);
    if (!error) {
      const rows = (data ?? []) as StorySummary[];
      // Persist the authoritative unlocked set so a subsequent offline
      // session can preserve "already unlocked yesterday" state. We only
      // update the cache when we have both a uid and a non-scoped view
      // (worldSlug === null) OR merge into the existing per-uid set.
      if (uid) {
        void (async () => {
          try {
            const { loadUnlockedIds, persistUnlockedIds } = await import("./unlock-cache");
            const prev = await loadUnlockedIds(uid);
            for (const r of rows) if (r.unlocked) prev.add(r.id);
            // When we know the full catalog (no world filter), we can also
            // trim ids the server no longer marks as unlocked. World-scoped
            // reads only add — they can't authoritatively remove.
            if (!worldSlug) {
              const authoritative = new Set(rows.filter((r) => r.unlocked).map((r) => r.id));
              // Keep the union of "server says unlocked now" AND any id
              // outside this snapshot (defensive; list_stories_v2 already
              // returns every visible row).
              for (const id of [...prev]) if (!authoritative.has(id) && rows.find((r) => r.id === id)) prev.delete(id);
            }
            await persistUnlockedIds(uid, prev);
          } catch { /* ignore */ }
        })();
      }
      return rows;
    }
  }
  // Offline fallback: synthesize catalog entries from the local snapshot.
  // Unlocked flag uses the signed unlock cache so previously-unlocked
  // stories remain playable; new unlocks NEVER happen offline.
  try {
    const {
      ensureLocalSnapshotLoaded,
      localStoriesAll,
      localStoryScenes,
    } = await import("@/lib/local-first-store");
    await ensureLocalSnapshotLoaded();
    const { loadUnlockedIds } = await import("./unlock-cache");
    const unlockedIds = uid ? await loadUnlockedIds(uid) : new Set<string>();
    const all = localStoriesAll()
      .filter((s: any) => !worldSlug || s.world_slug === worldSlug)
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return all.map((s: any) => {
      const alwaysOn = (s.unlock_spec?.type ?? "always") === "always";
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
        prereqs: [],
        // Previously unlocked (online) stays unlocked offline; new unlocks
        // never happen offline. Always-on stories remain a floor.
        unlocked: alwaysOn || unlockedIds.has(s.id),
        completed: false,
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
  }
}
