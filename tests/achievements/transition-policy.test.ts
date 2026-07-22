import { describe, expect, it } from "vitest";
import { shouldEmitAchievementNotification } from "../../src/lib/achievements/v2/transition-policy";

const base = {
  id: "ach_test",
  origin: "live_gameplay_unlock" as const,
  liveTransitionsReady: true,
  serverPersistedBeforeEvaluation: false,
  evaluatorSatisfied: true,
  reconcilerClassifiedAsNew: true,
  claimInserted: true,
  claimExisting: false,
};

describe("achievement transition notification policy", () => {
  it("allows only confirmed live gameplay transitions", () => {
    expect(shouldEmitAchievementNotification(base)).toEqual({
      notificationEmitted: true,
      suppressionReason: null,
    });
  });

  it("suppresses first-pass startup hydration", () => {
    const decision = shouldEmitAchievementNotification({
      ...base,
      origin: "startup_hydration",
      liveTransitionsReady: false,
      claimInserted: false,
    });
    expect(decision.notificationEmitted).toBe(false);
    expect(decision.suppressionReason).toBe("live_transitions_not_ready");
  });

  it("suppresses historical repair and reconciliation rows", () => {
    for (const origin of ["historical_reconciliation", "historical_repair"] as const) {
      const decision = shouldEmitAchievementNotification({
        ...base,
        origin,
        claimInserted: false,
      });
      expect(decision.notificationEmitted).toBe(false);
      expect(decision.suppressionReason).toBe(`silent_origin:${origin}`);
    }
  });

  it("suppresses server-known or already-presented achievements after reinstall", () => {
    expect(shouldEmitAchievementNotification({
      ...base,
      serverPersistedBeforeEvaluation: true,
    }).suppressionReason).toBe("server_already_persisted");

    expect(shouldEmitAchievementNotification({
      ...base,
      serverRecord: {
        achievementId: "ach_test",
        unlockedAt: "2026-01-01T00:00:00.000Z",
        rewardsGrantedAt: "2026-01-01T00:00:00.000Z",
        presentedAt: "2026-01-01T00:00:00.000Z",
        notifiedAt: null,
        engineVersion: 2,
        definitionVersion: 1,
      },
    }).suppressionReason).toBe("server_already_presented");
  });

  it("suppresses claim acknowledgements and duplicate claim conflicts", () => {
    expect(shouldEmitAchievementNotification({
      ...base,
      origin: "claim_ack",
      claimInserted: false,
      claimExisting: true,
    }).suppressionReason).toBe("silent_origin:claim_ack");

    expect(shouldEmitAchievementNotification({
      ...base,
      claimInserted: false,
      claimExisting: true,
    }).suppressionReason).toBe("claim_conflict_existing");
  });
});
