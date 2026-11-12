import React, { StrictMode, Suspense, startTransition, useEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProfileWriter, CONDITIONAL_WRITE_TIMEOUT_MS } from "@/lib/profile-writer";
import type { ProfileState } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition, __uninstallPartitionForTests } from "@/lib/identity/partition";
const initial = { points: 100, dinars: 50, hearts: 3, heartsAt: 1 } as ProfileState;
const key = "hakaya.profile.v2";
type Writer = ReturnType<typeof useProfileWriter>;
function mount(suspend?: () => Promise<void> | undefined) {
  let writer!: Writer;
  function Probe() {
    writer = useProfileWriter(initial);
    useEffect(() => { writer.hydrate(report => { report(true); return initial; }); }, []);
    const wait = suspend?.();
    if (wait && writer.profile.points === 200) throw wait;
    return null;
  }
  const view = render(<StrictMode><Suspense fallback={null}><Probe /></Suspense></StrictMode>);
  return { view, get writer() { return writer; } };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  localStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); __uninstallPartitionForTests(); });
it("confirms only after matching committed frame persists, single use", async () => {
  const h = mount();
  const capability = h.writer.prepareConditional();
  let promise!: Promise<boolean>, settled = false;
  expect(capability.current()).toBe(true);
  await act(async () => {
    promise = capability.apply(p => ({ ...p, points: 200 }));
    promise.then(() => { settled = true; });
    expect(capability.current()).toBe(false);
    expect(settled).toBe(false);
  });
  expect(await promise).toBe(true);
  expect(h.writer.profile.points).toBe(200);
  expect(JSON.parse(localStorage.getItem(key)!).points).toBe(200);
  expect(h.writer.getPersistence().outcome).toBe("written");
  expect(await capability.apply(p => ({ ...p, points: 999 }))).toBe(false);
});
it("rejects a capability after an intervening admission", async () => {
  const h = mount(), capability = h.writer.prepareConditional();
  await act(async () => { h.writer.setProfile(p => ({ ...p, dinars: 40 })); });
  const change = vi.fn((p: ProfileState) => ({ ...p, points: 200 }));
  expect(await capability.apply(change)).toBe(false);
  expect(change).not.toHaveBeenCalled();
  expect(h.writer.profile.points).toBe(100);
});
it("queued-before-capture mismatch preserves prior write and its persistence", async () => {
  const h = mount();
  const revision = h.writer.getPersistence().revision;
  let promise!: Promise<boolean>;
  await act(async () => {
    startTransition(() => {
      h.writer.setProfile(p => ({ ...p, dinars: 40 }));
      const capability = h.writer.prepareConditional();
      promise = capability.apply(p => ({ ...p, points: 200 }));
    });
  });
  expect(await promise).toBe(false);
  expect(h.writer.profile).toMatchObject({ points: 100, dinars: 40 });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ points: 100, dinars: 40 });
  expect(h.writer.getPersistence()).toMatchObject({ outcome: "written", revision: revision + 1 });
});
it("later admitted update revokes a deferred conditional without rolling back other work", async () => {
  const h = mount();
  let promise!: Promise<boolean>;
  await act(async () => {
    startTransition(() => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
    h.writer.setProfile(p => ({ ...p, dinars: 40 }));
  });
  expect(await promise).toBe(false);
  expect(h.writer.profile.points).toBe(100);
  expect(h.writer.profile.dinars).toBe(40);
});
it.each(["owner", "aba", "reset", "hydrate", "unmount"])("settles pending on %s", async action => {
  const h = mount();
  let promise!: Promise<boolean>;
  await act(async () => {
    startTransition(() => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
    if (action === "owner" || action === "aba") {
      setActiveOwnerInternal("user:bob");
      if (action === "aba") setActiveOwnerInternal("user:alice");
    } else if (action === "reset") h.writer.reset(initial);
    else if (action === "hydrate") h.writer.hydrate(report => { report(true); return initial; });
    else h.view.unmount();
  });
  expect(await promise).toBe(false);
  expect(localStorage.getItem(key) ?? "").not.toContain('"points":200');
});
it("thrown conditional reducer rejects without changing revision or bytes", async () => {
  const h = mount();
  await act(async () => { h.writer.setProfile(p => ({ ...p, dinars: 40 })); });
  const before = h.writer.profile, evidence = h.writer.getPersistence(), bytes = localStorage.getItem(key);
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(() => { throw Error("bad-patch"); }); });
  expect(await promise).toBe(false);
  expect(h.writer.profile).toBe(before);
  expect(h.writer.getPersistence()).toEqual(evidence);
  expect(localStorage.getItem(key)).toBe(bytes);
});
it("persistence failure settles unresolved and preserves error-boundary behavior", async () => {
  const h = mount();
  const capability = h.writer.prepareConditional();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("disk-full"); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  let promise!: Promise<boolean>;
  await expect(act(async () => { promise = capability.apply(p => ({ ...p, points: 200 })); })).rejects.toThrow("disk-full");
  expect(await promise).toBe(false);
  expect(localStorage.getItem(key)).toBeNull();
});
it("expiry settles suspended work and revokes only its own admission", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  let wait: Promise<void> | undefined = new Promise<void>(resolve => { release = resolve; });
  const h = mount(() => wait);
  let promise!: Promise<boolean>;
  await act(async () => { startTransition(() => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); }); });
  await act(async () => { vi.advanceTimersByTime(CONDITIONAL_WRITE_TIMEOUT_MS); });
  expect(await promise).toBe(false);
  await act(async () => { wait = undefined; release(); });
  expect(localStorage.getItem(key) ?? "").not.toContain('"points":200');
  expect(vi.getTimerCount()).toBe(0);
});
it("superseding conditional owns its token and old expiry cannot revoke it", async () => {
  vi.useFakeTimers();
  const h = mount();
  let old!: Promise<boolean>, fresh!: Promise<boolean>;
  await act(async () => {
    startTransition(() => {
      old = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 }));
      fresh = h.writer.prepareConditional().apply(p => ({ ...p, points: 300 }));
    });
  });
  expect(await old).toBe(false);
  expect(await fresh).toBe(true);
  expect(h.writer.profile.points).toBe(300);
  expect(JSON.parse(localStorage.getItem(key)!).points).toBe(300);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { vi.advanceTimersByTime(CONDITIONAL_WRITE_TIMEOUT_MS); });
  expect(h.writer.prepareConditional().current()).toBe(true);
});
it("identity change during storage write cannot publish successful confirmation", async () => {
  const h = mount();
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    original.call(this, key, value);
    if (key === "hakaya.profile.v2") setActiveOwnerInternal("user:bob");
  });
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
  expect(await promise).toBe(false);
  // False is unresolved: the bytes may have been written before identity changed.
  expect(JSON.parse(localStorage.getItem(key)!).points).toBe(200);
});
it("unreadable frame never admits conditional work", async () => {
  const h = mount();
  await act(async () => { h.writer.hydrate(report => { report(false); return initial; }); });
  const capability = h.writer.prepareConditional(), change = vi.fn((p: ProfileState) => p);
  expect(capability.current()).toBe(false);
  expect(await capability.apply(change)).toBe(false);
  expect(change).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBeNull();
});
it("silent storage no-op is unresolved, not successful persistence", async () => {
  const h = mount();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
  expect(await promise).toBe(false);
  expect(h.writer.getPersistence().outcome).toBe("unresolved");
  expect(localStorage.getItem(key)).toBeNull();
});
it("mismatched readback is unresolved despite nonthrowing write", async () => {
  const h = mount();
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    return name === key ? "different-bytes" : getItem.call(this, name);
  });
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
  expect(await promise).toBe(false);
  expect(h.writer.getPersistence().outcome).toBe("unresolved");
});
it("identity reentry during exact readback cannot confirm old owner persistence", async () => {
  const h = mount();
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, name) {
    const value = getItem.call(this, name);
    if (name === key) setActiveOwnerInternal("user:bob");
    return value;
  });
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(p => ({ ...p, points: 200 })); });
  expect(await promise).toBe(false);
});
it("actual guest partition quarantine never produces successful conditional receipt", async () => {
  setActiveOwnerInternal("guest:synthetic");
  installIdentityPartition();
  const h = mount();
  let promise!: Promise<boolean>;
  await act(async () => { promise = h.writer.prepareConditional().apply(p => ({ ...p, loggedIn: true, points: 200 })); });
  expect(await promise).toBe(false);
  expect(h.writer.getPersistence().outcome).toBe("unresolved");
  expect(localStorage.getItem(key)).toBeNull();
});
