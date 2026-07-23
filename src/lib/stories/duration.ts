// ============================================================
// Stories — canonical viewing-duration model (Phase 3).
// ------------------------------------------------------------
// Single source of truth for the "how long is this story?"
// number surfaced on every pre-play surface (Home rail, /stories
// catalog, World section, Related rail, Continue Your Journey,
// player intro).
//
// The formula MUST mirror the cinematic runtime contract in
// `src/components/stories/player/timing.ts` and `StoryPlayer`:
//
//   total_ms = INTRO_HOLD_MS
//            + Σ scene_ms(scene)                     // per scene
//            + (scene_count - 1) * TRANSITION_MS     // cross-fades
//            + REWARD_HOLD_MS                        // final beat
//
// where scene_ms(scene) is:
//   - reflection / interaction  → NOMINAL_REFLECTION_MS (catalog only;
//                                 the actual player waits for the user)
//   - all other scene types     → sceneDwellMs(scene)  (identical to
//                                 the runtime auto-advance timer)
//
// When pre-play surfaces only know `scene_count` (RPC `list_stories_v2`
// does not project full scenes), we fall back to `storyDurationMsFromCount`
// which assumes every scene is a `reading` scene with the documented
// NOMINAL_SENTENCES_PER_SCENE. This is the ONLY approximation permitted
// and it uses the same timing constants as the runtime.
//
// Precedence for the displayed duration (highest wins):
//   1. `storyDurationMsFromScenes(scenes)` when the caller has loaded
//      the scene payload (player intro, admin preview). Authoritative —
//      mirrors the cinematic runtime exactly, so edits to scenes are
//      reflected automatically.
//   2. `storyDurationMsFromCount(sceneCount)` for catalog surfaces
//      where only `scene_count` is known.
//   3. Editorial override — ONLY when `metadata.use_manual_reading_time`
//      is explicitly `true` AND `metadata.reading_time_override_minutes`
//      is a positive number. Without the flag the runtime value always
//      wins, so a stale field can never desync the displayed duration
//      from the real cinematic runtime.
// ============================================================

import {
  INTRO_HOLD_MS,
  REWARD_HOLD_MS,
  TRANSITION_MS,
  NOMINAL_SENTENCES_PER_SCENE,
  NOMINAL_REFLECTION_MS,
  BASE_BY_TYPE,
  SENTENCE_STAGGER_MS,
  SETTLE_MS,
  MIN_DWELL,
  MAX_DWELL,
  sceneDwellMs,
} from "@/components/stories/player/timing";
import type { StorySceneRow } from "@/lib/stories/types";

/** Per-scene runtime cost — mirrors the player's auto-advance timer,
 *  with reflection scenes clamped to a documented nominal budget so
 *  totals don't blow up on pre-play surfaces. */
export function sceneEstimateMs(scene: StorySceneRow): number {
  if (scene.scene_type === "reflection") return NOMINAL_REFLECTION_MS;
  return sceneDwellMs(scene);
}

/** Total duration when the full scene list is available. */
export function storyDurationMsFromScenes(scenes: StorySceneRow[]): number {
  if (!scenes || scenes.length === 0) return INTRO_HOLD_MS + REWARD_HOLD_MS;
  let total = INTRO_HOLD_MS + REWARD_HOLD_MS;
  for (const s of scenes) total += sceneEstimateMs(s);
  total += Math.max(0, scenes.length - 1) * TRANSITION_MS;
  return total;
}

/**
 * Catalog-time estimate — used when only `scene_count` is known.
 * Assumes every scene is a `reading` scene with NOMINAL_SENTENCES_PER_SCENE
 * sentences. Uses the exact same clamp as `sceneDwellMs`.
 */
export function storyDurationMsFromCount(sceneCount: number): number {
  const n = Math.max(0, sceneCount | 0);
  if (n === 0) return INTRO_HOLD_MS + REWARD_HOLD_MS;
  const sents = NOMINAL_SENTENCES_PER_SCENE;
  const raw = BASE_BY_TYPE.reading + sents * SENTENCE_STAGGER_MS + SETTLE_MS;
  const perScene = Math.max(MIN_DWELL, Math.min(MAX_DWELL + sents * 200, raw));
  return INTRO_HOLD_MS + n * perScene + Math.max(0, n - 1) * TRANSITION_MS + REWARD_HOLD_MS;
}

/** Editorial override from `metadata.reading_time_minutes`, in ms. */
export function overrideDurationMs(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.["reading_time_minutes"];
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60_000);
}

/**
 * Resolve the duration to display, honoring the documented precedence.
 * Prefer `scenes` when available; otherwise fall back to `sceneCount`.
 */
export function resolveStoryDurationMs(input: {
  metadata?: Record<string, unknown> | null;
  scenes?: StorySceneRow[] | null;
  sceneCount?: number | null;
}): number {
  const override = overrideDurationMs(input.metadata ?? null);
  if (override !== null) return override;
  if (input.scenes && input.scenes.length > 0) {
    return storyDurationMsFromScenes(input.scenes);
  }
  return storyDurationMsFromCount(input.sceneCount ?? 0);
}

/**
 * Arabic-facing concise label.
 *   < 60s        → "≈ 35 ث"
 *   60–119s      → "≈ دقيقة"
 *   ≥ 120s       → "≈ 2 د"
 */
export function formatDurationArabic(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `≈ ${seconds} ث`;
  if (seconds < 120) return "≈ دقيقة";
  const minutes = Math.round(seconds / 60);
  return `≈ ${minutes} د`;
}
