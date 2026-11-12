import React, { StrictMode } from "react";
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
import { commitHearts, getEffectiveHearts, msUntilNextHeart, HEART_RECOVERY_MS as R } from "@/lib/hearts";
const anchor = 1_000_000;
const heartState = (hearts: number) => ({ hearts, heartsAt: anchor }) as Api["profile"];
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
});


it.each([[4, 2 * R - 1], [1, 20 * R - 1]])("starts a fresh interval after effective full from stored %s", (base, elapsed) => {
  const now = anchor + elapsed, p = heartState(base);
  expect(getEffectiveHearts(p, now)).toBe(5);
  const next = { ...p, ...commitHearts(p, 4, now) };
  expect(next.heartsAt).toBe(now);
  expect(msUntilNextHeart(next, now)).toBe(R);
  expect(getEffectiveHearts(next, now + R - 1)).toBe(4);
  expect(getEffectiveHearts(next, now + R)).toBe(5);
});
it.each([
  [5, 4, R - 1, R - 1],
  [3, 3, R + 123, R],
  [2, 4, R + 123, R],
  [3, 5, R + 123, R + 123],
  [4, 4, R, R],
])("preserves anchor compatibility base%s next%s elapsed%s", (base, next, elapsed, expected) => {
  expect(commitHearts(heartState(base), next, anchor + elapsed)).toEqual({ hearts: next, heartsAt: anchor + expected });
});
for (const method of ["loseHeart", "loseHeartOnce"] as const) {
  it(`${method} persists a full interval after idle regeneration, survives remount`, async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = anchor + 2 * R - 1;
    vi.setSystemTime(now);
    const raw = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...raw, hearts: 4, heartsAt: anchor }));
    const h = mount();
    expect(getEffectiveHearts(h.api.profile)).toBe(5);
    await act(async () => {
      if (method === "loseHeart") h.api.loseHeart();
      else h.api.loseHeartOnce("anchor-regression-unique-attempt");
    });
    expect(h.api.profile.hearts).toBe(4);
    expect(h.api.profile.heartsAt).toBe(now);
    expect(msUntilNextHeart(h.api.profile)).toBe(R);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ hearts: 4, heartsAt: now });
    if (method === "loseHeartOnce") {
      const before = h.api.profile, bytes = localStorage.getItem(key);
      await act(async () => { h.api.loseHeartOnce("anchor-regression-unique-attempt"); });
      expect(h.api.profile).toBe(before);
      expect(localStorage.getItem(key)).toBe(bytes);
    }
    h.view.unmount();
    const again = mount();
    vi.setSystemTime(now + R - 1);
    expect(getEffectiveHearts(again.api.profile)).toBe(4);
    vi.setSystemTime(now + R);
    expect(getEffectiveHearts(again.api.profile)).toBe(5);
  });
}
