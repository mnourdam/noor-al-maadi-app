import { describe, it, expect } from "vitest";
import {
  computeSectionLockMap,
  computeFeedLockMap,
  isSpecialCampaign,
} from "@/lib/campaigns/progression";

const state = (ids: string[] = [], extra: Partial<Parameters<typeof computeSectionLockMap>[1]> = {}) => ({
  completedCampaignIds: new Set(ids),
  ...extra,
});

describe("Campaign Progression v1", () => {
  it("always opens the first campaign of an era", () => {
    const map = computeSectionLockMap([{ id: "a", title: "أ" }, { id: "b", title: "ب" }], state());
    expect(map.get("a")!.locked).toBe(false);
    expect(map.get("b")!.locked).toBe(true);
    expect(map.get("b")!.reason).toContain("أ");
  });

  it("unlocks the next campaign after the previous is completed", () => {
    const map = computeSectionLockMap(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      state(["a"]),
    );
    expect(map.get("b")!.locked).toBe(false);
    expect(map.get("c")!.locked).toBe(true);
  });

  it("each era starts open independently", () => {
    const map = computeFeedLockMap(
      [{ campaigns: [{ id: "p1" }, { id: "p2" }] }, { campaigns: [{ id: "r1" }, { id: "r2" }] }],
      state(),
    );
    expect(map.get("p1")!.locked).toBe(false);
    expect(map.get("r1")!.locked).toBe(false);
    expect(map.get("r2")!.locked).toBe(true);
  });

  it("special campaigns leave the chain intact", () => {
    const map = computeSectionLockMap(
      [{ id: "a" }, { id: "s", special: true }, { id: "b" }],
      state(["a"]),
    );
    expect(isSpecialCampaign({ id: "s", special: true })).toBe(true);
    expect(map.get("s")!.locked).toBe(true);
    expect(map.get("b")!.locked).toBe(false);
  });

  it("evaluates special conditions", () => {
    const c = { id: "s", special: true, unlock: { level: 5, achievementId: "ach1" } };
    const locked = computeSectionLockMap([c], state()).get("s")!;
    expect(locked.locked).toBe(true);
    const open = computeSectionLockMap([c], {
      completedCampaignIds: new Set<string>(),
      unlockedAchievementIds: new Set(["ach1"]),
      level: 7,
    }).get("s")!;
    expect(open.locked).toBe(false);
  });
});
