import { describe, expect, it } from "vitest";
import { AVATARS } from "@/lib/avatars";
import { EMBLEM_UNLOCK_RULES, ruleFor } from "@/lib/emblems/unlock-rules";
import {
  AVAILABLE_LABEL,
  COMING_SOON_LABEL,
  evaluateEmblemUnlock,
  toArabicDigits,
} from "@/lib/emblems/unlock-eval";
import { RARITY_LABEL_AR, normalizeEmblemRarity } from "@/lib/emblems/rarity";

const ctx = (campaignsCompleted: number, museumItems: number, equippedId?: string) => ({
  campaignsCompleted,
  museumItems,
  equippedId,
});

const byId = (id: string) => {
  const a = AVATARS.find((x) => x.id === id);
  if (!a) throw new Error(`missing emblem ${id}`);
  return a;
};

describe("emblem unlock rules", () => {
  it("matches the server catalog shape (70 default / 13 counted / 64 coming soon)", () => {
    const kinds = AVATARS.map((a) => ruleFor(a.id)!.kind);
    expect(kinds.filter((k) => k === "default")).toHaveLength(70);
    expect(kinds.filter((k) => k === "campaign_count" || k === "museum_count")).toHaveLength(13);
    expect(kinds.filter((k) => k === "coming_soon")).toHaveLength(64);
    expect(Object.keys(EMBLEM_UNLOCK_RULES)).toHaveLength(AVATARS.length);
  });

  it("only counted rules carry a threshold", () => {
    for (const a of AVATARS) {
      const r = ruleFor(a.id)!;
      const counted = r.kind === "campaign_count" || r.kind === "museum_count";
      expect(typeof r.threshold === "number").toBe(counted);
    }
  });
});

describe("evaluateEmblemUnlock", () => {
  it("default emblems are always available", () => {
    const s = evaluateEmblemUnlock(byId("crescent_star"), ctx(0, 0));
    expect(s.unlocked).toBe(true);
    expect(s.requirementText).toBe(AVAILABLE_LABEL);
  });

  it("coming-soon emblems stay locked and show قريبًا with no fake requirement", () => {
    const s = evaluateEmblemUnlock(byId("hajj_mahmal"), ctx(999, 999));
    expect(s.unlocked).toBe(false);
    expect(s.comingSoon).toBe(true);
    expect(s.requirementText).toBe(COMING_SOON_LABEL);
    expect(s.progress).toBeNull();
  });

  it("a coming-soon emblem already equipped is not stripped", () => {
    const s = evaluateEmblemUnlock(byId("hajj_mahmal"), ctx(0, 0, "hajj_mahmal"));
    expect(s.unlocked).toBe(true);
  });

  it.each([
    ["bound_folio", 1],
    ["encyclopedia_stack", 5],
    ["saddle_ornate", 8],
    ["silk_road_map", 10],
  ])("campaign threshold boundary for %s", (id, goal) => {
    expect(evaluateEmblemUnlock(byId(id), ctx(goal - 1, 0)).unlocked).toBe(false);
    expect(evaluateEmblemUnlock(byId(id), ctx(goal, 0)).unlocked).toBe(true);
    expect(evaluateEmblemUnlock(byId(id), ctx(goal + 1, 0)).unlocked).toBe(true);
  });

  it.each([
    ["library_ladder", 25],
    ["desert_rose_crystal", 30],
    ["curator_gloves", 40],
    ["persian_carpet", 50],
    ["coffee_dallah", 60],
    ["seljuk_star_tile", 70],
    ["tiraz_textile", 80],
    ["minbar_panel", 90],
    ["fresco_fragment", 100],
  ])("museum threshold boundary for %s", (id, goal) => {
    expect(evaluateEmblemUnlock(byId(id), ctx(0, goal - 1)).unlocked).toBe(false);
    expect(evaluateEmblemUnlock(byId(id), ctx(0, goal)).unlocked).toBe(true);
  });

  it("shows real progress only for counted rules", () => {
    const s = evaluateEmblemUnlock(byId("silk_road_map"), ctx(7, 0));
    expect(s.progress).toEqual({ current: 7, goal: 10, text: expect.any(String) });
    expect(s.requirementText).toContain("حملات");
    expect(evaluateEmblemUnlock(byId("crescent_star"), ctx(7, 0)).progress).toBeNull();
  });

  it("clamps displayed progress to the goal and uses Arabic digits", () => {
    const s = evaluateEmblemUnlock(byId("bound_folio"), ctx(9, 0, "other"));
    expect(s.unlocked).toBe(true);
    expect(toArabicDigits(2026)).toBe("٢٠٢٦");
  });

  it("guest context (zero museum items) never unlocks a museum emblem", () => {
    expect(evaluateEmblemUnlock(byId("library_ladder"), ctx(50, 0)).unlocked).toBe(false);
  });
});

describe("rarity presentation", () => {
  it("uncommon is a real tier with one Arabic label everywhere", () => {
    expect(normalizeEmblemRarity("uncommon")).toBe("uncommon");
    expect(RARITY_LABEL_AR.uncommon).toBe("غير شائع");
  });
});
