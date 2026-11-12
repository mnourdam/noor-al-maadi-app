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
  unionCompletedIds: async () => new Set(),
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
  env.stats.mockResolvedValue(true);
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


for (const mode of ["debounce", "online", "manual"] as const) {
  for (const outcome of ["false", "rpc-error", "no-session", "success"] as const) {
    it(`${mode}: cloud success with stats ${outcome} only acknowledges successful stats`, async () => {
      env.stable = mode !== "debounce";
      await mount();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
      env.push.mockClear(); env.stats.mockClear();
      env.push.mockResolvedValue(true);
      if (outcome === "false") env.stats.mockResolvedValue(false);
      else {
        const actual = await vi.importActual<typeof import("@/lib/social")>("@/lib/social");
        env.stats.mockImplementation(actual.pushPublicStats);
        env.rpc.mockResolvedValue({ data: null, error: outcome === "rpc-error" ? { message: "synthetic" } : null });
        if (outcome === "no-session") env.getSession.mockResolvedValue({ data: { session: null } });
      }
      await act(async () => { profile.addPoints(20); });
      let manualResult: boolean | undefined;
      if (mode === "debounce") await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      else if (mode === "online") await act(async () => { window.dispatchEvent(new Event("online")); });
      else await act(async () => { manualResult = await account.syncNow(); });
      expect(env.push).toHaveBeenCalledTimes(1);
      expect(env.stats).toHaveBeenCalledTimes(1);
      if (mode === "manual") expect(manualResult).toBe(true);
      expect(account.lastSyncAt).not.toBeNull();
      await act(async () => { env.realtime.at(-1)({ new: { xp: 100, dinars: 500 } }); });
      expect(profile.profile.points).toBe(outcome === "success" ? 100 : 120);
      expect(JSON.parse(localStorage.getItem("hakaya.profile.v2")!).points).toBe(outcome === "success" ? 100 : 120);
    });
  }
}
it("caller revision revoked during actual stats response retains newer local guard", async () => {
  await mount();
  const actual = await vi.importActual<typeof import("@/lib/social")>("@/lib/social");
  env.stats.mockImplementation(actual.pushPublicStats);
  const gate = deferred<any>();
  env.rpc.mockReturnValueOnce(gate.promise);
  await act(async () => { profile.addPoints(20); });
  let pending!: Promise<boolean>;
  await act(async () => { pending = account.syncNow(); });
  expect(env.stats).toHaveBeenCalledTimes(1);
  await act(async () => { profile.addPoints(10); });
  await act(async () => { gate.resolve({ data: null, error: null }); await pending; });
  await act(async () => { env.realtime.at(-1)({ new: { xp: 100, dinars: 500 } }); });
  expect(profile.profile.points).toBe(130);
});
