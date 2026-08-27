// ============================================================
// Story Player — timing helpers (Phase B Rev 2)
// ------------------------------------------------------------
// Deterministic dwell computation for auto-advance and helpers
// for splitting Arabic narrative into sentences for staggered
// reveal. Reflection scenes are excluded from auto-advance by
// the caller — they always wait for user input.
// ============================================================

import type { StorySceneRow, StorySceneType } from "@/lib/stories/types";

/** Split Arabic (or mixed) prose into individual sentences. */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  // Keep terminators attached; split on runs of . ؟ ! ؛ … followed by space/end.
  // NOTE: no lookbehind — Safari/iOS < 16.4 throws a parse-time SyntaxError
  // ("invalid group specifier name") for `(?<=...)`, which kills the whole bundle.
  const parts = text
    .replace(/\s+/g, " ")
    .replace(/([\.\!\?؟؛…])\s+/g, "$1\u0000")
    .split("\u0000")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : text.trim() ? [text.trim()] : [];
}

/** Extract all sentences from a scene's narrative payload. */
export function sceneSentences(scene: StorySceneRow): string[] {
  const p = scene.payload as Record<string, unknown> | null | undefined;
  if (!p) return [];
  const buckets: unknown[] = [];
  const push = (v: unknown) => {
    if (v != null) buckets.push(v);
  };
  push(p["body_ar"]);
  push(p["body"]);
  push(p["quote_ar"]);
  push(p["quote"]);
  push(p["truth_ar"]);
  push(p["truth"]);
  push(p["claim_ar"]);
  push(p["claim"]);
  push(p["caption_ar"]);
  push(p["caption"]);
  push(p["transcript_ar"]);
  push(p["transcript"]);
  const flat: string[] = [];
  for (const b of buckets) {
    if (Array.isArray(b)) {
      for (const x of b) if (typeof x === "string") flat.push(...splitSentences(x));
    } else if (typeof b === "string") {
      flat.push(...splitSentences(b));
    }
  }
  return flat;
}

// Emotional pacing calibration (Phase 5.5):
//   * document scenes read as slightly more deliberate;
//   * perspective (heavy voice) breathes a beat longer;
//   * reveal lands a hair quicker so the payoff feels crisp.
export const BASE_BY_TYPE: Record<StorySceneType, number> = {
  reading: 2200,
  perspective: 2750,
  document: 3100,
  reveal: 2500,
  reflection: 60_000, // never used — reflections don't auto-advance
};

/** Per-sentence reveal stagger, ms. */
export const SENTENCE_STAGGER_MS = 900;

/** Post-final-sentence dwell so the reader can breathe. */
export const SETTLE_MS = 1050;

export const MIN_DWELL = 3200;
export const MAX_DWELL = 10_000;

// ---- Cinematic runtime constants (single source of truth) ---------------
/**
 * Intro hold before the first scene renders. Retired in Post-Freeze pass:
 * playback opens directly on Scene 1 (the cover already introduces the
 * story on the catalog/landing surfaces). Kept at 0 so any duration
 * arithmetic that still references it remains additive-safe.
 */
export const INTRO_HOLD_MS = 0;
/** Post-completion reward moment before "Continue Your Journey" slides up. */
export const REWARD_HOLD_MS = 3200;

/** Average per-scene cross-fade transition cost (dissolve/paper/blur/calm). */
export const TRANSITION_MS = 500;
/**
 * Nominal sentence count assumed for catalog-time estimation only.
 * The runtime always uses the real payload — this is a documented
 * approximation for pre-play surfaces that have not loaded scenes yet.
 */
export const NOMINAL_SENTENCES_PER_SCENE = 3;
/**
 * Nominal budget for reflection/interaction scenes in pre-play estimates.
 * Runtime still waits for the user — this only prevents ∞ in totals.
 */
export const NOMINAL_REFLECTION_MS = 15_000;

/** Full auto-advance duration for a scene. */
export function sceneDwellMs(scene: StorySceneRow): number {
  const sents = sceneSentences(scene).length;
  const base = BASE_BY_TYPE[scene.scene_type] ?? 2600;
  const raw = base + sents * SENTENCE_STAGGER_MS + SETTLE_MS;
  return Math.max(MIN_DWELL, Math.min(MAX_DWELL + sents * 200, raw));
}

/** Stable per-scene hash for varying Ken Burns direction. */
export function sceneHash(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
