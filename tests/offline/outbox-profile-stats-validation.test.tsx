import React, { StrictMode, startTransition } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "alice" } } } }) },
  },
}));
const env = vi.hoisted(() => ({ streak: vi.fn() }));
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: env.streak }));
type Api = ReturnType<typeof useProfile>;
const key = "hakaya.profile.v2";
function mount() {
  let api!: Api;
  function Probe() {
    api = useProfile();
    return null;
  }
  const view = render(
    <StrictMode>
      <ProfileProvider>
        <Probe />
      </ProfileProvider>
    </StrictMode>,
  );
  return {
    view,
    get api() {
      return api;
    },
  };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  env.streak.mockReset();
  localStorage.setItem(
    key,
    JSON.stringify({
      name: "Synthetic",
      loggedIn: true,
      points: 100,
      dinars: 50,
      streak: 5,
      lastActiveDay: "2026-11-10",
      hearts: 3,
      heartsAt: Date.now(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
});
for (const field of ["xp", "dinars", "streak"] as const) {
  it.each([NaN, Infinity, -Infinity])(
    `rejects ${field}=%s atomically before persistence`,
    async (value) => {
      const h = mount(),
        before = h.api.profile,
        evidence = h.api.getPersistence(),
        bytes = localStorage.getItem(key);
      await act(async () => {
        h.api.applyServerStats({
          xp: 7,
          dinars: 9,
          streak: 2,
          [field]: value,
          lastStreakDay: "2026-11-12",
        });
      });
      expect(h.api.profile).toBe(before);
      expect(h.api.getPersistence()).toEqual(evidence);
      expect(localStorage.getItem(key)).toBe(bytes);
      h.view.unmount();
      const again = mount();
      expect(again.api.profile.points).toBe(100);
      expect(again.api.profile.dinars).toBe(50);
    },
  );
}
it("captures scalars once before deferred React update, immune to caller mutation", async () => {
  const h = mount();
  const value = { xp: 25, dinars: 15, streak: 2, lastStreakDay: "2026-11-11" };
  await act(async () => {
    startTransition(() => h.api.applyServerStats(value));
    value.xp = NaN;
    value.dinars = Infinity;
    value.streak = -Infinity;
    value.lastStreakDay = "2026-12-31";
  });
  expect(h.api.profile).toMatchObject({
    points: 25,
    dinars: 15,
    streak: 2,
    lastActiveDay: "2026-11-11",
  });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    points: 25,
    dinars: 15,
    streak: 2,
  });
});
it("reads supplied getters once", async () => {
  const h = mount();
  let reads = 0;
  await act(async () => {
    h.api.applyServerStats({
      get xp() {
        reads++;
        return reads === 1 ? 20 : NaN;
      },
    });
  });
  expect(reads).toBe(1);
  expect(h.api.profile.points).toBe(20);
});
it.each([
  { xp: 0, dinars: 0, streak: 0 },
  { xp: -1, dinars: -2, streak: -3 },
  { xp: 4.5, dinars: 2.5, streak: 2.9 },
])("preserves finite historical behavior %j", async (stats) => {
  const h = mount();
  await act(async () => h.api.applyServerStats(stats));
  const expected = {
    points: Math.max(0, stats.xp),
    dinars: Math.max(0, stats.dinars),
    streak: Math.max(0, Math.floor(stats.streak)),
  };
  expect(h.api.profile).toMatchObject(expected);
  h.view.unmount();
  expect(mount().api.profile).toMatchObject(expected);
});
it("preserves null/omitted fields and does not newly validate unused hearts", async () => {
  const h = mount();
  const before = h.api.profile;
  await act(async () =>
    h.api.applyServerStats({ xp: null, dinars: undefined, streak: null, hearts: Infinity }),
  );
  expect(h.api.profile).toBe(before);
  await act(async () => h.api.applyServerStats({ xp: 25, hearts: NaN }));
  expect(h.api.profile.points).toBe(25);
});
it("invalid snapshot does not revoke a pending unchanged-profile admission", async () => {
  const h = mount();
  let finish!: (value: unknown) => void, started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  env.streak.mockImplementation(() => {
    started();
    return new Promise((r) => {
      finish = r;
    });
  });
  const pending = h.api.recordStreakActivity("campaign_chapter", "synthetic");
  await ready;
  await act(async () => {
    h.api.applyServerStats({ xp: NaN });
  });
  await act(async () => {
    finish({
      ok: true,
      current_streak: 6,
      longest_streak: 6,
      last_active_day: "2026-11-12",
      xp_total: 110,
      dinar_balance: 55,
      grants: [],
    });
    await pending;
  });
  expect(h.api.profile).toMatchObject({ points: 110, dinars: 55, streak: 6 });
});
it("does not read unused hearts or a streak day when streak is omitted", async () => {
  const h = mount();
  await act(async () =>
    h.api.applyServerStats({
      xp: 20,
      get hearts(): number {
        throw new Error("unused-hearts");
      },
      get lastStreakDay(): string {
        throw new Error("unused-day");
      },
    }),
  );
  expect(h.api.profile.points).toBe(20);
});
