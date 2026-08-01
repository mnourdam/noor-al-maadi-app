import { describe, expect, it } from "vitest";
import { decideDailyFact, plannedDailyCards, dailyKeyParts } from "@/lib/notifications/dailyPriority";

describe("daily notification priority", () => {
  it("suppresses the daily fact on a day that HAS a Today-in-History event", () => {
    const d = decideDailyFact({ todayInHistoryEventCount: 1 });
    expect(d.send).toBe(false);
    expect(d).toMatchObject({ reason: "suppressed_by_today_in_history" });
    // exactly one daily card that day
    expect(plannedDailyCards(1)).toBe(1);
  });

  it("sends the daily fact on a day with NO Today-in-History event", () => {
    expect(decideDailyFact({ todayInHistoryEventCount: 0 })).toEqual({ send: true });
    expect(plannedDailyCards(0)).toBe(1);
  });

  it("never sends a fact alongside multiple events", () => {
    for (const n of [2, 3, 4, 7]) {
      expect(decideDailyFact({ todayInHistoryEventCount: n }).send).toBe(false);
    }
  });

  it("resolves the day in UTC so server/device schedules agree", () => {
    const parts = dailyKeyParts(new Date("2026-03-11T23:30:00Z"));
    expect(parts).toEqual({ month: 3, day: 11, runDate: "2026-03-11" });
  });
});
