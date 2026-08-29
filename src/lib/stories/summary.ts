import { recordTrace } from "@/lib/diag-trace";
// ============================================================
// Stories — unified summary (P4.1)
// ------------------------------------------------------------
// One RPC (`list_stories_v2`) powers Home rail, Worlds section,
// entity Related Stories, and story-completion recommendations.
// ============================================================

import { supabase } from "@/integrations/supabase/client";

import { evaluateStoryRowUnlock, isStoryRowAlwaysUnlocked } from "./unlock/story-row";
import type { PlayerUnlockState } from "./unlock/local";
import { buildGuestEvidence, guestUnlockState } from "./unlock/guest-evidence";

import { isCampaignIntroRow } from "./library-filter";
import { getActiveUserId } from "../identity/owner";

const inflightSummary = new Map<string, Promise<StorySummary[]>>();



export type StoryPrereqKind =
  | "campaign_completed"
  | "campaign_chapter_complete"
  | "investigation_completed"
  | "story_completed"
  | "entity_discovered"
  | "entities_discovered"
  | "artifact_owned"
  | "atlas_location_visited"
  | "achievement_unlocked"
  | "player_level"
  | "date_window";

export interface StoryPrereq {
  kind: StoryPrereqKind | (string & {});
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
  /**
   * Provenance of this row. `server` = authoritative RPC result,
   * `local` = offline/bundled fallback. Unlock celebrations may only
   * observe `server` rows (V16 regression fix #3).
   */
  source?: "server" | "local";
}

// Campaign cinematic intros are authored as stories so they can reuse the
// story renderer, but they are NOT library content — they only ever play at
// the start of their campaign. Server truth: `story_is_campaign_intro(...)`
// already removes them from `list_stories_v3` / `list_stories_guest_v3`.
// The client predicate below is the offline mirror of that rule.
export { CAMPAIGN_INTRO_TAG } from "./library-filter";





/**
 * V16 — Home Stories are LOCAL FIRST.
 *
 * The rail must paint from bundled/local content on the first frame even in
 * airplane mode with a clean install. The authoritative RPC is an ENHANCEMENT
 * that runs with a short timeout; if it hangs, fails, or `navigator.onLine`
 * lies (Android WebView reports `true` in airplane mode), the local catalog
 * is returned instead. The rail is never hidden because of the network.
 */
export const STORY_SUMMARY_RPC_TIMEOUT_MS = 2500;

/**
 * V16 — ONE LOCAL UNLOCK SEMANTIC.
 *
 * The ONLY place local/offline story-card unlock state is decided:
 *
 *   unlocked = alwaysOn
 *            || canonicalLocalEvaluation(unlock_spec, evidenceState)
 *            || serverConfirmedFloor
 *
 * The SAME `unlock_spec`, the SAME evaluator and the SAME `evidenceState`
 * also drive `deriveStoryPrereqs`, so the card and the locked dialog can
 * never contradict each other.
 *
 * Invariants:
 *   • fail closed — a row without an `unlock_spec` KEY is NEVER unlocked;
 *   • progress / the progress mirror / resume state are NOT evidence;
 *   • the signed unlock cache is a last-known SERVER-CONFIRMED display
 *     floor only — player access still goes through `get_story_bundle_v2`.
 */
export function resolveLocalUnlocked(
  row: unknown,
  evidenceState: PlayerUnlockState,
  serverConfirmedIds?: ReadonlySet<string> | null,
): boolean {
  if (isStoryRowAlwaysUnlocked(row)) return true;
  if (evaluateStoryRowUnlock(row, evidenceState)) return true;
  const id = (row as { id?: unknown } | null)?.id;
  return !!serverConfirmedIds && typeof id !== "undefined" && serverConfirmedIds.has(String(id));
}



export async function buildLocalStorySummaries(
  worldSlug?: string | null,
  uid?: string | null,
): Promise<StorySummary[]> {
  try {
    const {
      getLocalLibraryStories,
      getLocalSceneCount,
      isBaselineInMemory,
      getBaselineContent,
    } = await import("@/lib/offline-baseline-resolver");

    let rows = getLocalLibraryStories();
    if (rows.length === 0 && !isBaselineInMemory()) {
      // Nothing indexed yet and the bundled baseline was never parsed:
      // parse it now (memory only — no IndexedDB wait).
      await getBaselineContent();
      rows = getLocalLibraryStories();
    }

    const { loadUnlockedIds } = await import("./unlock-cache");
    const unlockedIds = uid ? await loadUnlockedIds(uid) : new Set<string>();
    // Guest: the device is the authority, so offline unlocks are evaluated
    // locally against the same evidence the online guest RPC receives.
    const guestState = uid ? null : guestUnlockState();

    // V16 — signed-in local fallback: read the READ-ONLY progress mirror of
    // the last authoritative response so previously read/completed stories
    // never flash as "جديدة" during a cold start. Never a write path.
    const { readMirror } = await import("./progress-mirror");
    const mirror = uid ? readMirror(uid) : null;

    // Evidence used ONLY to explain lock requirements (never to unlock).
    const evidenceState = guestState ?? (uid ? await authedEvidenceState(uid, mirror) : {});
    const { deriveStoryPrereqs } = await import("./unlock/derive-prereqs");
    const { defaultLocalTitleResolver } = await import("./unlock/local-titles");
    const resolveTitle = await defaultLocalTitleResolver();

    const all = rows
      .filter((s: any) => !worldSlug || s.world_slug === worldSlug)
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0));

    return all.map((s: any) => {
      const unlocked = resolveLocalUnlocked(s, evidenceState, unlockedIds);

      const cached = mirror?.entries?.[String(s.id)] ?? null;



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
        scene_count: getLocalSceneCount(String(s.id)),
        category: s.category ?? null,
        rarity: s.rarity ?? null,
        length_class: s.length_class ?? null,
        historical_confidence: s.historical_confidence ?? null,
        tags: Array.isArray(s.tags) ? s.tags.filter((t: unknown) => typeof t === "string") : [],
        // Real requirements derived from the packaged `unlock_spec` — only
        // meaningful while the story is still locked.
        prereqs: unlocked ? [] : deriveStoryPrereqs(s, evidenceState, resolveTitle),
        story_collection_id: s.story_collection_id ?? null,
        collection_order: s.collection_order ?? null,
        lock_explanation: s.lock_explanation ?? null,
        unlocked,
        completed: guestState
          ? guestState.completed_story_ids?.has(s.id) ?? false
          : cached?.completed ?? false,
        // PROGRESS NEVER GRANTS ACCESS. It is preserved for display
        // (`storyState` still reports "locked" for a locked row, and the
        // player CTA is authorised by `get_story_bundle_v2`), so a cold
        // start with incomplete local evidence cannot erase real progress.
        progress:
          cached && (cached.lastSceneIndex != null || cached.maxSceneIndexReached != null)
            ? {
                last_scene_index: cached.lastSceneIndex ?? 0,
                max_scene_index_reached: cached.maxSceneIndexReached ?? cached.lastSceneIndex ?? 0,
              }
            : null,


        // Local fallback rows are NOT authoritative: unlock celebrations
        // must never be derived from them.
        source: "local",
      } as StorySummary);
    });

  } catch {
    return [];
  }
}

/**
 * Local evidence for a SIGNED-IN player, used only to mark derived
 * prerequisites as satisfied/unsatisfied. Missing evidence stays
 * unsatisfied — never guessed.
 */
async function authedEvidenceState(
  uid: string,
  mirror: { entries?: Record<string, { completed: boolean }> } | null,
): Promise<PlayerUnlockState> {
  const completedStories = new Set<string>();
  for (const [id, e] of Object.entries(mirror?.entries ?? {})) {
    if (e?.completed) completedStories.add(id);
  }
  const discovered = new Set<string>();
  try {
    const { getLocalDiscoveries } = await import("@/lib/entityDiscoveries");
    for (const d of Object.values(getLocalDiscoveries(uid) ?? {})) {
      if ((d as any)?.id) discovered.add(String((d as any).id));
    }
  } catch { /* no local discoveries */ }
  const campaigns = new Set<string>();
  try {
    const { localCompletedIds } = await import("@/lib/campaigns/completions");
    for (const id of localCompletedIds()) campaigns.add(id);
  } catch { /* ignore */ }

  return {
    completed_story_ids: completedStories,
    completed_campaign_ids: campaigns,
    discovered_entity_ids: discovered,
    visited_atlas_location_ids: discovered,
    owned_artifact_ids: discovered,
  };
}


export async function listStoriesSummary(
  worldSlug?: string | null,
): Promise<StorySummary[]> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const uid = await currentUid();

  if (!online) return buildLocalStorySummaries(worldSlug, uid);

  const key = `${uid ?? "guest"}:${worldSlug ?? ""}`;
  const existing = inflightSummary.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      // GUEST: the device is the unlock authority. `list_stories_guest_v3`
      // is the anon-only mirror of the authoritative RPC — the server still
      // renders the catalog, but `unlocked` is decided from local evidence,
      // so a signed-out player gets the exact same progression experience.
      const rpc = uid
        ? supabase.rpc("list_stories_v2" as never, {
            p_world_slug: worldSlug ?? null,
          } as never)
        : supabase.rpc("list_stories_guest_v3" as never, {
            p_world_slug: worldSlug ?? null,
            p_collection_id: null,
            p_evidence: buildGuestEvidence(),
          } as never);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), STORY_SUMMARY_RPC_TIMEOUT_MS);
      });
      let settled: any;
      try {
        settled = await Promise.race([Promise.resolve(rpc), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }

      // STALE CHECK: Identity changed while request was in-flight.
      if (getActiveUserId() !== uid) {
        return [];
      }

      if (settled === "timeout" || settled?.error || !settled?.data) {
        // Network is unavailable, lying, or slow: local content wins.
        return buildLocalStorySummaries(worldSlug, uid);
      }

      const data = settled.data;
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
          source: "server" as const,
        }));

      if (rows.length === 0) return buildLocalStorySummaries(worldSlug, uid);

      if (!worldSlug) {
        void (async () => {
          try {
            const { pruneStoriesToAuthoritative } = await import("@/lib/local-first-store");
            pruneStoriesToAuthoritative(rows.map((r) => r.id));
          } catch { /* ignore */ }
        })();
      }
      if (uid) {
        // V16 — hydrate the READ-ONLY local mirror from the authoritative
        // response. Never uploaded, never a write path.
        try {
          const { mergeAuthoritativeRows } = await import("./progress-mirror");
          mergeAuthoritativeRows(uid, rows as never);
        } catch { /* cache only */ }
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
    } catch {
      return buildLocalStorySummaries(worldSlug, uid);
    } finally {
      inflightSummary.delete(key);
    }
  })();

  inflightSummary.set(key, promise);
  return promise;
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
  // V16 — completion is HISTORICAL player progress. A temporarily
  // incomplete local unlock evaluation (cold start, missing evidence)
  // must never erase a story the player has already finished.
  if (s.completed) return "completed";
  if (!s.unlocked) return "locked";
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

export function labelPrereqKind(k: StoryPrereqKind | (string & {})): string {
  switch (k) {
    case "campaign_completed":         return "إتمام حملة";
    case "campaign_chapter_complete":  return "إتمام فصل حملة";
    case "investigation_completed":    return "إتمام تحقيق";
    case "story_completed":            return "إتمام قصة";
    case "entity_discovered":          return "اكتشاف في الموسوعة";
    case "entities_discovered":        return "اكتشافات في الموسوعة";
    case "artifact_owned":             return "امتلاك مقتنى";
    case "atlas_location_visited":     return "زيارة موقع في الأطلس";
    case "achievement_unlocked":       return "فتح إنجاز";
    case "player_level":               return "بلوغ المستوى";
    case "date_window":                return "متاح في فترة محددة";
    default:                           return "متطلب";
  }
}

