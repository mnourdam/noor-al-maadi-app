import { describe, it, expect } from "vitest";
import {
  computeSectionLockMap,
  computeFeedLockMap,
  isSpecialCampaign,
  computeLockMapByGroup,
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

describe("group-based lock map (divider-independent)", () => {
  it("opens the first campaign of every group even without dividers", () => {
    const entries = [
      { campaign: { id: "u1" }, groupKey: "section:umayyad" },
      { campaign: { id: "u2" }, groupKey: "section:umayyad" },
      { campaign: { id: "a1" }, groupKey: "section:abbasid" },
      { campaign: { id: "c1" }, groupKey: "section:crusades" },
      { campaign: { id: "o1" }, groupKey: "section:ottoman" },
    ];
    const map = computeLockMapByGroup(entries, state());
    for (const id of ["u1", "a1", "c1", "o1"]) expect(map.get(id)!.locked).toBe(false);
    expect(map.get("u2")!.locked).toBe(true);
    expect(computeLockMapByGroup(entries, state(["u1"])).get("u2")!.locked).toBe(false);
  });
});
