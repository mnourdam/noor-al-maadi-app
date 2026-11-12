import React, { startTransition } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { useBuyHeart } from "@/hooks/useBuyHeart";
import {
  __resetIdentityForTests,
  getActiveUserId,
  setActiveOwnerInternal,
} from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
const env = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: env.rpc,
    auth: {
      getSession: async () => ({
        data: { session: getActiveUserId() ? { user: { id: getActiveUserId() } } : null },
      }),
    },
  },
}));
const key = "hakaya.profile.v2";
const success = { data: { status: "purchased", hearts: 3, dinars: 80, cost: 20 }, error: null };
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div>storage-boundary</div> : this.props.children;
  }
}
function mount(withBoundary = false) {
  let api!: ReturnType<typeof useProfile>, heart!: ReturnType<typeof useBuyHeart>;
  function Probe() {
    api = useProfile();
    heart = useBuyHeart();
    return null;
  }
  const tree = (
    <ProfileProvider>
      <Probe />
    </ProfileProvider>
  );
  const view = render(withBoundary ? <Boundary>{tree}</Boundary> : tree);
  return {
    view,
    get api() {
      return api;
    },
    get heart() {
      return heart;
    },
  };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  localStorage.setItem(
    key,
    JSON.stringify({
      name: "Alice",
      loggedIn: true,
      points: 100,
      dinars: 100,
      hearts: 2,
      heartsAt: Date.now(),
      streak: 2,
    }),
  );
  env.rpc.mockReset().mockResolvedValue(success);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
});

function guest() {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.loggedIn = false;
  localStorage.setItem(key, JSON.stringify(raw));
  setActiveOwnerInternal("guest:synthetic");
  return mount();
}
it("returns a persisted guest purchase receipt and survives remount", async () => {
  const h = guest();
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => { pending = h.heart.buy(); });
  expect(h.api.profile).toMatchObject({ dinars: 80, hearts: 3 });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ dinars: 80, hearts: 3 });
  expect(await pending).toMatchObject({ status: "purchased" });
  h.view.unmount();
  const next = mount();
  expect(next.api.profile).toMatchObject({ dinars: 80, hearts: 3 });
  expect(env.rpc).not.toHaveBeenCalled();
});
it("does not report guest success after a silently dropped durable write", async () => {
  const h = guest(), bytes = localStorage.getItem(key);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, name, value) {
    if (name !== key) original.call(this, name, value);
  });
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => { pending = h.heart.buy(); });
  expect(await pending).toMatchObject({ status: "unresolved" });
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(env.rpc).not.toHaveBeenCalled();
});

it("preserves fractional guest balances and fixed price", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!); raw.dinars = 100.5;
  localStorage.setItem(key, JSON.stringify(raw));
  const h = guest();
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => { pending = h.heart.buy(); });
  expect(await pending).toMatchObject({status: "purchased"});
  expect(h.api.profile).toMatchObject({dinars: 80.5, hearts: 3});
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({dinars: 80.5, hearts: 3});
});
it("rejects a superseding queued admission without debit or success event", async () => {
  const h = guest(), events = vi.spyOn(window, "dispatchEvent");
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    startTransition(() => { pending = h.heart.buy(); });
    h.api.addPoints(1);
  });
  expect(await pending).toMatchObject({status: "unresolved"});
  expect(h.api.profile).toMatchObject({dinars: 100, hearts: 2, points: 101});
  expect(events.mock.calls.filter(([event]) => event.type === "irth:heart-purchased")).toHaveLength(0);
  expect(await h.heart.buy()).toMatchObject({status: "unresolved"});
});
it.each(["full", "insufficient"])("preserves guest %s no-write result", async kind => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  if (kind === "full") raw.hearts = 5; else raw.dinars = 19;
  localStorage.setItem(key, JSON.stringify(raw));
  const h = guest(), bytes = localStorage.getItem(key);
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => { pending = h.heart.buy(); });
  expect(await pending).toMatchObject({status: kind === "full" ? "hearts_full" : "insufficient_dinars"});
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(env.rpc).not.toHaveBeenCalled();
});
it("does not authorize another purchase after silent persistence loss", async () => {
  const h = guest();
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, name, value) {
    if(name !== key) original.call(this, name, value);
  });
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => { pending = h.heart.buy(); });
  expect(await pending).toMatchObject({status: "unresolved"});
  expect(h.heart.needsReconciliation).toBe(true);
  expect(await h.heart.buy()).toMatchObject({status: "unresolved"});
});
it("rejects a guest ABA identity change before conditional commit", async () => {
  const h = guest(), bytes = localStorage.getItem(key);
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    startTransition(() => { pending = h.heart.buy(); });
    setActiveOwnerInternal("user:bob");
    setActiveOwnerInternal("guest:synthetic");
  });
  expect(await pending).toMatchObject({status: "unresolved"});
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(env.rpc).not.toHaveBeenCalled();
});
