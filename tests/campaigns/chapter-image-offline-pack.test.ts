import { describe, expect, it } from "vitest";
import {
  chapterImageStoragePath,
  localChapterImagePathForUrl,
  localCampaignArtPathForStoragePath,
} from "@/lib/campaign-art/offline-pack";

const SIGNED =
  "https://x.supabase.co/storage/v1/object/sign/campaign-key-art/chapters/ch1/20260905-1-abc.webp?token=t";

describe("chapter image offline pack", () => {
  it("extracts the bucket path from a signed chapter URL", () => {
    expect(chapterImageStoragePath(SIGNED)).toBe("chapters/ch1/20260905-1-abc.webp");
  });

  it("ignores non-chapter and foreign URLs", () => {
    expect(chapterImageStoragePath("https://x/other.webp")).toBeNull();
    expect(
      chapterImageStoragePath(
        "https://x.supabase.co/storage/v1/object/sign/campaign-key-art/tabuk-campaign/a.webp",
      ),
    ).toBeNull();
    expect(chapterImageStoragePath(null)).toBeNull();
  });

  it("returns no local path for artwork that is not bundled in this build", () => {
    expect(localChapterImagePathForUrl(SIGNED)).toBeNull();
  });

  it("never mistakes a chapter path for campaign key art", () => {
    expect(localCampaignArtPathForStoragePath("chapters/ch1/a.webp")).toBeNull();
  });
});
