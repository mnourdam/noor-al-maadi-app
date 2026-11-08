import React, { StrictMode } from "react";
import { render, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
import { openSettlementDatabase, SETTLEMENT_STORES } from "@/lib/rewards/database";
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
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
it("REPRO delayed same-owner server stats erase newer local reward calls and persist the old balances", async () => {
  const h = harness(),
    gate = deferred<{ xp: number; dinars: number }>();
  const followup = gate.promise.then((stats) => h.api.applyServerStats(stats));
  await act(async () => {
    h.api.addPoints(7);
    h.api.addDinars(3);
  });
  expect(h.api.profile.points).toBe(107);
  expect(h.api.profile.dinars).toBe(53);
  await act(async () => {
    gate.resolve({ xp: 100, dinars: 50 });
    await followup;
  });
  expect(h.api.profile.points).toBe(100);
  expect(saved().points).toBe(100);
  expect(saved().dinars).toBe(50);
});
it("REPRO late Cloud Save merge can restore dinars already spent", async () => {
  seed(100, 500);
  const h = harness(),
    gate = deferred<Api["profile"]>();
  const old = h.api.profile;
  const followup = gate.promise.then((cloud) => h.api.mergeCloudSave(cloud));
  await act(async () => {
    h.api.spendDinars(10);
  });
  expect(h.api.profile.dinars).toBe(490);
  await act(async () => {
    gate.resolve(old);
    await followup;
  });
  expect(h.api.profile.dinars).toBe(500);
  expect(saved().dinars).toBe(500);
});
it("REPRO retained replaceProfile can undo a debit and heart loss without a source revision", async () => {
  const h = harness(),
    old = h.api.profile;
  await act(async () => {
    h.api.spendDinars(10);
    h.api.loseHeartOnce("p105a:replace");
  });
  expect(h.api.profile.dinars).toBe(40);
  expect(h.api.profile.hearts).toBe(2);
  await act(async () => {
    h.api.replaceProfile(old);
  });
  expect(saved().dinars).toBe(50);
  expect(saved().hearts).toBe(3);
});
it("REPRO two independent real providers for one owner overwrite each other's persisted projection", async () => {
  const first = harness(),
    second = harness();
  await act(async () => {
    first.api.addPoints(7);
  });
  expect(saved().points).toBe(107);
  await act(async () => {
    second.api.addDinars(1);
  });
  expect(first.api.profile.points).toBe(107);
  expect(second.api.profile.points).toBe(100);
  expect(saved().points).toBe(100);
  expect(saved().dinars).toBe(51);
});
it("REPRO React batching does not fence an older authoritative assignment", async () => {
  const h = harness();
  await act(async () => {
    h.api.addPoints(7);
    h.api.addDinars(3);
    h.api.applyServerStats({ xp: 100, dinars: 50 });
  });
  expect(saved().points).toBe(100);
  expect(saved().dinars).toBe(50);
});
it("REPRO StrictMode does not turn React mutations into a durable grant protocol", async () => {
  const h = harness(true),
    old = h.api.profile;
  await act(async () => {
    h.api.addPoints(7);
  });
  expect(saved().points).toBe(107);
  await act(async () => {
    h.api.replaceProfile(old);
  });
  expect(saved().points).toBe(100);
});
for (const aba of [false, true]) {
  it(
    "REGRESSION retained addPoints callback cannot cross identity " + (aba ? "ABA" : "Alice to Bob"),
    async () => {
      const h = harness(),
        retained = h.api.addPoints;
      await act(async () => {
        setActiveOwnerInternal("user:bob");
        seed(200, 80);
        window.dispatchEvent(new CustomEvent("irth:identity-changed"));
      });
      if (aba)
        await act(async () => {
          setActiveOwnerInternal("user:alice");
          seed(100, 50);
          window.dispatchEvent(new CustomEvent("irth:identity-changed"));
        });
      const targetProfile = h.api.profile;
      const targetBytes = localStorage.getItem("hakaya.profile.v2");
      const persistenceBefore = h.api.getPersistence();
      await act(async () => {
        expect(retained(7)).toBeUndefined(); // A rejected void action is not an economic receipt.
      });
      expect(h.api.profile.points).toBe(aba ? 100 : 200);
      expect(saved().points).toBe(aba ? 100 : 200);
      expect(h.api.profile).toBe(targetProfile); // Every field, not just points.
      expect(localStorage.getItem("hakaya.profile.v2")).toBe(targetBytes);
      expect(h.api.getPersistence()).toEqual(persistenceBefore);
    },
  );
}
it("REPRO old stats erase newer currency effects while the existing heart loss remains", async () => {
  const h = harness();
  await act(async () => {
    h.api.addDinars(3);
    h.api.spendDinars(10);
    h.api.loseHeartOnce("p105a:concurrent");
  });
  expect(h.api.profile.dinars).toBe(43);
  expect(h.api.profile.hearts).toBe(2);
  await act(async () => {
    h.api.applyServerStats({ dinars: 50, hearts: 3 });
  });
  expect(saved().dinars).toBe(50);
  expect(saved().hearts).toBe(2);
});
for (const fault of ["corrupt", "SecurityError"] as const) {
  it(
    "REPRO missing trustworthy hydration " + fault + " is not an admitted economic baseline",
    () => {
      if (fault === "corrupt") localStorage.setItem("hakaya.profile.v2", "{");
      else {
        const original = Storage.prototype.getItem;
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
          this: Storage,
          key: string,
        ) {
          if (key.startsWith("hakaya.profile.v2"))
            throw new DOMException("blocked", "SecurityError");
          return original.call(this, key);
        });
      }
      const h = harness();
      expect(h.api.profile.points).toBe(0);
      expect(h.api.hydrated).toBe(true);
      // Existing fallback rendering is not evidence permitting IDB admission.
    },
  );
}
it("real ProfileProvider writes do not create any admitted Settlement economy or applied evidence", async () => {
  const h = harness();
  await act(async () => {
    h.api.addPoints(7);
    h.api.addDinars(3);
  });
  expect(saved().points).toBe(107);
  const db = await openSettlementDatabase();
  try {
    const counts = await new Promise<number[]>((resolve, reject) => {
      const tx = db.transaction([...SETTLEMENT_STORES], "readonly");
      const result: number[] = [];
      SETTLEMENT_STORES.forEach((name, index) => {
        const req = tx.objectStore(name).count();
        req.onsuccess = () => {
          result[index] = req.result;
        };
      });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error);
    });
    expect(counts.every((count) => count === 0)).toBe(true);
  } finally {
    db.close();
  }
});
it("a cold provider restart restores the stale overwrite, not a hidden durable reward", async () => {
  let h = harness();
  await act(async () => {
    h.api.addPoints(7);
  });
  await act(async () => {
    h.api.applyServerStats({ xp: 100 });
  });
  h.view.unmount();
  h = harness();
  expect(h.api.profile.points).toBe(100);
  expect(saved().points).toBe(100);
});

it("quota after a React mutation is not durable profile inclusion", async () => {
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
      return this.state.failed ? <div>storage failed</div> : this.props.children;
    }
  }
  let api: Api;
  function Probe() {
    api = useProfile();
    return null;
  }
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <Boundary>
      <ProfileProvider>
        <Probe />
      </ProfileProvider>
    </Boundary>,
  );
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "hakaya.profile.v2") throw new DOMException("full", "QuotaExceededError");
    return original.call(this, key, value);
  });
  await act(async () => {
    api!.addPoints(7);
  });
  expect(errors.some((error) => error.name === "QuotaExceededError")).toBe(true);
  expect(saved().points).toBe(100);
  expect(log).toHaveBeenCalled(); // React reports the caught persistence-effect error.
});
