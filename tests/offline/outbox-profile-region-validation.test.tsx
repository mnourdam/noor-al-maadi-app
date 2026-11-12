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

it.each([NaN, Infinity, -Infinity])("rejects invalid region cost %s and allows valid retry", async (cost) => {
  const h = mount(), before = h.api.profile, bytes = localStorage.getItem(key), evidence = h.api.getPersistence();
  await act(async () => { h.api.unlockRegion("synthetic-region", cost); });
  expect(h.api.profile).toBe(before);
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(h.api.getPersistence()).toEqual(evidence);
  expect(h.api.profile.regionsUnlocked).not.toContain("synthetic-region");
  await act(async () => { h.api.unlockRegion("synthetic-region", 20); });
  expect(h.api.profile.points).toBe(80);
  expect(h.api.profile.regionsUnlocked).toContain("synthetic-region");
  h.view.unmount();
  expect(mount().api.profile.points).toBe(80);
});
it("rejects finite subtraction overflow without unlocking", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.points = Number.MAX_VALUE;
  localStorage.setItem(key, JSON.stringify(raw));
  const h = mount(), before = h.api.profile, bytes = localStorage.getItem(key);
  await act(async () => { h.api.unlockRegion("synthetic-region", -Number.MAX_VALUE); });
  expect(h.api.profile).toBe(before);
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(h.api.profile.regionsUnlocked).not.toContain("synthetic-region");
  await act(async () => { h.api.unlockRegion("synthetic-region", Number.MAX_VALUE); });
  expect(h.api.profile.points).toBe(0);
  expect(h.api.profile.regionsUnlocked).toContain("synthetic-region");
});
it.each([20, 0, -20, 0.5])("preserves finite region cost %s and durable state", async (cost) => {
  const h = mount();
  await act(async () => { h.api.unlockRegion("synthetic-region", cost); });
  expect(h.api.profile.points).toBe(100 - cost);
  expect(h.api.profile.dinars).toBe(50);
  expect(h.api.profile.regionsUnlocked).toContain("synthetic-region");
  h.view.unmount();
  expect(mount().api.profile.points).toBe(100 - cost);
});
it.each([NaN, Infinity, -Infinity, 20])("preserves owned region with cost %s", async (cost) => {
  const h = mount();
  await act(async () => { h.api.unlockRegion("synthetic-region", 20); });
  const before = h.api.profile, bytes = localStorage.getItem(key);
  await act(async () => { h.api.unlockRegion("synthetic-region", cost); });
  expect(h.api.profile).toBe(before);
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(h.api.profile.regionsUnlocked.filter(id => id === "synthetic-region")).toHaveLength(1);
});
it("keeps insufficient funds unchanged", async () => {
  const h = mount(), before = h.api.profile, bytes = localStorage.getItem(key);
  let result = true;
  await act(async () => { result = h.api.unlockRegion("synthetic-region", 101); });
  expect(result).toBe(false);
  expect(h.api.profile).toBe(before);
  expect(localStorage.getItem(key)).toBe(bytes);
});
it("retains queued update order and deferred boolean timing", async () => {
  const h = mount();
  let result = true;
  await act(async () => { startTransition(() => {
    h.api.addPoints(10);
    result = h.api.unlockRegion("synthetic-region", 105);
  }); });
  expect(result).toBe(false);
  expect(h.api.profile.points).toBe(5);
  expect(h.api.profile.regionsUnlocked).toContain("synthetic-region");
});
