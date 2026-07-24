// ============================================================
// Stories M4 — Client-side determinism harness
// ------------------------------------------------------------
// Verifies the deterministic-bytes contract of the export envelope
// as consumed by the round-trip pipeline. The server-side canonical
// shape is produced by _story_export_v2_one and mirrored by
// _story_canonicalize_incoming_v2 (both installed in the M4 migration);
// this test locks down the client stringifier so `Export → Import →
// Export` produces identical bytes regardless of key ordering.
// ============================================================

import { describe, expect, it } from "vitest";
import { canonicalJsonBytes, type StoryExportEnvelopeV2 } from "@/lib/stories/import-v2";

function makeBundle(overrides: Partial<StoryExportEnvelopeV2> = {}): StoryExportEnvelopeV2 {
  return {
    envelope_version: 2,
    generator: "irth-m4",
    exported_at: "2026-01-01T00:00:00Z",
    story_ids: ["b", "a"],
    stories: [
      {
        id: "a",
        slug: "a",
        schema_version: 2,
        title_ar: "أ",
        title_en: null,
        summary_ar: null,
        summary_en: null,
        world_slug: null,
        era: null,
        display_order: 0,
        status: "draft",
        unlock_spec: { type: "always" },
        cover_media_id: null,
        xp_reward: 0,
        dinar_reward: 0,
        metadata: {},
        category: "event",
        rarity: "standard",
        production_status: "idea",
        lock_visibility: "visible",
        historical_confidence: "established",
        hijri_start_year: null, hijri_start_month: null, hijri_start_day: null,
        hijri_end_year: null,   hijri_end_month: null,   hijri_end_day: null,
        gregorian_start: null,  gregorian_end: null,
        story_collection_id: null, collection_order: null,
        time_precision: "unknown", length_class: "standard",
        tags: [], snapshot_tier: "standard",
        scenes: [], relations: [], sources: [],
      },
    ],
    collections: [],
    media: [],
    ...overrides,
  };
}

describe("M4 canonical bytes", () => {
  it("is stable across key ordering", () => {
    const a = makeBundle();
    const b: StoryExportEnvelopeV2 = {
      // same content, different insertion order
      exported_at: "different",
      media: [],
      collections: [],
      stories: a.stories,
      story_ids: ["a", "b"], // canonicalizer sorts
      generator: "irth-m4",
      envelope_version: 2,
    };
    expect(canonicalJsonBytes(a)).toBe(canonicalJsonBytes(b));
  });

  it("excludes exported_at so re-export produces identical bytes", () => {
    const a = makeBundle({ exported_at: "2026-01-01T00:00:00Z" });
    const b = makeBundle({ exported_at: "2999-12-31T23:59:59Z" });
    expect(canonicalJsonBytes(a)).toBe(canonicalJsonBytes(b));
  });

  it("changes when any content field changes", () => {
    const a = makeBundle();
    const changed = makeBundle();
    changed.stories[0].title_ar = "ب";
    expect(canonicalJsonBytes(a)).not.toBe(canonicalJsonBytes(changed));
  });
});
