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
// Deliberately partial wire fixtures exercise runtime ingestion without filling
// omitted fields or changing the values seen by the provider.
const wireFixture = (value: Record<string, unknown>) =>
  value as unknown as Parameters<Api["mergeCloudSave"]>[0];
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

for (const field of ["activityCooldowns", "hintsPurchased"] as const) {
  it.each([Infinity, "Infinity"])(`${field} rejects nonfinite final value %s atomically`, async value => {
    const h = mount(), before = h.api.profile, bytes = localStorage.getItem(key);
    await act(async () => { h.api.mergeCloudSave({ points: 200, storiesRead: ["new-story"], [field]: { poison: value } } as any); });
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
    expect(h.api.profile.storiesRead).not.toContain("new-story");
    h.view.unmount();
    expect(mount().api.profile.points).toBe(100);
  });
  it(`${field} snapshots nested values before deferred execution`, async () => {
    const h = mount(), incoming = { safe: 7 };
    await act(async () => { startTransition(() => {
      h.api.addPoints(1);
      h.api.mergeCloudSave(wireFixture({ [field]: incoming }));
      incoming.safe = Infinity;
    }); });
    expect(h.api.profile[field].safe).toBe(7);
    expect(JSON.parse(localStorage.getItem(key)!)[field].safe).toBe(7);
  });
  it(`${field} reads and normalizes each incoming scalar once`, async () => {
    const h = mount(), getter = vi.fn(() => 7);
    const incoming = Object.defineProperty({}, "safe", { enumerable: true, get: getter });
    await act(async () => { h.api.mergeCloudSave(wireFixture({ [field]: incoming })); });
    expect(h.api.profile[field].safe).toBe(7);
    expect(getter).toHaveBeenCalledTimes(1);
  });
  it.each([NaN, "garbage", null, -Infinity, "-Infinity", -3, 0, 2.5, "8"])(`${field} preserves Number fallback/max for %s`, async value => {
    const h = mount();
    await act(async () => { h.api.mergeCloudSave(wireFixture({ [field]: { kept: 5 } })); });
    await act(async () => { h.api.mergeCloudSave({ [field]: { kept: value, fresh: value } } as any); });
    expect(h.api.profile[field].kept).toBe(Math.max(5, Number(value) || 0));
    expect(h.api.profile[field].fresh).toBe(Math.max(0, Number(value) || 0));
  });
  it(`${field} rejects unrelated merge if existing map has a nonfinite final value`, async () => {
    const h = mount();
    // Synthetic legacy corruption, not a proposed ingestion path.
    await act(async () => { h.api.replaceProfile({ ...h.api.profile, [field]: { poison: Infinity } }); });
    const before = h.api.profile, bytes = localStorage.getItem(key);
    await act(async () => { h.api.mergeCloudSave(wireFixture({ points: 200, storiesRead: ["new-story"] })); });
    expect(h.api.profile).toBe(before);
    expect(localStorage.getItem(key)).toBe(bytes);
  });
}
