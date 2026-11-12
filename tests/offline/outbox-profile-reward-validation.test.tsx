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
const methods = [
  "completeInvestigation",
  "completeTimeline",
  "completeDecision",
  "completeMission",
  "completeCampaign",
  "claimDaily",
] as const;
const fields = {
  completeInvestigation: "investigationsCompleted",
  completeTimeline: "timelinesCompleted",
  completeDecision: "decisionsCompleted",
  completeMission: "missionsCompleted",
  completeCampaign: "campaignsCompleted",
} as const;
function completed(api: Api, method: (typeof methods)[number]) {
  return method === "claimDaily" ? api.profile.dailyClaimed.ids : api.profile[fields[method]];
}
for (const method of methods) {
  it.each([NaN, Infinity, -Infinity])(
    `${method} rejects reward %s atomically and permits valid retry`,
    async (reward) => {
      const h = mount(),
        before = h.api.profile,
        bytes = localStorage.getItem(key),
        evidence = h.api.getPersistence();
      await act(async () => {
        h.api[method]("synthetic", reward);
      });
      expect(h.api.profile).toBe(before);
      expect(localStorage.getItem(key)).toBe(bytes);
      expect(h.api.getPersistence()).toEqual(evidence);
      expect(completed(h.api, method)).not.toContain("synthetic");
      await act(async () => {
        h.api[method]("synthetic", 20);
      });
      expect(h.api.profile).toMatchObject({ points: 120, dinars: 55 });
      expect(completed(h.api, method)).toContain("synthetic");
      h.view.unmount();
      const again = mount();
      expect(again.api.profile).toMatchObject({ points: 120, dinars: 55 });
      expect(completed(again.api, method)).toContain("synthetic");
    },
  );
  it.each(["points", "dinars"] as const)(
    `${method} rejects finite %s overflow before marking completion`,
    async (field) => {
      const raw = JSON.parse(localStorage.getItem(key)!);
      raw[field] = Number.MAX_VALUE;
      localStorage.setItem(key, JSON.stringify(raw));
      const h = mount(),
        before = h.api.profile,
        bytes = localStorage.getItem(key);
      await act(async () => {
        h.api[method]("synthetic", Number.MAX_VALUE);
      });
      expect(h.api.profile).toBe(before);
      expect(localStorage.getItem(key)).toBe(bytes);
      expect(completed(h.api, method)).not.toContain("synthetic");
      await act(async () => {
        h.api[method]("synthetic", 4);
      });
      expect(completed(h.api, method)).toContain("synthetic");
    },
  );
  it.each([20, 0, -5, 2.5])(
    `${method} preserves finite reward %s and duplicate semantics`,
    async (reward) => {
      const h = mount();
      await act(async () => {
        h.api[method]("synthetic", reward);
      });
      expect(h.api.profile).toMatchObject({
        points: 100 + reward,
        dinars: 50 + (reward <= 0 ? 0 : Math.max(1, Math.floor(reward / 4))),
      });
      const bytes = localStorage.getItem(key),
        before = h.api.profile;
      await act(async () => {
        h.api[method]("synthetic", NaN);
      });
      expect(localStorage.getItem(key)).toBe(bytes);
      expect(h.api.profile).toBe(before);
    },
  );
}
for (const method of ["addPoints", "addDinars"] as const) {
  it.each([NaN, Infinity, -Infinity])(`${method} refuses nonfinite addition %s`, async (value) => {
    const h = mount(),
      before = h.api.profile,
      bytes = localStorage.getItem(key);
    await act(async () => h.api[method](value));
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
  });
  it(`${method} refuses finite positive addition overflow`, async () => {
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw[method === "addPoints" ? "points" : "dinars"] = Number.MAX_VALUE;
    localStorage.setItem(key, JSON.stringify(raw));
    const h = mount(),
      before = h.api.profile,
      bytes = localStorage.getItem(key);
    await act(async () => h.api[method](Number.MAX_VALUE));
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
  });
}
it("preserves direct negative addition and existing dinar zero clamp", async () => {
  const h = mount();
  await act(async () => {
    h.api.addPoints(-200);
    h.api.addDinars(-200);
  });
  expect(h.api.profile).toMatchObject({ points: -100, dinars: 0 });
});
it("claimDaily rejection cannot consume today's id or report successful claim", async () => {
  const h = mount();
  let result = true;
  await act(async () => {
    result = h.api.claimDaily("bad", NaN);
  });
  expect(result).toBe(false);
  expect(h.api.profile.dailyClaimed.ids).not.toContain("bad");
});

it("direct XP negative finite overflow is rejected without changing bytes", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.points = -Number.MAX_VALUE;
  localStorage.setItem(key, JSON.stringify(raw));
  const h = mount(),
    before = h.api.profile,
    bytes = localStorage.getItem(key);
  await act(async () => h.api.addPoints(-Number.MAX_VALUE));
  expect(h.api.profile).toBe(before);
  expect(localStorage.getItem(key)).toBe(bytes);
});
it("finite negative dinar addition retains existing clamp even when raw sum underflows", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.dinars = -Number.MAX_VALUE;
  localStorage.setItem(key, JSON.stringify(raw));
  const h = mount();
  await act(async () => h.api.addDinars(-Number.MAX_VALUE));
  expect(h.api.profile.dinars).toBe(0);
});
