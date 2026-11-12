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


it("does not let Alice's quiz penalty suppress Bob's same question penalty", async () => {
  const attempt = "quiz:campaign:chapter:quiz:owner-isolation-repro";
  const a = mount();
  await act(async () => { a.api.loseHeartOnce(attempt); });
  expect(a.api.profile.hearts).toBe(1);
  a.view.unmount();
  setActiveOwnerInternal("user:bob");
  localStorage.setItem(key, JSON.stringify({name:"Bob", loggedIn:true, points:100, dinars:100, hearts:2, heartsAt:Date.now(), streak:2}));
  const b = mount();
  await act(async () => { b.api.loseHeartOnce(attempt); });
  expect(b.api.profile.hearts).toBe(1);
});

function fresh(owner: string, hearts = 3) {
  setActiveOwnerInternal(owner);
  localStorage.setItem(key, JSON.stringify({name:owner, loggedIn:owner.startsWith("user:"), points:100, dinars:100, hearts, heartsAt:Date.now(), streak:2}));
  return mount();
}
it("preserves Alice's own dedup after Bob and an Alice remount", async () => {
  const attempt = "owner-cycle";
  const a = fresh("user:alice");
  await act(async () => { a.api.loseHeartOnce(attempt); a.api.loseHeartOnce(attempt); });
  expect(a.api.profile.hearts).toBe(2);
  const aliceBytes = localStorage.getItem(key)!;
  a.view.unmount();
  const b = fresh("user:bob");
  await act(async () => { b.api.loseHeartOnce(attempt); });
  expect(b.api.profile.hearts).toBe(2); b.view.unmount();
  setActiveOwnerInternal("user:alice"); localStorage.setItem(key, aliceBytes);
  const again = mount();
  await act(async () => { again.api.loseHeartOnce(attempt); });
  expect(again.api.profile.hearts).toBe(2);
  expect(localStorage.getItem(key)).toBe(aliceBytes);
});
it("does not let a stale callback reserve the next owner's attempt", async () => {
  const a = fresh("user:stale"), stale = a.api.loseHeartOnce;
  a.view.unmount();
  const b = fresh("user:next");
  await act(async () => { stale("stale-unique"); });
  expect(b.api.profile.hearts).toBe(3);
  await act(async () => { b.api.loseHeartOnce("stale-unique"); });
  expect(b.api.profile.hearts).toBe(2);
});
it("keeps distinct attempts distinct for the same owner", async () => {
  const h = fresh("user:distinct");
  await act(async () => { h.api.loseHeartOnce("one"); h.api.loseHeartOnce("two"); });
  expect(h.api.profile.hearts).toBe(1);
});
it("separates guest and authenticated owners for the same attempt", async () => {
  const g = fresh("guest:synthetic");
  await act(async () => { g.api.loseHeartOnce("guest-same"); });
  expect(g.api.profile.hearts).toBe(2); g.view.unmount();
  const a = fresh("user:guest-next");
  await act(async () => { a.api.loseHeartOnce("guest-same"); });
  expect(a.api.profile.hearts).toBe(2);
});
it("uses unambiguous owner/attempt tuple keys", async () => {
  const a = fresh("user:a:b");
  await act(async () => { a.api.loseHeartOnce("c"); });
  expect(a.api.profile.hearts).toBe(2); a.view.unmount();
  const b = fresh("user:a");
  await act(async () => { b.api.loseHeartOnce("b:c"); });
  expect(b.api.profile.hearts).toBe(2);
});
