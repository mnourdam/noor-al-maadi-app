import { describe, it, expect } from "vitest";
import {
  isCampaignIntroRow,
  keepLibraryStories,
  introStoryIdsFromCampaigns,
} from "@/lib/stories/library-filter";

describe("story library isolation", () => {
  it("detects intros by metadata.kind", () => {
    expect(isCampaignIntroRow({ id: "s1", metadata: { kind: "campaign_intro" } })).toBe(true);
  });

  it("detects intros by tag", () => {
    expect(isCampaignIntroRow({ id: "s1", tags: ["campaign-intro"] })).toBe(true);
  });

  it("detects intros linked from a campaign", () => {
    const ids = introStoryIdsFromCampaigns([
      { data: { intro_story_id: "story_intro_x" } },
      { data: {} },
      null,
    ]);
    expect(ids.has("story_intro_x")).toBe(true);
    expect(isCampaignIntroRow({ id: "story_intro_x" }, ids)).toBe(true);
  });

  it("never classifies by title, slug or id prefix", () => {
    expect(isCampaignIntroRow({ id: "story_intro_looks_like_one", tags: [], metadata: {} })).toBe(false);
  });

  it("keeps only library stories", () => {
    const rows = [
      { id: "a", metadata: {} },
      { id: "b", metadata: { kind: "campaign_intro" } },
      { id: "c", tags: ["campaign-intro"] },
      { id: "d" },
    ];
    expect(keepLibraryStories(rows, new Set(["d"])).map((r) => r.id)).toEqual(["a"]);
  });
});
