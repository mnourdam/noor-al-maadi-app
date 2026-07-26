import { describe, it, expect } from "bun:test";
import { evaluateStoryUnlock } from "@/lib/stories/unlock";
import { guestUnlockState } from "@/lib/stories/unlock/guest-evidence";

const ENTITY = "b7e58e34-2299-4eb4-85d4-a36046d8273e";
const SPEC = { version: 2, expr: { type: "entity_discovered", entity_id: ENTITY } };

const EMPTY = {
  discovered: [] as string[], atlas: [] as string[], stories: [] as string[],
  campaigns: [] as string[], investigations: [] as string[],
  achievements: [] as string[], artifacts: [] as string[], level: 0,
};

describe("guest unlock parity — local device is the guest authority", () => {
  it("stays locked with no local evidence", () => {
    expect(evaluateStoryUnlock({ unlock_spec: SPEC }, guestUnlockState({ ...EMPTY }))).toBe(false);
  });

  it("unlocks as soon as the entity is discovered locally", () => {
    const state = guestUnlockState({ ...EMPTY, discovered: [ENTITY] });
    expect(evaluateStoryUnlock({ unlock_spec: SPEC }, state)).toBe(true);
  });

  it("maps atlas visits, story completions and level into the same authority", () => {
    const state = guestUnlockState({
      ...EMPTY, atlas: ["loc-1"], stories: ["story-a"], campaigns: ["camp-a"], level: 3,
    });
    expect(
      evaluateStoryUnlock(
        { unlock_spec: { version: 2, expr: { type: "atlas_location_visited", location_id: "loc-1" } } },
        state,
      ),
    ).toBe(true);
    expect(
      evaluateStoryUnlock(
        { unlock_spec: { version: 2, expr: { type: "story_complete", story_id: "story-a" } } },
        state,
      ),
    ).toBe(true);
    expect(
      evaluateStoryUnlock(
        { unlock_spec: { version: 2, expr: { type: "player_level", min: 5 } } },
        state,
      ),
    ).toBe(false);
  });
});
