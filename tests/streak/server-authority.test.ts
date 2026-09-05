import { describe, it, expect } from "vitest";
import { derivePublicStats } from "@/lib/social";
import { deriveStreak, laterDayKey } from "@/lib/profile";
import { irthDayKey, irthYesterdayKey, addIrthDays } from "@/lib/irth-day";

/**
 * V17-04A — the client may keep optimistic streak state, but it must never
 * be able to write an authoritative streak to the server.
 */

// Minimal ProfileState-shaped fixture (only the fields derivePublicStats reads).
function profileFixture(over: Record<string, unknown> = {}) {
  return {
    points: 1200,
    dinars: 40,
    hearts: 4,
    streak: 7,
    lastActiveDay: irthDayKey(),
    longestStreak: 9,
    bio: "b",
    titlesEarned: [],
    charactersUnlocked: ["c1"],
    artifactsFound: ["a1", "a2"],
    campaignsCompleted: ["k1"],
    favoriteStateId: null,
    favoriteFigureId: null,
    avatarId: "em1",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("public stats payload never carries streak", () => {
  it("derivePublicStats omits streak entirely", () => {
    const stats = derivePublicStats(profileFixture());
    expect(Object.keys(stats)).not.toContain("streak");
    expect((stats as Record<string, unknown>)["streak"]).toBeUndefined();
  });

  it("a local optimistic streak bump cannot change the outbound payload", () => {
    const a = derivePublicStats(profileFixture({ streak: 1 }));
    const b = derivePublicStats(profileFixture({ streak: 999 }));
    expect(a).toEqual(b);
  });

  it("a guest/fresh-hydrate zero streak cannot be pushed either", () => {
    const stats = derivePublicStats(profileFixture({ streak: 0 }));
    expect(JSON.stringify(stats)).not.toContain('"streak"');
  });

  it("XP, dinars, hearts and the other public stats are unchanged", () => {
    const stats = derivePublicStats(profileFixture());
    expect(stats.xp).toBe(1200);
    expect(stats.dinars).toBe(40);
    expect(stats.hearts).toBe(4);
    expect(stats.artifacts_collected).toBe(2);
    expect(stats.campaigns_completed).toBe(1);
    expect(stats.avatar_id).toBe("em1");
    expect(stats.level).toBeGreaterThan(0);
  });

  it("the avatar/offline-flush payloads reuse the same helper, so they cannot leak streak", () => {
    const stats = { ...derivePublicStats(profileFixture()), avatar_id: "em9" };
    expect(Object.keys(stats)).not.toContain("streak");
  });
});

describe("streak value and its day stay coherent", () => {
  it("laterDayKey picks the newer day and tolerates nulls", () => {
    expect(laterDayKey("2026-09-01", "2026-09-03")).toBe("2026-09-03");
    expect(laterDayKey("2026-09-05", "2026-09-03")).toBe("2026-09-05");
    expect(laterDayKey(null, "2026-09-03")).toBe("2026-09-03");
    expect(laterDayKey("2026-09-03", null)).toBe("2026-09-03");
    expect(laterDayKey(null, null)).toBeNull();
    expect(laterDayKey("", "2026-09-03")).toBe("2026-09-03");
  });

  it("a server streak carrying today's day displays the real number, not 0", () => {
    const day = laterDayKey(addIrthDays(irthDayKey(), -6), irthDayKey());
    expect(deriveStreak(4, day).streak).toBe(4);
    expect(deriveStreak(4, day).status).toBe("safe");
  });

  it("yesterday still displays the streak (at-risk), unchanged product rule", () => {
    const d = deriveStreak(4, irthYesterdayKey());
    expect(d.streak).toBe(4);
    expect(d.status).toBe("at-risk");
  });

  it("a genuinely broken run still displays 0 (unchanged product rule)", () => {
    const d = deriveStreak(4, addIrthDays(irthDayKey(), -3));
    expect(d.streak).toBe(0);
    expect(d.status).toBe("expired");
  });

  it("an older cloud day can never replace a newer local day", () => {
    const local = irthDayKey();
    const cloud = addIrthDays(local, -5);
    expect(laterDayKey(local, cloud)).toBe(local);
    // …and the resulting pair never renders a false 0.
    expect(deriveStreak(3, laterDayKey(local, cloud)).streak).toBe(3);
  });
});
