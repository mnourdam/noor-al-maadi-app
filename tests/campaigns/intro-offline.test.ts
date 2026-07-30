// ============================================================
// Stage 5 acceptance — offline snapshot audit + build gate
// ============================================================
import { describe, it, expect } from "bun:test";
import {
  auditCampaignIntroAssets,
  readCampaignIntroFromRow,
  INTRO_ENGINE_VERSION,
} from "@/lib/campaigns/intro/audit";

const story = (over: Record<string, unknown> = {}) => ({
  id: "story-1",
  status: "published",
  is_locked: false,
  is_redacted: false,
  cover_media_id: "media-cover",
  ...over,
});

const scene = (over: Record<string, unknown> = {}) => ({
  id: "scene-1",
  story_id: "story-1",
  scene_index: 0,
  primary_media_id: "media-1",
  payload: {},
  ...over,
});

const media = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  story_id: "story-1",
  storage_path: `stories/${id}.webp`,
  verified: true,
  ...over,
});

const campaign = (over: Record<string, unknown> = {}) => ({
  id: "camp-1",
  data: { intro_story_id: "story-1", intro_version: 1, ...(over.data as object ?? {}) },
  ...over,
});

const full = (over: Partial<Parameters<typeof auditCampaignIntroAssets>[0]> = {}) =>
  auditCampaignIntroAssets({
    campaigns: [campaign()],
    stories: [story()],
    story_scenes: [scene()],
    story_media: [media("media-cover"), media("media-1")],
    ...over,
  });

describe("intro authoring extraction", () => {
  it("reads the intro from the campaign `data` payload", () => {
    expect(readCampaignIntroFromRow(campaign())).toEqual({
      campaignId: "camp-1",
      storyId: "story-1",
      version: 1,
      engineVersion: 1,
    });
  });

  it("returns null when no intro is authored", () => {
    expect(readCampaignIntroFromRow({ id: "c", data: {} })).toBeNull();
    expect(readCampaignIntroFromRow(null)).toBeNull();
  });
});

describe("offline asset audit", () => {
  it("passes when every asset is bundled", () => {
    const r = full();
    expect(r.ok).toBe(true);
    expect(r.entries[0].ready).toBe(true);
    expect(r.entries[0].sceneCount).toBe(1);
    expect(r.entries[0].mediaCount).toBe(2);
  });

  it("accepts a published six-scene intro without a cover when every scene medium is valid", () => {
    const scenes = Array.from({ length: 6 }, (_, index) =>
      scene({ id: `scene-${index}`, scene_index: index, primary_media_id: `media-${index}` }),
    );
    const r = full({
      stories: [story({ cover_media_id: null, production_status: "idea" })],
      story_scenes: scenes,
      story_media: scenes.map((_, index) => media(`media-${index}`)),
    });
    expect(r.ok).toBe(true);
    expect(r.entries[0].ready).toBe(true);
    expect(r.entries[0].sceneCount).toBe(6);
    expect(r.entries[0].mediaCount).toBe(6);
  });

  it("campaigns without an intro never fail the gate", () => {
    const r = auditCampaignIntroAssets({ campaigns: [{ id: "c", data: {} }] });
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(0);
  });

  it("fails when the intro story is missing from the snapshot", () => {
    const r = full({ stories: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("missing from the offline snapshot");
  });

  it("fails when the intro story has no scenes", () => {
    const r = full({ story_scenes: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("no scenes");
  });

  it("fails when a referenced media row is absent", () => {
    const r = full({ story_media: [media("media-cover")] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("media media-1 is missing");
  });

  it("fails on unverified or path-less media", () => {
    const r = full({
      story_media: [media("media-cover"), media("media-1", { verified: false })],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("not verified");
  });

  it("fails when the intro story is locked or redacted offline", () => {
    expect(full({ stories: [story({ is_locked: true })] }).ok).toBe(false);
    expect(full({ stories: [story({ is_redacted: true })] }).ok).toBe(false);
  });

  it("collects media ids referenced inside the scene payload", () => {
    const r = full({
      story_scenes: [scene({ payload: { media_ids: ["media-2"] } })],
      story_media: [media("media-cover"), media("media-1")],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("media-2");
  });

  it("ignores intros authored for a newer engine (forward compatible)", () => {
    const r = auditCampaignIntroAssets({
      campaigns: [
        campaign({ data: { intro_story_id: "story-1", intro_engine_version: INTRO_ENGINE_VERSION + 1 } }),
      ],
      stories: [],
      story_scenes: [],
      story_media: [],
    });
    expect(r.ok).toBe(true);
    expect(r.entries[0].skippedFutureEngine).toBe(true);
    expect(r.entries[0].ready).toBe(false);
  });
});
