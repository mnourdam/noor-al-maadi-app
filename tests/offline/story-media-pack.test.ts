import { describe, it, expect, vi, beforeEach } from "vitest";

// The generated id list is produced by scripts/build-story-media-pack.mjs.
// Tests must not depend on its exact contents, only on the contract.
vi.mock("@/lib/stories/media/offline-pack.generated", () => ({
  OFFLINE_STORY_MEDIA_IDS: ["aaa-111", "bbb-222"],
}));

import {
  hasOfflineStoryMedia,
  localStoryMediaPath,
  offlineStoryMediaCount,
} from "@/lib/stories/media/offline-pack";

describe("offline story media pack", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognises bundled media ids", () => {
    expect(hasOfflineStoryMedia("aaa-111")).toBe(true);
    expect(hasOfflineStoryMedia("nope")).toBe(false);
    expect(hasOfflineStoryMedia(null)).toBe(false);
    expect(hasOfflineStoryMedia(undefined)).toBe(false);
  });

  it("maps bundled ids to same-origin local paths", () => {
    expect(localStoryMediaPath("bbb-222")).toBe("/story-media/bbb-222.webp");
    expect(localStoryMediaPath("missing")).toBeNull();
  });

  it("reports how many assets ship with the build", () => {
    expect(offlineStoryMediaCount()).toBe(2);
  });
});
