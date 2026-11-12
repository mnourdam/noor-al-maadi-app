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
for (const field of ["points", "dinars", "streak"] as const) {
  it.each([NaN, Infinity, -Infinity])(
    `rejects cloud ${field}=%s without partial merge`,
    async (value) => {
      const h = mount(),
        before = h.api.profile,
        bytes = localStorage.getItem(key),
        evidence = h.api.getPersistence();
      await act(async () =>
        h.api.mergeCloudSave({
          ...before,
          points: 200,
          dinars: 400,
          streak: 8,
          storiesRead: ["new-story"],
          [field]: value,
        }),
      );
      expect(h.api.profile).toBe(before);
      expect(localStorage.getItem(key)).toBe(bytes);
      expect(h.api.getPersistence()).toEqual(evidence);
      h.view.unmount();
      const again = mount();
      expect(again.api.profile).toMatchObject({ points: 100, dinars: 50, streak: 5 });
    },
  );
}
it("captures cloud scalar fields before deferred updater", async () => {
  const h = mount();
  const cloud = { ...h.api.profile, points: 200, dinars: 400, streak: 8 };
  await act(async () => {
    startTransition(() => h.api.mergeCloudSave(cloud));
    cloud.points = NaN;
    cloud.dinars = Infinity;
    cloud.streak = -Infinity;
  });
  expect(h.api.profile).toMatchObject({ points: 200, dinars: 400, streak: 8 });
  h.view.unmount();
  expect(mount().api.profile).toMatchObject({ points: 200, dinars: 400, streak: 8 });
});
it("reads incoming scalar getters once", async () => {
  const h = mount();
  let reads = 0;
  const cloud = {
    ...h.api.profile,
    get points() {
      reads++;
      return reads === 1 ? 200 : NaN;
    },
  };
  await act(async () => h.api.mergeCloudSave(cloud));
  expect(reads).toBe(1);
  expect(h.api.profile.points).toBe(200);
});
it.each([
  { points: 240.8, dinars: 450.9, streak: 7.8, expected: [240, 450, 7] },
  { points: 0, dinars: 0, streak: 0, expected: [100, 300, 5] },
  { points: -9, dinars: -9, streak: -9, expected: [100, 300, 5] },
])("preserves max/floor and existing initial dinar floor %j", async (value) => {
  const h = mount();
  await act(async () =>
    h.api.mergeCloudSave({
      ...h.api.profile,
      points: value.points,
      dinars: value.dinars,
      streak: value.streak,
    }),
  );
  const expected = {
    points: value.expected[0],
    dinars: value.expected[1],
    streak: value.expected[2],
  };
  expect(h.api.profile).toMatchObject(expected);
  h.view.unmount();
  expect(mount().api.profile).toMatchObject(expected);
});
it.each([null, undefined])("preserves null/omitted scalar compatibility (%s)", async (value) => {
  const h = mount();
  const cloud = {
    ...h.api.profile,
    points: value,
    dinars: value,
    streak: value,
  } as unknown as Api["profile"];
  await act(async () => h.api.mergeCloudSave(cloud));
  expect(h.api.profile).toMatchObject({ points: 100, dinars: 300, streak: 5 });
});
it("preserves array unions, sticky completions and heart tuple selection", async () => {
  const h = mount();
  const at = Date.now() - 60_000;
  const cloud = {
    ...h.api.profile,
    points: 200,
    dinars: 400,
    hearts: 4,
    heartsAt: at,
    storiesRead: ["s", "s"],
    campaignsCompleted: ["c"],
  };
  await act(async () => h.api.mergeCloudSave(cloud, { stickyCampaignIds: ["sticky"] }));
  expect(h.api.profile).toMatchObject({
    points: 200,
    dinars: 400,
    hearts: 4,
    heartsAt: at,
    storiesRead: ["s"],
    campaignsCompleted: ["c", "sticky"],
  });
});
it("rejected cloud does not consume unchanged-profile admission", async () => {
  const h = mount();
  let finish!: (v: unknown) => void, started!: () => void;
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
  await act(async () => h.api.mergeCloudSave({ ...h.api.profile, points: NaN }));
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
