// ============================================================
// Campaign Intro export → import round-trip
// ------------------------------------------------------------
// Locks the compatibility contract:
//   * a legacy v1 export file (the shape admin_export_stories emits)
//     normalizes into a valid v2 envelope,
//   * metadata.kind / campaign_id / scenes / media / cover survive,
//   * metadata.campaign_id — the portable linking contract consumed by
//     the transactional importer — survives unchanged,
//   * intro-specific guards (campaign existence, duplicate published
//     intro) behave, and
//   * re-normalizing an already-v2 envelope is a no-op (round-trip).
// ============================================================

import { describe, expect, it } from "vitest";
import {
  normalizeStoryEnvelope,
  isEnvelopeV2,
  isCampaignIntroItem,
  campaignIdOfItem,
  validateCampaignIntroEnvelope,
} from "@/lib/stories/envelope";

const V1_EXPORT = {
  version: 1,
  exported_at: "2026-07-01T00:00:00Z",
  stories: [
    {
      id: "story_intro_conquest_of_makkah",
      slug: "intro-conquest-of-makkah",
      title_ar: "افتتاحية فتح مكة",
      title_en: null,
      summary_ar: null,
      status: "draft",
      display_order: 0,
      content_version: 3,
      unlock_spec: { type: "always" },
      cover_media_id: null,
      xp_reward: 0,
      dinar_reward: 0,
      metadata: { kind: "campaign_intro", campaign_id: "conquest-of-makkah-campaign" },
      tags: ["campaign-intro"],
      scenes: [
        { id: "sc1", scene_index: 0, scene_type: "text", title_ar: "المشهد", payload: { body: "نص" }, primary_media_id: null },
        { id: "sc2", scene_index: 1, scene_type: "text", title_ar: null, payload: {}, primary_media_id: null },
      ],
      media: [],
    },
  ],
};

describe("campaign intro v1 → v2 envelope", () => {
  it("produces a valid v2 envelope", () => {
    const env = normalizeStoryEnvelope(V1_EXPORT);
    expect(env.envelope_version).toBe(2);
    expect(isEnvelopeV2(env)).toBe(true);
    expect(env.story_ids).toEqual(["story_intro_conquest_of_makkah"]);
    expect(env.collections).toEqual([]);
    expect(env.media).toEqual([]);
  });

  it("preserves intro identity, scenes and null media", () => {
    const [s] = normalizeStoryEnvelope(V1_EXPORT).stories;
    expect(s.schema_version).toBe(2);
    expect(s.metadata.kind).toBe("campaign_intro");
    expect(s.metadata.campaign_id).toBe("conquest-of-makkah-campaign");
    expect(isCampaignIntroItem(s)).toBe(true);
    expect(campaignIdOfItem(s)).toBe("conquest-of-makkah-campaign");
    expect(s.status).toBe("draft");
    expect(s.unlock_spec).toEqual({ type: "always" });
    expect(s.cover_media_id).toBeNull();
    expect(s.display_order).toBe(0);
    expect(s.scenes).toHaveLength(2);
    expect(s.scenes[0].payload).toEqual({ body: "نص" });
    expect(s.scenes.every((sc) => sc.primary_media_id === null)).toBe(true);
    expect(s.tags).toContain("campaign-intro");
  });

  it("hoists nested v1 media to the envelope root", () => {
    const withMedia = structuredClone(V1_EXPORT) as typeof V1_EXPORT;
    (withMedia.stories[0] as Record<string, unknown>).media = [
      { id: "m1", kind: "image", storage_bucket: "story-media", storage_path: "a.webp", mime_type: "image/webp", byte_size: 10, width: 1, height: 1, checksum_sha256: "x", preset: "cover", processing_version: 1, owner_scope: "story", metadata: {} },
    ];
    (withMedia.stories[0] as Record<string, unknown>).cover_media_id = "m1";
    const env = normalizeStoryEnvelope(withMedia);
    expect(env.media).toHaveLength(1);
    expect(env.media[0].story_id).toBe("story_intro_conquest_of_makkah");
    expect(env.stories[0].cover_media_id).toBe("m1");
  });

  it("is round-trip stable: normalizing a v2 envelope changes nothing", () => {
    const once = normalizeStoryEnvelope(V1_EXPORT);
    const twice = normalizeStoryEnvelope(once);
    expect(twice).toBe(once);
  });

  it("keeps the official portable campaign link in metadata", () => {
    const env = normalizeStoryEnvelope(V1_EXPORT);
    const serialized = JSON.parse(JSON.stringify(env)) as typeof env;
    expect(campaignIdOfItem(serialized.stories[0])).toBe("conquest-of-makkah-campaign");
  });
});

describe("campaign intro guards", () => {
  const env = normalizeStoryEnvelope(V1_EXPORT);
  const known = new Set(["conquest-of-makkah-campaign"]);

  it("accepts a valid intro for an existing campaign", () => {
    const res = validateCampaignIntroEnvelope(env, {
      knownCampaignIds: known,
      publishedIntroByCampaign: new Map(),
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an unknown campaign", () => {
    const res = validateCampaignIntroEnvelope(env, {
      knownCampaignIds: new Set(["other"]),
      publishedIntroByCampaign: new Map(),
    });
    expect(res.issues[0].code).toBe("unknown_campaign");
  });

  it("rejects a missing campaign_id", () => {
    const bad = structuredClone(env);
    bad.stories[0].metadata = { kind: "campaign_intro" };
    const res = validateCampaignIntroEnvelope(bad, {
      knownCampaignIds: known,
      publishedIntroByCampaign: new Map(),
    });
    expect(res.issues[0].code).toBe("missing_campaign_id");
  });

  it("blocks a second published intro unless replacement is allowed", () => {
    const published = new Map([["conquest-of-makkah-campaign", "story_other_intro"]]);
    expect(validateCampaignIntroEnvelope(env, { knownCampaignIds: known, publishedIntroByCampaign: published }).issues[0].code)
      .toBe("duplicate_published_intro");
    expect(validateCampaignIntroEnvelope(env, { knownCampaignIds: known, publishedIntroByCampaign: published, allowReplace: true }).ok)
      .toBe(true);
  });

  it("rejects a library story in the intro importer", () => {
    const lib = structuredClone(env);
    lib.stories[0].metadata = {};
    lib.stories[0].tags = [];
    const res = validateCampaignIntroEnvelope(lib, {
      knownCampaignIds: known,
      publishedIntroByCampaign: new Map(),
    });
    expect(res.issues[0].code).toBe("not_campaign_intro");
  });
});
