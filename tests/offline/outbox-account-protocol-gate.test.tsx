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
  ready: true,
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
vi.mock("@/lib/identity/guard", () => ({
  waitForAuthReady: async () => {},
  isAuthReady: () => env.ready,
}));
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
async function mount(enabled = false) {
  const view = render(
    <ProfileProvider>
      <AccountProvider compatibilityGateProbeForTests={enabled}>
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
  env.ready = true;
  seed();
  env.getSession.mockImplementation(async () => ({ data: { session: session() } }));
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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  vi.unstubAllGlobals();
});

const gatePayload = (diagnostic = "candidate") => ({
  schema_version: 1,
  protocol_state: diagnostic === "incomplete" ? "unresolved" : "legacy",
  diagnostic_state: diagnostic,
  economic_authority_enabled: false,
});
const gateCalls = () =>
  env.rpc.mock.calls.filter(([name]) => name === "get_economic_protocol_gate_v1");
it("normal login performs no gate RPC or additional session read", async () => {
  await mount();
  expect(account.loadingSession).toBe(false);
  expect(account.user?.id).toBe("alice");
  expect(account.protocolGate).toMatchObject({
    protocolState: "legacy",
    economicAuthorityEnabled: false,
    readState: "disabled",
  });
  expect(gateCalls()).toHaveLength(0);
  // Existing boot plus claimed-streak pre/post session checks; no diagnostic read.
  expect(env.getSession).toHaveBeenCalledTimes(3);
});
it("even the test prop cannot enable the probe in a production build", async () => {
  vi.stubEnv("MODE", "production");
  await mount(true);
  expect(gateCalls()).toHaveLength(0);
  expect(account.protocolGate.readState).toBe("disabled");
});
it("test-only probe reads after readiness and never changes wallet, Cloud or Settlement", async () => {
  env.ready = false;
  env.rpc.mockImplementation(async (name) => ({
    data: name === "get_economic_protocol_gate_v1" ? gatePayload() : null,
    error: null,
  }));
  vi.useFakeTimers();
  await mount(true);
  expect(gateCalls()).toHaveLength(0);
  const before = localStorage.getItem("hakaya.profile.v2");
  const open = vi.fn();
  vi.stubGlobal("indexedDB", { open });
  env.ready = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(25);
  });
  expect(account.protocolGate).toMatchObject({
    diagnosticState: "candidate",
    economicAuthorityEnabled: false,
    readState: "resolved",
  });
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
  expect(env.push).not.toHaveBeenCalled();
  expect(env.stats).not.toHaveBeenCalled();
  expect(gateCalls()).toEqual([["get_economic_protocol_gate_v1"]]);
  expect(open).not.toHaveBeenCalled();
  expect(JSON.parse(before!)).not.toHaveProperty("appliedGrant");
  expect(JSON.parse(before!)).not.toHaveProperty("delivered");
});
it("failed gate read does not block login or mutate the profile", async () => {
  env.rpc.mockImplementation(async (name) => ({
    data: null,
    error: name === "get_economic_protocol_gate_v1" ? { code: "42501" } : null,
  }));
  await mount(true);
  expect(account.loadingSession).toBe(false);
  expect(account.user?.id).toBe("alice");
  expect(account.protocolGate).toMatchObject({
    readState: "unresolved",
    economicAuthorityEnabled: false,
    reason: "rpc_error",
  });
  expect(profile.profile.points).toBe(100);
  expect(profile.profile.dinars).toBe(500);
});
it("a hanging diagnostic times out without blocking normal authentication", async () => {
  const gate = deferred<any>();
  env.rpc.mockImplementation((name) =>
    name === "get_economic_protocol_gate_v1"
      ? gate.promise
      : Promise.resolve({ data: null, error: null }),
  );
  vi.useFakeTimers();
  await mount(true);
  expect(account.loadingSession).toBe(false);
  expect(account.user?.id).toBe("alice");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(account.protocolGate).toMatchObject({
    readState: "unresolved",
    reason: "timeout",
    economicAuthorityEnabled: false,
  });
  await act(async () => {
    gate.resolve({ data: gatePayload(), error: null });
    await Promise.resolve();
  });
  expect(account.protocolGate.reason).toBe("timeout");
});
for (const aba of [false, true])
  it(
    "old gate result cannot enter the current Account frame: " + (aba ? "ABA" : "Bob"),
    async () => {
      const old = deferred<any>(),
        live = deferred<any>();
      let call = 0;
      env.rpc.mockImplementation((name) =>
        name === "get_economic_protocol_gate_v1"
          ? ++call === 1
            ? old.promise
            : live.promise
          : Promise.resolve({ data: null, error: null }),
      );
      await mount(true);
      expect(gateCalls()).toHaveLength(1);
      await switchTo("bob");
      if (aba) await switchTo("alice");
      await act(async () => {
        live.resolve({ data: gatePayload("incomplete"), error: null });
      });
      expect(account.protocolGate.diagnosticState).toBe("incomplete");
      const before = account.protocolGate;
      await act(async () => {
        old.resolve({ data: gatePayload("candidate"), error: null });
      });
      expect(account.protocolGate).toBe(before);
      expect(account.protocolGate.economicAuthorityEnabled).toBe(false);
    },
  );
it("unmount prevents a late gate response from publishing", async () => {
  const gate = deferred<any>();
  env.rpc.mockImplementation((name) =>
    name === "get_economic_protocol_gate_v1"
      ? gate.promise
      : Promise.resolve({ data: null, error: null }),
  );
  const view = await mount(true),
    before = account.protocolGate;
  view.unmount();
  await act(async () => {
    gate.resolve({ data: gatePayload(), error: null });
  });
  expect(account.protocolGate).toBe(before);
});

it("production test-mode builds also ignore the probe prop", async () => {
  vi.stubEnv("MODE", "test");
  vi.stubEnv("PROD", true);
  await mount(true);
  expect(gateCalls()).toHaveLength(0);
  expect(account.protocolGate.readState).toBe("disabled");
});
