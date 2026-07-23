// ============================================================
// Stories P2 — Processing presets
// ------------------------------------------------------------
// A preset is a stable identifier for the (dimension cap, size
// target, encoder settings) used to produce a `story_media` row.
// The identifier is written to `story_media.preset` and never
// re-interpreted — treat it as opaque outside this file.
//
// New behaviour ships as a new preset id + a bumped
// `processing_version`. Existing rows stay valid forever; the
// player and admin editor render whatever was stored.
// ============================================================

import type { ProcessImageOptions } from "@/lib/image-processor";

export type StoryMediaKind = "cover" | "scene" | "document" | "thumbnail";

export interface StoryMediaPreset {
  /** Stable identifier written to `story_media.preset`. */
  id: string;
  /** Integer, bumped when encoder/pipeline behaviour changes. */
  processingVersion: number;
  /** Kind this preset targets. */
  kind: StoryMediaKind;
  /** Longest side cap in CSS pixels. */
  maxLongestSide: number;
  /** Soft file-size target in bytes. */
  targetBytes: number;
  /** Quality floor. */
  minQuality: number;
  /** Dimension floor. */
  minLongestSide: number;
  /** Storage bucket. Fixed for P2 but exposed so callers stay honest. */
  bucket: "story-media";
  /** Content-Type written to storage; matches encoder output. */
  contentType: "image/webp";
}

export const STORY_MEDIA_PRESETS = {
  cover: {
    id: "story.cover.v1",
    processingVersion: 1,
    kind: "cover",
    maxLongestSide: 1600,
    targetBytes: 220 * 1024,
    minQuality: 0.6,
    minLongestSide: 900,
    bucket: "story-media",
    contentType: "image/webp",
  },
  scene: {
    id: "story.scene.v1",
    processingVersion: 1,
    kind: "scene",
    maxLongestSide: 1400,
    targetBytes: 180 * 1024,
    minQuality: 0.58,
    minLongestSide: 800,
    bucket: "story-media",
    contentType: "image/webp",
  },
  document: {
    id: "story.document.v1",
    processingVersion: 1,
    kind: "document",
    maxLongestSide: 1600,
    targetBytes: 240 * 1024,
    minQuality: 0.62,
    minLongestSide: 900,
    bucket: "story-media",
    contentType: "image/webp",
  },
  thumbnail: {
    id: "story.thumbnail.v1",
    processingVersion: 1,
    kind: "thumbnail",
    maxLongestSide: 480,
    targetBytes: 40 * 1024,
    minQuality: 0.55,
    minLongestSide: 240,
    bucket: "story-media",
    contentType: "image/webp",
  },
} as const satisfies Record<StoryMediaKind, StoryMediaPreset>;

export type StoryMediaPresetKey = keyof typeof STORY_MEDIA_PRESETS;

export function getPreset(kind: StoryMediaPresetKey): StoryMediaPreset {
  return STORY_MEDIA_PRESETS[kind];
}

/** Every registered preset id — used by tests to detect accidental renames. */
export function allPresetIds(): string[] {
  return Object.values(STORY_MEDIA_PRESETS).map((p) => p.id).sort();
}

/** Map a preset into the shape `processImage()` expects. */
export function presetToProcessingOptions(p: StoryMediaPreset): ProcessImageOptions {
  return {
    maxLongestSide: p.maxLongestSide,
    targetBytes: p.targetBytes,
    minQuality: p.minQuality,
    minLongestSide: p.minLongestSide,
  };
}
