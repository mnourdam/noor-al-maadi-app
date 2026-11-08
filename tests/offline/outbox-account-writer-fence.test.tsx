import React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { AccountProvider, useAccount } from "@/lib/account";
import {
  __resetIdentityForTests,
  setActiveOwnerInternal,
  getActiveOwner,
  guestOwnerKey,
} from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
const env = vi.hoisted(() => ({
  uid: "alice",
  listener: null as any,
  realtime: [] as any[],
  getSession: vi.fn(),
  fetchAccount: vi.fn(),
  fetchCloud: vi.fn(),
  push: vi.fn(),
  stats: vi.fn(),
  flush: vi.fn(),
  rpc: vi.fn(),
  reconcile: vi.fn(),
  logout: vi.fn(),
  onboard: vi.fn(),
  nativeReset: vi.fn(),
  stable: true,
}));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (done: any) => Promise.resolve({ data: [], error: null }).then(done),
  };
  return {
    supabase: {
      auth: {
        getSession: () => env.getSession(),
        getUser: async () => ({ data: { user: { id: env.uid } } }),
        onAuthStateChange: (cb: any) => {
          env.listener = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
      },
      rpc: (...args: unknown[]) => env.rpc(...args),
      from: () => chain,
      channel: () => {
        const c = {
          on: (_kind: any, _filter: any, cb: any) => {
            env.realtime.push(cb);
            return c;
          },
          subscribe: () => c,
        };
        return c;
      },
      removeChannel: vi.fn(),
    },
  };
});
vi.mock("@/lib/cloud-save", () => ({
  fetchAccountProfile: (...a: any[]) => env.fetchAccount(...a),
  fetchCloudSave: (...a: any[]) => env.fetchCloud(...a),
  pushSave: (...a: any[]) => env.push(...a),
  signOut: () => env.logout(),
  touchLastActive: vi.fn(),
  updateDisplayName: vi.fn(),
  updateUsername: vi.fn(),
  isUsernameAvailable: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}));
vi.mock("@/lib/social", () => ({ pushPublicStats: (...a: any[]) => env.stats(...a) }));
vi.mock("@/lib/identity/guard", () => ({ waitForAuthReady: async () => {} }));
vi.mock("@/lib/identity/reset", () => ({
  resetForIdentityChange: async ({ nextUserId }: any) => {
    const next = nextUserId ? "user:" + nextUserId : guestOwnerKey();
    const changed = getActiveOwner() !== next;
    if (changed) {
      setActiveOwnerInternal(next);
      window.dispatchEvent(new CustomEvent("irth:identity-changed"));
    }
    return { changed };
  },
}));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMark: () => {},
  androidMeasure: () => {},
  recordAndroidAction: () => {},
  isAndroidUltraStableMode: () => env.stable,
}));
vi.mock("@/lib/boot/startup-timeline", () => ({ recordStartupMark: () => {} }));
vi.mock("@/lib/boot/reconciliation", () => ({
  getReconciliationState: () => "offline-local",
  setReconciliationState: (...a: any[]) => env.reconcile(...a),
}));
vi.mock("@/lib/offline/flush", () => ({ flushOutbox: (...a: any[]) => env.flush(...a) }));
vi.mock("@/lib/offline/logout-flush", () => ({
  flushOutboxWithTimeout: async () => ({ pendingAfter: 0 }),
}));
vi.mock("@/lib/native-auth", () => ({ resetNativePkceClient: () => env.nativeReset() }));
vi.mock("@/lib/campaigns/completions", () => ({
  fetchServerCompletedIds: async () => ({ ids: new Set() }),
}));
vi.mock("@/lib/emblems/avatar-persistence", () => ({ reconcileAvatarOnHydrate: async () => null }));
vi.mock("@/lib/entityDiscoveries", () => ({ syncLocalDiscoveriesToServer: async () => {} }));
vi.mock("@/lib/reflections", () => ({ hydrateReflectionsFromServer: async () => {} }));
vi.mock("@/lib/tutorial/persistence", () => ({ hydrateOnboardingFromServer: () => env.onboard() }));
let profile: ReturnType<typeof useProfile>, account: ReturnType<typeof useAccount>;
const session = (uid = env.uid) => ({ user: { id: uid, user_metadata: { display_name: uid } } });
function seed(points = 100) {
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({
      loggedIn: true,
      name: env.uid,
      points,
      dinars: 500,
      hearts: 3,
      heartsAt: Date.now(),
    }),
  );
}
function Probe() {
  profile = useProfile();
  account = useAccount();
  return null;
}
async function mount() {
  const view = render(
    <ProfileProvider>
      <AccountProvider>
        <Probe />
      </AccountProvider>
    </ProfileProvider>,
  );
  await act(async () => {});
  return view;
}
async function switchTo(uid: string) {
  await act(async () => {
    env.uid = uid;
    setActiveOwnerInternal("user:" + uid);
    seed(uid === "alice" ? 100 : 200);
    localStorage.removeItem("hakaya.profile.userId"); // select the synthetic target namespace's marker
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
    env.listener("SIGNED_IN", session(uid));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  vi.clearAllMocks();
  env.uid = "alice";
  env.realtime = [];
  env.stable = true;
  seed();
  env.getSession.mockResolvedValue({ data: { session: session() } });
  env.fetchAccount.mockImplementation(async (id) => ({ id, username: id, display_name: id }));
  env.fetchCloud.mockImplementation(async (id) => ({ user_id: id, data: profile.profile }));
  env.push.mockResolvedValue(true);
  env.stats.mockResolvedValue(undefined);
  env.flush.mockResolvedValue({ flushed: 0, failed: 0 });
  env.rpc.mockResolvedValue({ data: null, error: null });
  env.onboard.mockResolvedValue({ kind: "success" });
  env.logout.mockResolvedValue(undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  vi.unstubAllGlobals();
});
it("valid account hydration and explicit sync use the real profile without reward replay", async () => {
  await mount();
  const result = await account.syncNow();
  expect(result).toBe(true);
  expect(env.push).toHaveBeenCalledTimes(1);
  expect(env.stats).toHaveBeenCalledTimes(1);
  expect(env.push.mock.calls[0][1].points).toBe(100);
});
for (const mode of ["bob", "aba", "unmount"] as const)
  it("late push cannot start a second account write: " + mode, async () => {
    const view = await mount(),
      gate = deferred<boolean>();
    env.push.mockReturnValueOnce(gate.promise);
    let pending!: Promise<boolean>;
    await act(async () => {
      pending = account.syncNow();
    });
    if (mode === "unmount") view.unmount();
    else {
      await switchTo("bob");
      if (mode === "aba") await switchTo("alice");
    }
    await act(async () => {
      gate.resolve(true);
      await pending;
    });
    expect(env.stats).not.toHaveBeenCalled();
  });
it("one sync pins its input and cannot start an old second write after a newer local change", async () => {
  await mount();
  const gate = deferred<boolean>();
  env.push.mockReturnValueOnce(gate.promise);
  let pending!: Promise<boolean>;
  await act(async () => {
    pending = account.syncNow();
  });
  await act(async () => {
    profile.addPoints(7);
  });
  await act(async () => {
    gate.resolve(true);
    await pending;
  });
  expect(env.push.mock.calls[0][1].points).toBe(100);
  expect(env.stats).not.toHaveBeenCalled();
  expect(await pending).toBe(false);
  expect(profile.profile.points).toBe(107);
});
it("old finally cannot release the newer sync's busy flag", async () => {
  await mount();
  const first = deferred<boolean>(),
    second = deferred<boolean>();
  env.push.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  let a!: Promise<boolean>, b!: Promise<boolean>;
  await act(async () => {
    a = account.syncNow();
    b = account.syncNow();
  });
  await act(async () => {
    first.resolve(true);
    await a;
  });
  expect(account.syncing).toBe(true);
  await act(async () => {
    second.resolve(true);
    await b;
  });
  expect(account.syncing).toBe(false);
});
it("late cloud fetch cannot restore a debit accepted while the request was pending", async () => {
  const gate = deferred<any>();
  env.fetchCloud.mockReturnValueOnce(gate.promise);
  await mount();
  const old = profile.profile;
  await act(async () => {
    profile.spendDinars(10);
  });
  await act(async () => {
    gate.resolve({ user_id: "alice", data: old });
  });
  expect(profile.profile.dinars).toBe(490);
  expect(env.reconcile).toHaveBeenCalledWith("offline-local", "profile-revision-unresolved");
});
it("late cold-start stats cannot erase a newer reward after the time window", async () => {
  const gate = deferred<any>();
  env.rpc.mockImplementation((name) =>
    name === "get_my_profile" ? gate.promise : Promise.resolve({ data: [], error: null }),
  );
  await mount();
  await act(async () => {
    profile.addPoints(7);
  });
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10000);
  await act(async () => {
    gate.resolve({ data: { xp: 100, dinars: 500 }, error: null });
  });
  expect(profile.profile.points).toBe(107);
  now.mockRestore();
});
it("an old realtime callback cannot apply after ABA", async () => {
  await mount();
  const old = env.realtime[0];
  await switchTo("bob");
  await switchTo("alice");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 10000);
  await act(async () => {
    old({ new: { xp: 999, dinars: 999 } });
  });
  expect(profile.profile.points).toBe(100);
});
it("online reconnect cannot start a profile write after an old flush returns", async () => {
  await mount();
  const gate = deferred<any>();
  env.flush.mockReturnValueOnce(gate.promise);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await switchTo("bob");
  await act(async () => {
    gate.resolve({ flushed: 1, failed: 0 });
  });
  expect(env.push).not.toHaveBeenCalled();
});
it("signOut final push is pinned and cannot continue against Bob", async () => {
  await mount();
  const gate = deferred<boolean>();
  env.push.mockReturnValueOnce(gate.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = account.signOut();
  });
  await switchTo("bob");
  await act(async () => {
    gate.resolve(true);
    await pending;
  });
  expect(env.stats).not.toHaveBeenCalled();
  expect(env.logout).not.toHaveBeenCalled();
  expect(account.user?.id).toBe("bob");
});
it("successful signOut still sends the original snapshot before resetting identity", async () => {
  await mount();
  await act(async () => {
    await account.signOut();
  });
  expect(env.push.mock.calls[0][0]).toBe("alice");
  expect(env.stats.mock.calls[0][0]).toBe("alice");
  expect(env.logout).toHaveBeenCalledTimes(1);
});
it("failed cloud read is not a missing-cloud seed opportunity", async () => {
  env.fetchCloud.mockRejectedValueOnce(new Error("read-failed"));
  await mount();
  expect(env.push).not.toHaveBeenCalled();
  expect(profile.profile.points).toBe(100);
  expect(env.reconcile).toHaveBeenCalledWith("failed", "read-failed");
});
it("ambiguous previous-user marker preserves V17 bytes and does not seed", async () => {
  localStorage.setItem("hakaya.profile.userId", "other");
  const before = localStorage.getItem("hakaya.profile.v2");
  await mount();
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
  expect(env.push).not.toHaveBeenCalled();
  expect(env.fetchCloud).not.toHaveBeenCalled();
});
it("soft timeout does not authorize a late onboarding response after identity changes", async () => {
  const gate = deferred<any>();
  env.onboard.mockReturnValueOnce(gate.promise);
  vi.useFakeTimers();
  await mount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001);
  });
  expect(env.reconcile).toHaveBeenCalledWith("offline-local", expect.any(String));
  await switchTo("bob");
  env.reconcile.mockClear();
  await act(async () => {
    gate.resolve({ kind: "success" });
  });
  expect(env.reconcile).not.toHaveBeenCalledWith("reconciled");
});
it("corrupt local file does not start account seeding or economic imports", async () => {
  localStorage.setItem("hakaya.profile.v2", "{");
  await mount();
  expect(env.push).not.toHaveBeenCalled();
  expect(env.fetchCloud).not.toHaveBeenCalled();
  expect(localStorage.getItem("hakaya.profile.v2")).toBe("{");
});
it("web debounce never chains Alice's old upload into Bob's public profile", async () => {
  env.stable = false;
  vi.useFakeTimers();
  const gate = deferred<boolean>();
  env.push.mockReturnValueOnce(gate.promise);
  await mount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1501);
  });
  expect(env.push.mock.calls[0][0]).toBe("alice");
  env.reconcile.mockClear();
  await switchTo("bob");
  await act(async () => {
    await vi.waitFor(() => expect(env.reconcile).toHaveBeenCalledWith("reconciled"));
    gate.resolve(true);
  });
  expect(env.stats.mock.calls.some(([uid]) => uid === "alice")).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1501);
  });
  expect(env.stats.mock.calls.some(([uid]) => uid === "bob")).toBe(true);
});
it("a newer debit during final signOut upload prevents stale stats and destructive logout", async () => {
  await mount();
  const gate = deferred<boolean>();
  env.push.mockReturnValueOnce(gate.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = account.signOut();
  });
  await act(async () => {
    profile.spendDinars(10);
  });
  await act(async () => {
    gate.resolve(true);
    await pending;
  });
  expect(profile.profile.dinars).toBe(490);
  expect(env.stats).not.toHaveBeenCalled();
  expect(env.logout).not.toHaveBeenCalled();
  expect(account.user?.id).toBe("alice");
  expect(account.isAuthResetting).toBe(false);
});
it("a late initial getSession result cannot undo a newer auth event", async () => {
  const gate = deferred<any>();
  env.getSession.mockReturnValueOnce(gate.promise);
  await mount();
  await switchTo("bob");
  await act(async () => {
    gate.resolve({ data: { session: session("alice") } });
  });
  expect(account.user?.id).toBe("bob");
});
it("late account metadata cannot overwrite the newer owner's frame", async () => {
  const gate = deferred<any>();
  env.fetchAccount.mockReturnValueOnce(gate.promise);
  await mount();
  await switchTo("bob");
  await act(async () => {
    gate.resolve({ id: "alice", username: "old-alice", display_name: "old-alice" });
  });
  expect(account.account?.id).toBe("bob");
  expect(account.displayName).not.toBe("old-alice");
});
