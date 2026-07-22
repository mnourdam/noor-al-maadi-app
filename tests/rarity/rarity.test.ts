import { describe, it, expect } from "bun:test";
import {
  RARITY_VALUES,
  RARITY_ORDER,
  RARITY_LABEL_AR,
  normalizeRarity,
  rarityFromMetadata,
  rarityLabelAr,
  rarityRank,
  isArtifactRarity,
} from "../../src/lib/rarity";

describe("rarity — canonical module", () => {
  it("exposes exactly four values in canonical order", () => {
    expect(RARITY_VALUES).toEqual(["common", "rare", "epic", "legendary"]);
    expect(RARITY_ORDER).toEqual(RARITY_VALUES);
  });

  it("labels every rarity in Arabic", () => {
    expect(RARITY_LABEL_AR.common).toBe("عادي");
    expect(RARITY_LABEL_AR.rare).toBe("نادر");
    expect(RARITY_LABEL_AR.epic).toBe("ملحمي");
    expect(RARITY_LABEL_AR.legendary).toBe("أسطوري");
  });

  it("normalizes canonical slugs unchanged", () => {
    for (const r of RARITY_VALUES) expect(normalizeRarity(r)).toBe(r);
  });

  it("normalizes known aliases", () => {
    expect(normalizeRarity("Legendary")).toBe("legendary");
    expect(normalizeRarity("LEGEND")).toBe("legendary");
    expect(normalizeRarity("mythic")).toBe("epic");
    expect(normalizeRarity("uncommon")).toBe("rare");
    expect(normalizeRarity("normal")).toBe("common");
  });

  it("normalizes Arabic labels back to canonical slugs", () => {
    expect(normalizeRarity("عادي")).toBe("common");
    expect(normalizeRarity("نادر")).toBe("rare");
    expect(normalizeRarity("ملحمي")).toBe("epic");
    expect(normalizeRarity("أسطوري")).toBe("legendary");
  });

  it("falls back to common on invalid input", () => {
    expect(normalizeRarity(undefined)).toBe("common");
    expect(normalizeRarity(null)).toBe("common");
    expect(normalizeRarity(42 as any)).toBe("common");
    expect(normalizeRarity("gibberish")).toBe("common");
  });

  it("respects custom fallback", () => {
    expect(normalizeRarity("bogus", "rare")).toBe("rare");
    expect(normalizeRarity(undefined, "legendary")).toBe("legendary");
  });

  it("reads rarity from metadata safely", () => {
    expect(rarityFromMetadata({ rarity: "epic" })).toBe("epic");
    expect(rarityFromMetadata({})).toBe("common");
    expect(rarityFromMetadata(null)).toBe("common");
    expect(rarityFromMetadata({ rarity: "bogus" }, "rare")).toBe("rare");
  });

  it("returns Arabic label from any input", () => {
    expect(rarityLabelAr("legendary")).toBe("أسطوري");
    expect(rarityLabelAr("bogus")).toBe("عادي");
    expect(rarityLabelAr("mythic")).toBe("ملحمي");
  });

  it("rarityRank is strictly increasing along canonical order", () => {
    const ranks = RARITY_VALUES.map(rarityRank);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
  });

  it("isArtifactRarity is a type guard", () => {
    expect(isArtifactRarity("epic")).toBe(true);
    expect(isArtifactRarity("bogus")).toBe(false);
    expect(isArtifactRarity(undefined)).toBe(false);
  });

  it("grouping by normalized rarity yields no duplicates and covers 4 buckets", () => {
    const items = [
      { id: "a", metadata: { rarity: "legendary" } },
      { id: "b", metadata: { rarity: "Legendary" } },
      { id: "c", metadata: { rarity: "mythic" } },
      { id: "d", metadata: {} },
      { id: "e", metadata: { rarity: "uncommon" } },
    ];
    const groups: Record<string, string[]> = { common: [], rare: [], epic: [], legendary: [] };
    for (const it of items) groups[rarityFromMetadata(it.metadata)].push(it.id);
    const totalRendered = Object.values(groups).reduce((n, arr) => n + arr.length, 0);
    expect(totalRendered).toBe(items.length);
    expect(new Set(Object.values(groups).flat()).size).toBe(items.length);
    expect(groups.legendary.sort()).toEqual(["a", "b"]);
    expect(groups.epic).toEqual(["c"]);
    expect(groups.common).toEqual(["d"]);
    expect(groups.rare).toEqual(["e"]);
  });
});
