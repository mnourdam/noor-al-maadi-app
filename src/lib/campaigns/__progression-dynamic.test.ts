import { describe, it, expect } from "vitest";
import { computeLockMapByGroup, deriveCampaignGroupKey } from "@/lib/campaigns/progression";
import { auditCampaignProgression } from "@/lib/campaigns/progression-integrity";

const st = { completedCampaignIds: new Set<string>() };
describe("dynamic groups", () => {
  it("opens first campaign of a brand-new group with no divider", () => {
    const cs = [
      { id: "a", title: "A", section_key: "safavid" },
      { id: "b", title: "B", section_key: "safavid" },
    ];
    const m = computeLockMapByGroup(cs.map((c, i) => ({ campaign: c, groupKey: deriveCampaignGroupKey(c, null, i) })), st);
    expect(m.get("a")!.locked).toBe(false);
    expect(m.get("b")!.locked).toBe(true);
  });
  it("skips archived when picking the start", () => {
    const cs = [
      { id: "x", title: "X", section_key: "moderne", status: "archived" },
      { id: "y", title: "Y", section_key: "moderne" },
    ];
    const m = computeLockMapByGroup(cs.map((c, i) => ({ campaign: c, groupKey: deriveCampaignGroupKey(c, null, i) })), st);
    expect(m.get("x")!.locked).toBe(true);
    expect(m.get("y")!.locked).toBe(false);
  });
  it("audits empty divider + missing divider", () => {
    const a = auditCampaignProgression([
      { divider: { id: "d1", title: "فاصل فارغ" }, campaigns: [] },
      { divider: null, campaigns: [{ id: "n1", title: "N", section_key: "newera" }] },
    ]);
    const codes = a.issues.map(i => i.code);
    expect(codes).toContain("divider_without_group");
    expect(codes).toContain("group_without_divider");
    expect(a.ok).toBe(true);
  });
});
