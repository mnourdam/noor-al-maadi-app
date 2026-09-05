// V17-09 — optional chapter image: normalization, serialization, offline discovery.
import { describe, it, expect } from "vitest";
import { normalizeCampaign } from "@/lib/campaignStorage";
import { collectImageUrls } from "@/lib/image-cache";
import { storagePathFromChapterImageUrl } from "@/lib/campaign-chapter-image";

const URL_A = "https://example.supabase.co/storage/v1/object/sign/campaign-key-art/chapters/ch1/20260905-1-abc.webp?token=xyz";

function doc(chapterExtra: Record<string, unknown>) {
  return {
    id: "camp-1",
    title: "حملة",
    chapters: [
      { id: "ch1", title: "الفصل الأول", historicalReadingText: "نص", activities: [], ...chapterExtra },
    ],
  };
}

describe("chapter imageUrl", () => {
  it("survives normalization", () => {
    const { campaign } = normalizeCampaign(doc({ imageUrl: URL_A }));
    expect(campaign.chapters[0].imageUrl).toBe(URL_A);
  });

  it("round-trips through JSON export/import unchanged", () => {
    const first = normalizeCampaign(doc({ imageUrl: URL_A })).campaign;
    const again = normalizeCampaign(JSON.parse(JSON.stringify(first))).campaign;
    expect(again.chapters[0].imageUrl).toBe(URL_A);
  });

  it("stays undefined for chapters without an image", () => {
    const { campaign } = normalizeCampaign(doc({}));
    expect(campaign.chapters[0].imageUrl).toBeUndefined();
  });

  it("ignores blank values", () => {
    const { campaign } = normalizeCampaign(doc({ imageUrl: "   " }));
    expect(campaign.chapters[0].imageUrl).toBeUndefined();
  });

  it("is discovered by the existing offline image collector", () => {
    const { campaign } = normalizeCampaign(doc({ imageUrl: URL_A }));
    expect(collectImageUrls(campaign).has(URL_A)).toBe(true);
  });

  it("maps a chapter image URL back to its storage path (remove/replace)", () => {
    expect(storagePathFromChapterImageUrl(URL_A)).toBe("chapters/ch1/20260905-1-abc.webp");
    expect(storagePathFromChapterImageUrl(null)).toBeNull();
    expect(
      storagePathFromChapterImageUrl(
        "https://x/storage/v1/object/sign/campaign-key-art/camp-1/hero.webp?token=1",
      ),
    ).toBeNull();
  });
});
