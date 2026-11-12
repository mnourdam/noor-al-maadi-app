import React, { StrictMode, useEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile, type ProfileState } from "@/lib/profile";
import { useProfileWriter } from "@/lib/profile-writer";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition, __uninstallPartitionForTests } from "@/lib/identity/partition";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({ androidMeasure: () => {}, recordAndroidAction: () => {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: "alice" } } } }) } } }));
const key = "hakaya.profile.v2";
const initial = { loggedIn: false, points: 100, dinars: 50, hearts: 3, heartsAt: 1 } as ProfileState;
function mountProfile() {
  let api!: ReturnType<typeof useProfile>;
  function Probe() { api = useProfile(); return null; }
  const view = render(<StrictMode><ProfileProvider><Probe /></ProfileProvider></StrictMode>);
  return { view, get api() { return api; } };
}
function mountWriter() {
  let api!: ReturnType<typeof useProfileWriter>;
  function Probe() {
    api = useProfileWriter(initial);
    useEffect(() => { api.hydrate(report => { report(true); return initial; }); }, []);
    return null;
  }
  const view = render(<StrictMode><Probe /></StrictMode>);
  return { view, get api() { return api; } };
}
beforeEach(() => {
  __uninstallPartitionForTests(); localStorage.clear(); sessionStorage.clear();
  __resetIdentityForTests(); setActiveOwnerInternal("user:alice");
  localStorage.setItem(key, JSON.stringify({ ...initial, loggedIn: true, heartsAt: Date.now() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); __uninstallPartitionForTests(); });
it("ordinary provider silent write no-op preserves state semantics but cannot report written", async () => {
  const h = mountProfile(), bytes = localStorage.getItem(key);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  await act(async () => { h.api.applyServerStats({ xp: 200 }); });
  expect(h.api.profile.points).toBe(200);
  expect(h.api.getPersistence().outcome).toBe("unresolved");
  expect(localStorage.getItem(key)).toBe(bytes);
  h.view.unmount();
  expect(mountProfile().api.profile.points).toBe(100);
});
it("ordinary provider mismatched readback is unresolved without reverting its state", async () => {
  const h = mountProfile(), original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    return name === key ? "different-bytes" : original.call(this, name);
  });
  await act(async () => { h.api.applyServerStats({ xp: 200 }); });
  expect(h.api.profile.points).toBe(200);
  expect(h.api.getPersistence().outcome).toBe("unresolved");
  // Unresolved is not proof of rollback: the actual write may have succeeded.
  expect(JSON.parse(original.call(localStorage, key)!).points).toBe(200);
});
it("readback exception is unavailable evidence rather than a new write failure", async () => {
  const h = mountProfile(), original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    if (name === key) throw Error("read-unavailable");
    return original.call(this, name);
  });
  await act(async () => { h.api.applyServerStats({ xp: 200 }); });
  expect(h.api.profile.points).toBe(200);
  expect(h.api.getPersistence().outcome).toBe("unresolved");
});
it("owner change during ordinary exact readback cannot report written", async () => {
  const h = mountWriter(), original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    const value = original.call(this, name);
    if (name === key) setActiveOwnerInternal("user:bob");
    return value;
  });
  await act(async () => { h.api.setProfile(p => ({ ...p, points: 200 })); });
  expect(h.api.getPersistence().outcome).toBe("unresolved");
});
it("actual guest partition quarantine leaves ordinary writer persistence unresolved", async () => {
  localStorage.removeItem(key);
  setActiveOwnerInternal("guest:synthetic"); installIdentityPartition();
  const h = mountWriter();
  await act(async () => { h.api.setProfile(p => ({ ...p, loggedIn: true, points: 200 })); });
  expect(h.api.profile.points).toBe(200);
  expect(localStorage.getItem(key)).toBeNull();
  expect(h.api.getPersistence().outcome).toBe("unresolved");
});
it("ordinary exact readback reports written and survives provider remount", async () => {
  const h = mountProfile();
  await act(async () => { h.api.applyServerStats({ xp: 200, dinars: 60 }); });
  expect(h.api.getPersistence().outcome).toBe("written");
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ points: 200, dinars: 60 });
  h.view.unmount();
  expect(mountProfile().api.profile).toMatchObject({ points: 200, dinars: 60 });
});
it("actual storage write failure retains existing error-boundary behavior", async () => {
  const h = mountWriter();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("write-failed"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(act(async () => { h.api.setProfile(p => ({ ...p, points: 200 })); })).rejects.toThrow("write-failed");
});
it("conditional readback exception resolves false without changing write-error semantics", async () => {
  const h = mountWriter(), original = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    if (name === key) throw Error("read-unavailable");
    return original.call(this, name);
  });
  let result!: Promise<boolean>;
  await act(async () => { result = h.api.prepareConditional().apply(p => ({ ...p, points: 200 })); });
  expect(await result).toBe(false);
  expect(h.api.getPersistence().outcome).toBe("unresolved");
  expect(JSON.parse(original.call(localStorage, key)!).points).toBe(200);
});
it.each(["silent-noop", "mismatch"])("unresolved %s evidence blocks subsequent actual trySpendDinars", async mode => {
  const h = mountProfile(), originalRead = Storage.prototype.getItem;
  if (mode === "silent-noop") vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  else vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    return name === key ? "different-bytes" : originalRead.call(this, name);
  });
  await act(async () => { h.api.applyServerStats({ xp: 200 }); });
  const before = h.api.profile, bytes = originalRead.call(localStorage, key);
  expect(h.api.getPersistence().outcome).toBe("unresolved");
  let accepted = true;
  await act(async () => { accepted = h.api.trySpendDinars(10); });
  expect(accepted).toBe(false);
  expect(h.api.profile).toBe(before);
  expect(h.api.profile.dinars).toBe(50);
  expect(originalRead.call(localStorage, key)).toBe(bytes);
});
it("verified written evidence preserves synchronous spend acceptance and deferred debit", async () => {
  const h = mountProfile();
  await act(async () => { h.api.applyServerStats({ xp: 200 }); });
  expect(h.api.getPersistence().outcome).toBe("written");
  let accepted = false;
  await act(async () => { accepted = h.api.trySpendDinars(10); });
  expect(accepted).toBe(true);
  expect(h.api.profile.dinars).toBe(40);
  expect(JSON.parse(localStorage.getItem(key)!).dinars).toBe(40);
  expect(h.api.getPersistence().outcome).toBe("written");
});
