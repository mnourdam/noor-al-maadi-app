import React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition, __uninstallPartitionForTests } from "@/lib/identity/partition";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
const original = {
  getItem: Storage.prototype.getItem,
  setItem: Storage.prototype.setItem,
  removeItem: Storage.prototype.removeItem,
};
beforeEach(() => {
  Object.assign(Storage.prototype, original);
  __uninstallPartitionForTests();
  localStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({ loggedIn: true, name: "synthetic", points: 100, dinars: 500 }),
  );
  installIdentityPartition();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.assign(Storage.prototype, original);
  __uninstallPartitionForTests();
});
it("real partition diagnostic reads are bounded and allow real profile hydration/persistence to finish", async () => {
  const wrapped = Storage.prototype.getItem;
  let reads = 0;
  // The bound makes the historical self-scheduling path fail deterministically
  // rather than letting a regression starve the runner until heap exhaustion.
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
    if (key === "hakaya.profile.v2" && ++reads > 64) throw new Error("recursive-diagnostic-read");
    return wrapped.call(this, key);
  });
  let api: ReturnType<typeof useProfile>;
  function Probe() {
    api = useProfile();
    return null;
  }
  render(
    <ProfileProvider>
      <Probe />
    </ProfileProvider>,
  );
  await act(async () => {});
  expect(api!.profile.points).toBe(100);
  await act(async () => {
    api!.addPoints(7);
  });
  await new Promise((done) => setTimeout(done, 0));
  expect(reads).toBeLessThan(32);
  expect(JSON.parse(localStorage.getItem("hakaya.profile.v2")!).points).toBe(107);
  expect(api!.getPersistence().outcome).toBe("written");
});
