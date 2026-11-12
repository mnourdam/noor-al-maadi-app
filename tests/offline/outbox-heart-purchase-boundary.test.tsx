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
function gate() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  env.rpc.mockReturnValue(promise);
  return { resolve };
}
const purchaseEvents = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.filter(([event]: [Event]) => (event as Event).type === "irth:heart-purchased");
it.each(["progress", "spending", "queued-update"])(
  "does not overwrite intervening same-owner %s",
  async (kind) => {
    const h = mount(),
      d = gate();
    let pending!: ReturnType<typeof h.heart.buy>;
    const events = vi.spyOn(window, "dispatchEvent");
    await act(async () => {
      pending = h.heart.buy();
    });
    let expected: string | null;
    if (kind === "queued-update") {
      await act(async () => {
        h.api.addPoints(7);
        d.resolve(success);
        await pending;
      });
      expected = localStorage.getItem(key);
    } else {
      await act(async () => {
        if (kind === "progress") h.api.addPoints(7);
        else h.api.spendDinars(10);
      });
      expected = localStorage.getItem(key);
      await act(async () => {
        d.resolve(success);
        await pending;
      });
    }
    expect(await pending).toMatchObject({ status: "unresolved" });
    expect(h.api.profile).toMatchObject({
      points: kind === "spending" ? 100 : 107,
      dinars: kind === "spending" ? 90 : 100,
      hearts: 2,
    });
    expect(localStorage.getItem(key)).toBe(expected);
    expect(purchaseEvents(events)).toHaveLength(0);
  },
);
it.each([false, true])("suppresses old identity result and event (ABA=%s)", async (aba) => {
  const h = mount(),
    d = gate(),
    events = vi.spyOn(window, "dispatchEvent");
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    pending = h.heart.buy();
  });
  await act(async () => {
    setActiveOwnerInternal("user:bob");
    if (aba) setActiveOwnerInternal("user:alice");
  });
  const bytes = localStorage.getItem(key);
  await act(async () => {
    d.resolve(success);
    await pending;
  });
  expect(await pending).toMatchObject({ status: "unresolved" });
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(purchaseEvents(events)).toHaveLength(0);
});
it("unmounted purchase cannot publish a success event", async () => {
  const h = mount(),
    d = gate(),
    events = vi.spyOn(window, "dispatchEvent");
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    pending = h.heart.buy();
  });
  h.view.unmount();
  d.resolve(success);
  expect(await pending).toMatchObject({ status: "unresolved" });
  expect(purchaseEvents(events)).toHaveLength(0);
});
it.each([
  null,
  {},
  { status: "unknown", hearts: 3, dinars: 80 },
  { status: "purchased" },
  { status: "purchased", hearts: NaN, dinars: 80 },
  { status: "purchased", hearts: 3, dinars: Infinity },
  { status: "purchased", hearts: 3, dinars: -Infinity },
  { status: "purchased", hearts: 6, dinars: 80 },
])("does not acknowledge or persist malformed receipt %j", async (data) => {
  const h = mount(),
    bytes = localStorage.getItem(key),
    events = vi.spyOn(window, "dispatchEvent");
  env.rpc.mockResolvedValue({ data, error: null });
  let result;
  await act(async () => {
    result = await h.heart.buy();
  });
  expect(result).toMatchObject({ status: "unresolved" });
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(purchaseEvents(events)).toHaveLength(0);
});
it("applies valid unchanged-owner purchase without replacing unrelated fields", async () => {
  const h = mount(),
    events = vi.spyOn(window, "dispatchEvent");
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    pending = h.heart.buy();
  });
  const result = await pending;
  expect(result).toMatchObject({ status: "purchased", hearts: 3, dinars: 80 });
  expect(h.api.profile).toMatchObject({ points: 100, name: "Alice", hearts: 3, dinars: 80 });
  expect(purchaseEvents(events)).toHaveLength(1);
  expect(env.rpc).toHaveBeenCalledTimes(1);
});
it("uncertain RPC failure never automatically retries", async () => {
  const h = mount();
  env.rpc.mockResolvedValue({ data: null, error: { message: "connection lost" } });
  let result;
  await act(async () => {
    result = await h.heart.buy();
  });
  expect(result).toMatchObject({ status: "unresolved" });
  expect(env.rpc).toHaveBeenCalledTimes(1);
});

it("blocks repeat RPC after an uncertain response for this hook lifetime", async () => {
  const h = mount();
  env.rpc.mockResolvedValue({ data: {}, error: null });
  let first;
  await act(async () => {
    first = await h.heart.buy();
  });
  expect(first).toMatchObject({ status: "unresolved" });
  expect(h.heart.needsReconciliation).toBe(true);
  expect(await h.heart.buy()).toMatchObject({ status: "unresolved" });
  expect(env.rpc).toHaveBeenCalledTimes(1);
});
it("an old saved buy callback cannot use a newer same-owner baseline", async () => {
  const h = mount(),
    old = h.heart.buy;
  await act(async () => h.api.addPoints(1));
  let result;
  await act(async () => {
    result = await old();
  });
  expect(result).toMatchObject({ status: "failed" });
  expect(env.rpc).not.toHaveBeenCalled();
});

it("does not publish success when conditional persistence fails", async () => {
  const h = mount(true),
    events = vi.spyOn(window, "dispatchEvent"),
    bytes = localStorage.getItem(key);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
    if (name === key) throw new Error("synthetic-quota");
    original.call(this, name, value);
  });
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    pending = h.heart.buy();
  });
  expect(await pending).toMatchObject({ status: "unresolved" });
  expect(h.view.getByText("storage-boundary")).toBeTruthy();
  expect(localStorage.getItem(key)).toBe(bytes);
  expect(purchaseEvents(events)).toHaveLength(0);
});
it("provider conditional receipt rejects a later no-state-change admission", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.titlesEarned = ["owned"];
  localStorage.setItem(key, JSON.stringify(raw));
  const h = mount(),
    operation = h.api.captureHeartPurchase(),
    bytes = localStorage.getItem(key);
  let pending!: Promise<boolean>;
  await act(async () => {
    startTransition(() => {
      pending = operation.apply({ hearts: 3, dinars: 80 });
    });
    h.api.grantTitle("owned");
  });
  expect(await pending).toBe(false);
  expect(h.api.profile.dinars).toBe(100);
  expect(localStorage.getItem(key)).toBe(bytes);
});
it.each(["hearts_full", "insufficient_dinars"] as const)(
  "preserves valid %s dinar-only reconciliation",
  async (status) => {
    const h = mount();
    env.rpc.mockResolvedValue({
      data: { status, hearts: status === "hearts_full" ? 5 : 2, dinars: 10 },
      error: null,
    });
    let pending!: ReturnType<typeof h.heart.buy>;
    await act(async () => {
      pending = h.heart.buy();
    });
    expect(await pending).toMatchObject({ status, dinars: 10 });
    expect(h.api.profile).toMatchObject({ dinars: 10, hearts: 2 });
  },
);
it("preserves guest local price and never calls authenticated RPC", async () => {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.loggedIn = false;
  localStorage.setItem(key, JSON.stringify(raw));
  setActiveOwnerInternal("guest:synthetic");
  const h = mount();
  let pending!: ReturnType<typeof h.heart.buy>;
  await act(async () => {
    pending = h.heart.buy();
  });
  await pending;
  expect(h.api.profile).toMatchObject({ dinars: 80, hearts: 3 });
  expect(env.rpc).not.toHaveBeenCalled();
});

it("does not return success if a purchase event listener switches identity", async () => {
  const h = mount();
  const listener = () => setActiveOwnerInternal("user:bob");
  window.addEventListener("irth:heart-purchased", listener);
  try {
    let pending!: ReturnType<typeof h.heart.buy>;
    await act(async () => {
      pending = h.heart.buy();
    });
    expect(await pending).toMatchObject({ status: "unresolved" });
  } finally {
    window.removeEventListener("irth:heart-purchased", listener);
  }
});
