import { describe, it, expect } from "bun:test";
import { evaluateStoryUnlock, isAlwaysUnlockSpec, toUnlockSpecV2 } from "@/lib/stories/unlock";

const ENTITY = "b7e58e34-2299-4eb4-85d4-a36046d8273e";
const V2_ENTITY = {
  version: 2,
  expr: { type: "entity_discovered", entity_id: ENTITY },
};

describe("story unlock — single source of truth", () => {
  it("treats an explicit always spec as open", () => {
    expect(isAlwaysUnlockSpec({ version: 2, expr: { type: "always" } })).toBe(true);
    expect(isAlwaysUnlockSpec({ type: "always" })).toBe(true);
    expect(isAlwaysUnlockSpec(null)).toBe(true);
    expect(evaluateStoryUnlock({ unlock_spec: { version: 2, expr: { type: "always" } } })).toBe(true);
  });

  it("never treats a v2 envelope as 'always' (regression: spec.type undefined)", () => {
    expect(isAlwaysUnlockSpec(V2_ENTITY)).toBe(false);
  });

  it("keeps entity_discovered locked before discovery", () => {
    expect(evaluateStoryUnlock({ unlock_spec: V2_ENTITY })).toBe(false);
    expect(
      evaluateStoryUnlock(
        { unlock_spec: V2_ENTITY },
        { discovered_entity_ids: new Set(["some-other-entity"]) },
      ),
    ).toBe(false);
  });

  it("unlocks immediately after the entity is discovered", () => {
    expect(
      evaluateStoryUnlock(
        { unlock_spec: V2_ENTITY },
        { discovered_entity_ids: new Set([ENTITY]) },
      ),
    ).toBe(true);
  });

  it("fails closed on invalid specs", () => {
    expect(evaluateStoryUnlock({ unlock_spec: { version: 2, expr: { type: "nope" } } })).toBe(false);
    expect(isAlwaysUnlockSpec({ version: 2, expr: { type: "nope" } })).toBe(false);
  });

  it("round-trips a v2 spec unchanged (export stability)", () => {
    expect(toUnlockSpecV2(V2_ENTITY)).toEqual(V2_ENTITY as never);
    expect(toUnlockSpecV2(toUnlockSpecV2(V2_ENTITY))).toEqual(V2_ENTITY as never);
  });
});
