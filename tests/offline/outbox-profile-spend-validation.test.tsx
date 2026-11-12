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
for (const kind of ["spend", "hint"] as const) {
  it.each([NaN, Infinity, -Infinity])(
    `${kind} rejects nonfinite cost %s without corruption`,
    async (cost) => {
      const h = mount(),
        before = h.api.profile,
        bytes = localStorage.getItem(key),
        evidence = h.api.getPersistence();
      let accepted = true;
      await act(async () => {
        accepted = kind === "spend" ? h.api.spendDinars(cost) : h.api.buyHint("scope", 0, cost);
      });
      expect(accepted).toBe(false);
      expect(h.api.profile).toBe(before);
      expect(localStorage.getItem(key)).toBe(bytes);
      expect(h.api.getPersistence()).toEqual(evidence);
      h.view.unmount();
      expect(mount().api.profile.dinars).toBe(50);
    },
  );
  it(`${kind} rejects finite subtraction overflow`, async () => {
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.dinars = Number.MAX_VALUE;
    localStorage.setItem(key, JSON.stringify(raw));
    const h = mount(),
      before = h.api.profile,
      bytes = localStorage.getItem(key),
      evidence = h.api.getPersistence();
    let accepted = true;
    await act(async () => {
      accepted =
        kind === "spend"
          ? h.api.spendDinars(-Number.MAX_VALUE)
          : h.api.buyHint("scope", 0, -Number.MAX_VALUE);
    });
    expect(accepted).toBe(false);
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
    expect(h.api.getPersistence()).toEqual(evidence);
  });
  it.each([10, 0, -5])(`${kind} preserves finite cost %s policy`, async (cost) => {
    const h = mount();
    await act(async () => {
      if (kind === "spend") h.api.spendDinars(cost);
      else h.api.buyHint("scope", 0, cost);
    });
    expect(h.api.profile.dinars).toBe(50 - cost);
    if (kind === "hint") expect(h.api.hintsRevealed("scope")).toBe(1);
    h.view.unmount();
    expect(mount().api.profile.dinars).toBe(50 - cost);
  });
}
it.each([NaN, Infinity, -Infinity])(
  "already revealed hint retains no-purchase behavior with cost %s",
  async (cost) => {
    const raw = JSON.parse(localStorage.getItem(key)!);
    raw.hintsPurchased = { scope: 1 };
    localStorage.setItem(key, JSON.stringify(raw));
    const h = mount(),
      before = h.api.profile,
      bytes = localStorage.getItem(key);
    let accepted = false;
    await act(async () => {
      accepted = h.api.buyHint("scope", 0, cost);
    });
    // Historical StrictMode deferred updater returns false before its owned branch runs.
    expect(accepted).toBe(false);
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
  },
);
it("keeps affordability and sequential hint constraints unchanged", async () => {
  const h = mount(),
    bytes = localStorage.getItem(key);
  await act(async () => {
    expect(h.api.spendDinars(51)).toBe(false);
    expect(h.api.buyHint("scope", 1, 10)).toBe(false);
    expect(h.api.buyHint("scope", 0, 51)).toBe(false);
  });
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(h.api.profile.dinars).toBe(50);
});
it("keeps trySpendDinars behavior unchanged", async () => {
  const h = mount();
  await act(async () => {
    for (const n of [NaN, Infinity, -Infinity, 0, -1]) expect(h.api.trySpendDinars(n)).toBe(false);
  });
  expect(h.api.profile.dinars).toBe(50);
});
