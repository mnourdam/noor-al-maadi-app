import React, { StrictMode, startTransition, useLayoutEffect } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProfileProvider, useProfile } from "@/lib/profile";
import {
  __resetIdentityForTests,
  setActiveOwnerInternal,
  getActiveOwner,
} from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
import { openSettlementDatabase, SETTLEMENT_STORES } from "@/lib/rewards/database";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => asyncEnv.claims(...args),
    auth: {
      getSession: async () => ({
        data: {
          session: getActiveOwner().startsWith("user:")
            ? { user: { id: getActiveOwner().slice(5) } }
            : null,
        },
      }),
    },
  },
}));

const asyncEnv = vi.hoisted(() => ({ streak: vi.fn(), avatar: vi.fn(), claims: vi.fn() }));
vi.mock("@/lib/streak-activity", () => ({
  recordStreakActivity: (...args: any[]) => asyncEnv.streak(...args),
}));
vi.mock("@/lib/emblems/avatar-persistence", () => ({
  persistAvatarSelection: (...args: any[]) => asyncEnv.avatar(...args),
}));
type Api = ReturnType<typeof useProfile>;
function seed(points = 100, dinars = 50) {
  localStorage.setItem(
    "hakaya.profile.v2",
    JSON.stringify({
      name: "Synthetic",
      loggedIn: true,
      points,
      dinars,
      hearts: 3,
      heartsAt: Date.now(),
      streak: 2,
    }),
  );
}
function harness(strict = false) {
  const ref = { api: null as Api | null };
  function Probe() {
    ref.api = useProfile();
    return null;
  }
  const tree = (
    <ProfileProvider>
      <Probe />
    </ProfileProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    view,
    get api() {
      return ref.api!;
    },
  };
}
function saved() {
  return JSON.parse(localStorage.getItem("hakaya.profile.v2")!);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  asyncEnv.streak.mockReset();
  asyncEnv.avatar.mockReset();
  asyncEnv.claims.mockReset();
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  seed();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("network forbidden");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
  vi.unstubAllGlobals();
});
it("valid V17 hydration does not rewrite the saved bytes or add revision fields", () => {
  const before = localStorage.getItem("hakaya.profile.v2");
  const h = harness();
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
  expect(h.api.getPersistence().outcome).toBe("unwritten");
  expect(h.api.profile.points).toBe(100);
});
it("same-tick relative mutations retain both increments and bind the persisted snapshot", async () => {
  const h = harness(),
    before = h.api.getPersistence();
  await act(async () => {
    h.api.addPoints(7);
    h.api.addDinars(3);
  });
  const evidence = h.api.getPersistence();
  expect(saved().points).toBe(107);
  expect(saved().dinars).toBe(53);
  expect(evidence.owner).toBe("user:alice");
  expect(evidence.revision).toBe(before.revision + 2);
  expect(evidence.snapshot).not.toBe(before.snapshot);
  expect(evidence.outcome).toBe("written");
  expect(saved()).not.toHaveProperty("revision");
  expect(saved()).not.toHaveProperty("epoch");
});
for (const aba of [false, true])
  it(
    "deferred admitted write cannot persist across identity " + (aba ? "ABA" : "Alice to Bob"),
    async () => {
      const h = harness();
      await act(async () => {
        startTransition(() => h.api.addPoints(7));
        setActiveOwnerInternal("user:bob");
        seed(200, 80);
        window.dispatchEvent(new CustomEvent("irth:identity-changed"));
        if (aba) {
          setActiveOwnerInternal("user:alice");
          seed(100, 50);
          window.dispatchEvent(new CustomEvent("irth:identity-changed"));
        }
      });
      expect(h.api.profile.points).toBe(aba ? 100 : 200);
      expect(saved().points).toBe(aba ? 100 : 200);
      expect(h.api.getPersistence().owner).toBe(aba ? "user:alice" : "user:bob");
    },
  );
it("old passive persistence after an identity-switch layout effect cannot write Alice's frame", async () => {
  let api: Api;
  function Switch() {
    api = useProfile();
    useLayoutEffect(() => {
      if (api.profile.points === 107) {
        setActiveOwnerInternal("user:bob");
        seed(200, 80);
        window.dispatchEvent(new CustomEvent("irth:identity-changed"));
      }
    }, [api.profile.points]);
    return null;
  }
  render(
    <ProfileProvider>
      <Switch />
    </ProfileProvider>,
  );
  await act(async () => {
    api!.addPoints(7);
  });
  expect(api!.profile.points).toBe(200);
  expect(saved().points).toBe(200);
});
it("unmount before a transition commit cannot persist its queued frame", async () => {
  const h = harness();
  await act(async () => {
    startTransition(() => h.api.addPoints(7));
    h.view.unmount();
  });
  expect(saved().points).toBe(100);
});
it("corrupt V17 bytes survive hydration and a later attempted update", async () => {
  localStorage.setItem("hakaya.profile.v2", "{");
  const h = harness();
  await act(async () => {
    h.api.addPoints(7);
  });
  expect(localStorage.getItem("hakaya.profile.v2")).toBe("{");
  expect(h.api.getPersistence().outcome).toBe("unresolved");
});
it("read SecurityError cannot turn into a seed overwrite", async () => {
  const original = Storage.prototype.getItem;
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    key,
  ) {
    if (key === "hakaya.profile.v2") throw new DOMException("blocked", "SecurityError");
    return original.call(this, key);
  });
  const h = harness();
  await act(async () => {
    h.api.addPoints(7);
  });
  expect(h.api.getPersistence().outcome).toBe("unresolved");
  spy.mockRestore();
  expect(saved().points).toBe(100);
});
for (const mode of ["QuotaExceededError", "SecurityError", "lost-ack"] as const) {
  it("persistence outcome distinguishes unsuccessful call from rollback: " + mode, async () => {
    const errors: Error[] = [];
    class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error: Error) {
        errors.push(error);
      }
      render() {
        return this.state.failed ? null : this.props.children;
      }
    }
    let api: Api;
    function Probe() {
      api = useProfile();
      return null;
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <Boundary>
        <ProfileProvider>
          <Probe />
        </ProfileProvider>
      </Boundary>,
    );
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "hakaya.profile.v2") {
        if (mode === "lost-ack") original.call(this, key, value);
        throw new DOMException("blocked", mode === "lost-ack" ? "SecurityError" : mode);
      }
      original.call(this, key, value);
    });
    await act(async () => {
      api!.addPoints(7);
    });
    expect(errors).toHaveLength(1);
    expect(api!.getPersistence().outcome).toBe("failed");
    expect(saved().points).toBe(mode === "lost-ack" ? 107 : 100);
  });
}
it("a legitimate debit remains a decrement and needs no Web Locks claim", async () => {
  const h = harness();
  await act(async () => {
    h.api.spendDinars(10);
  });
  expect(saved().dinars).toBe(40);
  expect(h.api.getPersistence().outcome).toBe("written");
});
it("StrictMode hydration does not persist a temporary initial state", async () => {
  const before = localStorage.getItem("hakaya.profile.v2");
  const h = harness(true);
  expect(h.api.profile.points).toBe(100);
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
  await act(async () => {
    h.api.addPoints(7);
  });
  expect(saved().points).toBe(107);
});

function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function swap(h: ReturnType<typeof harness>, uid: string) {
  await act(async () => {
    setActiveOwnerInternal("user:" + uid);
    seed(uid === "bob" ? 200 : 100);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  void h;
}
it("Streak cannot start a new RPC after its module await crosses identity", async () => {
  const h = harness();
  asyncEnv.streak.mockClear();
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.api.recordStreakActivity("investigation", "fixture");
    setActiveOwnerInternal("user:bob");
    seed(200);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
    await pending;
  });
  expect(asyncEnv.streak).not.toHaveBeenCalled();
  expect(saved().points).toBe(200);
});
it("late Streak result cannot overwrite a newer accepted debit or XP", async () => {
  const h = harness(),
    deferred = gate<any>();
  asyncEnv.streak.mockReturnValueOnce(deferred.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.api.recordStreakActivity("investigation", "fixture");
  });
  expect(asyncEnv.streak).toHaveBeenCalledTimes(1);
  await act(async () => {
    h.api.addPoints(7);
    h.api.spendDinars(10);
  });
  await act(async () => {
    deferred.resolve({ ok: true, xp_total: 100, dinar_balance: 50, grants: [] });
    await pending;
  });
  expect(saved().points).toBe(107);
  expect(saved().dinars).toBe(40);
});
it("late claimed-Streak hydration after ABA cannot modify the new generation", async () => {
  const h = harness(),
    deferred = gate<any>();
  asyncEnv.claims.mockReturnValueOnce(deferred.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.api.hydrateClaimedStreakRewards();
  });
  expect(asyncEnv.claims).toHaveBeenCalledTimes(1);
  await swap(h, "bob");
  await swap(h, "alice");
  await act(async () => {
    deferred.resolve({ data: [7], error: null });
    await pending;
  });
  expect(h.api.profile.streakMilestonesClaimed).not.toContain(7);
});
it("late failed avatar persistence cannot restore Alice's avatar into Bob", async () => {
  const h = harness(),
    deferred = gate<any>();
  asyncEnv.avatar.mockReturnValueOnce(deferred.promise);
  let pending!: Promise<any>;
  await act(async () => {
    pending = h.api.setAvatarDurable("synthetic-avatar");
  });
  expect(asyncEnv.avatar).toHaveBeenCalledTimes(1);
  await swap(h, "bob");
  await act(async () => {
    h.api.replaceProfile({ ...h.api.profile, avatarId: "synthetic-avatar" });
  });
  await act(async () => {
    deferred.resolve("failed");
    await pending;
  });
  expect(h.api.profile.avatarId).toBe("synthetic-avatar");
});
it("identity change during synchronous hydration cannot persist the interrupted owner's data", async () => {
  const original = Storage.prototype.getItem;
  let interrupted = false;
  const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
    this: Storage,
    key,
  ) {
    const data = original.call(this, key);
    if (key === "hakaya.profile.v2" && !interrupted) {
      interrupted = true;
      setActiveOwnerInternal("user:bob");
      seed(200);
    }
    return data;
  });
  const h = harness();
  spy.mockRestore();
  expect(saved().points).toBe(200);
  await act(async () => {
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  expect(h.api.profile.points).toBe(200);
  expect(saved().points).toBe(200);
});
it("profile hardening never opens the Settlement database", async () => {
  const spy = vi.spyOn(indexedDB, "open");
  const h = harness();
  await act(async () => {
    h.api.addPoints(7);
    h.api.addDinars(3);
  });
  expect(spy).not.toHaveBeenCalled();
});
it("unreadable profile cannot acknowledge a reserved debit that will never be persisted", async () => {
  localStorage.setItem("hakaya.profile.v2", "{");
  const h = harness();
  let accepted = true;
  await act(async () => {
    accepted = h.api.trySpendDinars(1);
  });
  expect(accepted).toBe(false);
  expect(localStorage.getItem("hakaya.profile.v2")).toBe("{");
});
it("unreadable profile cannot start claimed-streak hydration", async () => {
  localStorage.setItem("hakaya.profile.v2", "{");
  asyncEnv.claims.mockClear();
  const h = harness();
  await act(async () => {
    await h.api.hydrateClaimedStreakRewards();
  });
  expect(asyncEnv.claims).not.toHaveBeenCalled();
});
it("explicit reset invalidates an older in-flight Profile RPC context", async () => {
  const h = harness(),
    deferred = gate<any>();
  asyncEnv.streak.mockReturnValueOnce(deferred.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.api.recordStreakActivity("investigation", "fixture");
  });
  await act(async () => {
    h.api.resetProfile();
  });
  const points = h.api.profile.points,
    dinars = h.api.profile.dinars;
  await act(async () => {
    deferred.resolve({ ok: true, xp_total: 999, dinar_balance: 999, grants: [] });
    await pending;
  });
  expect(saved().points).toBe(points);
  expect(saved().dinars).toBe(dinars);
});

it("an async Profile method retained before ABA cannot start work in the new generation", async () => {
  const h = harness(),
    old = h.api.recordStreakActivity;
  await swap(h, "bob");
  await swap(h, "alice");
  await act(async () => {
    await old("investigation", "fixture");
  });
  expect(asyncEnv.streak).not.toHaveBeenCalled();
  expect(saved().points).toBe(100);
});
