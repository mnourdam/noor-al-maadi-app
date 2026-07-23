// ============================================================
// Stories P2 — Preset identity tests
// ------------------------------------------------------------
// Preset ids and processing_versions are content-addressing
// keys inside `story_media`. Renaming or bumping them silently
// would orphan every previously registered row. These tests
// pin the identifiers so any change forces a deliberate edit.
// ============================================================
import { describe, it, expect } from "bun:test";
import {
  STORY_MEDIA_PRESETS,
  allPresetIds,
  getPreset,
  presetToProcessingOptions,
} from "@/lib/stories/media/presets";

describe("stories P2 — media presets", () => {
  it("exposes the four canonical preset ids", () => {
    expect(allPresetIds()).toEqual([
      "story.cover.v1",
      "story.document.v1",
      "story.scene.v1",
      "story.thumbnail.v1",
    ]);
  });

  it("every preset targets story-media as image/webp", () => {
    for (const p of Object.values(STORY_MEDIA_PRESETS)) {
      expect(p.bucket).toBe("story-media");
      expect(p.contentType).toBe("image/webp");
      expect(p.processingVersion).toBeGreaterThanOrEqual(1);
      expect(p.maxLongestSide).toBeGreaterThanOrEqual(p.minLongestSide);
      expect(p.minQuality).toBeGreaterThan(0);
      expect(p.minQuality).toBeLessThanOrEqual(1);
      expect(p.targetBytes).toBeGreaterThan(0);
    }
  });

  it("thumbnails are strictly smaller than every full-size preset", () => {
    const thumb = getPreset("thumbnail");
    for (const kind of ["cover", "scene", "document"] as const) {
      const p = getPreset(kind);
      expect(thumb.maxLongestSide).toBeLessThan(p.maxLongestSide);
      expect(thumb.targetBytes).toBeLessThan(p.targetBytes);
    }
  });

  it("presetToProcessingOptions forwards the four size levers verbatim", () => {
    const p = getPreset("cover");
    expect(presetToProcessingOptions(p)).toEqual({
      maxLongestSide: p.maxLongestSide,
      targetBytes: p.targetBytes,
      minQuality: p.minQuality,
      minLongestSide: p.minLongestSide,
    });
  });
});
