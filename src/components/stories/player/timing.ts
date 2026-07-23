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
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[\.\!\?؟؛…])\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : (text.trim() ? [text.trim()] : []);
}

/** Extract all sentences from a scene's narrative payload. */
export function sceneSentences(scene: StorySceneRow): string[] {
  const p = scene.payload as Record<string, unknown> | null | undefined;
  if (!p) return [];
  const buckets: unknown[] = [];
  const push = (v: unknown) => { if (v != null) buckets.push(v); };
  push(p["body_ar"]); push(p["body"]);
  push(p["quote_ar"]); push(p["quote"]);
  push(p["truth_ar"]); push(p["truth"]);
  push(p["claim_ar"]); push(p["claim"]);
  push(p["caption_ar"]); push(p["caption"]);
  push(p["transcript_ar"]); push(p["transcript"]);
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

const BASE_BY_TYPE: Record<StorySceneType, number> = {
  reading: 2200,
  perspective: 2600,
  document: 2800,
  reveal: 2600,
  reflection: 60_000, // never used — reflections don't auto-advance
};

/** Per-sentence reveal stagger, ms. */
export const SENTENCE_STAGGER_MS = 900;

/** Post-final-sentence dwell so the reader can breathe. */
const SETTLE_MS = 900;

const MIN_DWELL = 3200;
const MAX_DWELL = 10_000;

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
