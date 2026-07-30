import { describe, it, expect } from "vitest";
import { isCampaignIntroStory, storyKindInfo } from "@/lib/stories/admin-kinds";

describe("admin story classification", () => {
  it("classifies by story_kind", () => {
    expect(isCampaignIntroStory({ story_kind: "campaign_intro" })).toBe(true);
  });

  it("classifies by metadata.kind (legacy/import)", () => {
    expect(isCampaignIntroStory({ metadata: { kind: "campaign_intro" } })).toBe(true);
  });

  it("never classifies by title, slug, id prefix or a bare campaign_id", () => {
    expect(isCampaignIntroStory({ metadata: { campaign_id: "conquest-of-makkah" } })).toBe(false);
    expect(isCampaignIntroStory({ metadata: {} })).toBe(false);
    expect(isCampaignIntroStory(null)).toBe(false);
  });

  it("reads campaign_id only for intros", () => {
    expect(storyKindInfo({ metadata: { kind: "campaign_intro", campaign_id: "x" } }).campaignId).toBe("x");
    expect(storyKindInfo({ metadata: { kind: "campaign_intro" } }).campaignId).toBeNull();
    expect(storyKindInfo({ metadata: { campaign_id: "x" } }).campaignId).toBeNull();
  });
});
