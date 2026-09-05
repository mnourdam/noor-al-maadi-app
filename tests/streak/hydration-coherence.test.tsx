// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { ProfileProvider, useProfile, deriveStreak, type ProfileState } from "@/lib/profile";
import { irthDayKey, addIrthDays } from "@/lib/irth-day";

/**
 * V17-04A — server streak + last_streak_day hydrate together, and the cloud
 * merge can never pair a valid streak with a stale day.
 */

type Api = ReturnType<typeof useProfile>;

function harness() {
  const ref: { api: Api | null } = { api: null };
  function Probe() {
    ref.api = useProfile();
    return null;
  }
  render(
    <ProfileProvider>
      <Probe />
    </ProfileProvider>,
  );
  return ref as { api: Api };
}

describe("applyServerStats — streak and day arrive together", () => {
  it("adopts the server streak with the server day", async () => {
    const h = harness();
    const today = irthDayKey();
    await act(async () => {
      h.api.applyServerStats({ streak: 4, lastStreakDay: today });
    });
    expect(h.api.profile.streak).toBe(4);
    expect(h.api.profile.lastActiveDay).toBe(today);
    expect(deriveStreak(h.api.profile.streak, h.api.profile.lastActiveDay).streak).toBe(4);
  });

  it("cannot create a streak/day mismatch that renders a false 0", async () => {
    const h = harness();
    const today = irthDayKey();
    // Local state carries a stale day from an old session…
    await act(async () => {
      h.api.mergeCloudSave({ streak: 2, lastActiveDay: addIrthDays(today, -9) } as Partial<ProfileState>);
    });
    // …then the server row arrives.
    await act(async () => {
      h.api.applyServerStats({ streak: 5, lastStreakDay: today });
    });
    expect(h.api.profile.streak).toBe(5);
    expect(deriveStreak(h.api.profile.streak, h.api.profile.lastActiveDay).streak).toBe(5);
  });

  it("an older server day never regresses a newer local day", async () => {
    const h = harness();
    const today = irthDayKey();
    await act(async () => {
      h.api.applyServerStats({ streak: 3, lastStreakDay: today });
      h.api.applyServerStats({ streak: 3, lastStreakDay: addIrthDays(today, -4) });
    });
    expect(h.api.profile.lastActiveDay).toBe(today);
  });

  it("a duplicate identical server payload changes nothing", async () => {
    const h = harness();
    const today = irthDayKey();
    await act(async () => { h.api.applyServerStats({ streak: 6, lastStreakDay: today }); });
    const snap = h.api.profile;
    await act(async () => { h.api.applyServerStats({ streak: 6, lastStreakDay: today }); });
    expect(h.api.profile).toBe(snap);
  });

  it("xp / dinars behaviour is unchanged", async () => {
    const h = harness();
    await act(async () => { h.api.applyServerStats({ xp: 777, dinars: 12 }); });
    expect(h.api.profile.points).toBe(777);
    expect(h.api.profile.dinars).toBe(12);
  });
});

describe("mergeCloudSave — day precedence is explicit", () => {
  it("an older cloud lastActiveDay cannot overwrite a newer local one", async () => {
    const h = harness();
    const today = irthDayKey();
    await act(async () => {
      h.api.applyServerStats({ streak: 3, lastStreakDay: today });
    });
    await act(async () => {
      h.api.mergeCloudSave({ streak: 3, lastActiveDay: addIrthDays(today, -6) } as Partial<ProfileState>);
    });
    expect(h.api.profile.lastActiveDay).toBe(today);
    expect(deriveStreak(h.api.profile.streak, h.api.profile.lastActiveDay).streak).toBe(3);
  });

  it("a newer cloud day is adopted", async () => {
    const h = harness();
    const today = irthDayKey();
    await act(async () => {
      h.api.mergeCloudSave({ streak: 2, lastActiveDay: today } as Partial<ProfileState>);
    });
    expect(h.api.profile.lastActiveDay).toBe(today);
    expect(h.api.profile.streak).toBeGreaterThanOrEqual(2);
  });

  it("guest local state cannot beat the server streak after sign-in hydration", async () => {
    const h = harness();
    const today = irthDayKey();
    // Guest optimism.
    await act(async () => { h.api.touchStreak(); });
    // Server hydration wins.
    await act(async () => { h.api.applyServerStats({ streak: 12, lastStreakDay: today }); });
    expect(h.api.profile.streak).toBe(12);
    // And nothing the guest did can be pushed back out.
    const { derivePublicStats } = await import("@/lib/social");
    expect(Object.keys(derivePublicStats(h.api.profile))).not.toContain("streak");
  });
});
