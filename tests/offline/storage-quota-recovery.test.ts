/**
 * V16 — web content-update persistence fix.
 *
 * Regression coverage for the proven production-web hang:
 *   Cache API image warming saturated the origin quota → the ~18 MB snapshot
 *   IndexedDB transaction aborted with QuotaExceededError → `idbPut()` never
 *   settled → `applyContentUpdate()` stayed `applying: true` forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __idbInternals, isQuotaExceeded } from "@/lib/offline-storage";
import {
  usageCeiling,
  createWarmingBudget,
  WEB_TOTAL_USAGE_BUDGET_BYTES,
  WEB_MIN_HEADROOM_BYTES,
} from "@/lib/offline/storage-budget";

// ---------------------------------------------------------------- IDB abort

/** Minimal fake IDB transaction that can complete, error or abort. */
function fakeDB(outcome: "complete" | "error" | "abort", error: any = null) {
  const store = { put: vi.fn(), get: vi.fn(() => ({ onsuccess: null })), delete: vi.fn() };
  const tx: any = {
    error,
    objectStore: () => store,
    oncomplete: null,
    onerror: null,
    onabort: null,
    abort: vi.fn(),
  };
  const db: any = { transaction: () => tx, close: vi.fn() };
  queueMicrotask(() => {
    if (outcome === "complete") tx.oncomplete?.();
    if (outcome === "error") tx.onerror?.();
    if (outcome === "abort") tx.onabort?.();
  });
  return { db, tx, store };
}

describe("IndexedDB transaction safety", () => {
  it("resolves on complete", async () => {
    const { db } = fakeDB("complete");
    await expect(__idbInternals.runTx<void>(db, "readwrite", (s) => s.put({}, "k"))).resolves.toBeUndefined();
  });

  it("rejects on error with tx.error", async () => {
    const err = new Error("boom");
    const { db } = fakeDB("error", err);
    await expect(__idbInternals.runTx<void>(db, "readwrite", () => {})).rejects.toBe(err);
  });

  it("REJECTS on abort instead of hanging forever (the production bug)", async () => {
    const quota = Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    const { db } = fakeDB("abort", quota);
    await expect(__idbInternals.runTx<void>(db, "readwrite", () => {})).rejects.toBe(quota);
  });

  it("rejects with a meaningful fallback when tx.error is null", async () => {
    const { db } = fakeDB("abort", null);
    await expect(__idbInternals.runTx<void>(db, "readwrite", () => {})).rejects.toThrow(/aborted/i);
  });

  it("settles exactly once even when several events fire", async () => {
    const { db, tx } = fakeDB("complete");
    const p = __idbInternals.runTx<void>(db, "readwrite", () => {});
    await p;
    // Late abort after completion must not throw an unhandled rejection.
    expect(() => tx.onabort?.()).not.toThrow();
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects when the work callback throws synchronously", async () => {
    const { db } = fakeDB("complete");
    await expect(
      __idbInternals.runTx<void>(db, "readwrite", () => { throw new Error("nope"); }),
    ).rejects.toThrow("nope");
  });
});

describe("quota error classification", () => {
  it("recognises every engine spelling", () => {
    expect(isQuotaExceeded(Object.assign(new Error("x"), { name: "QuotaExceededError" }))).toBe(true);
    expect(isQuotaExceeded(Object.assign(new Error("x"), { name: "NS_ERROR_DOM_QUOTA_REACHED" }))).toBe(true);
    expect(isQuotaExceeded({ code: 22 })).toBe(true);
    expect(isQuotaExceeded(new Error("The quota has been exceeded."))).toBe(true);
    expect(isQuotaExceeded(new Error("network request failed"))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});

// ------------------------------------------------------------ warming budget

describe("web image warming budget", () => {
  const origNavigator = globalThis.navigator;

  function mockEstimate(usage: number | null, quota = 2_103_000_000) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: usage === null ? {} : { storage: { estimate: async () => ({ usage, quota }) } },
    });
  }

  beforeEach(() => { (globalThis as any).Capacitor = undefined; });
  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: origNavigator });
  });

  it("always reserves headroom below the reported quota", () => {
    const quota = 2_103_000_000;
    const ceiling = usageCeiling(quota);
    expect(ceiling).toBeLessThanOrEqual(WEB_TOTAL_USAGE_BUDGET_BYTES);
    expect(quota - ceiling).toBeGreaterThanOrEqual(WEB_MIN_HEADROOM_BYTES);
  });

  it("never returns a negative ceiling on a tiny quota", () => {
    expect(usageCeiling(10_000)).toBe(0);
  });

  it("refuses to warm at the production saturation point (~2.096 GB used)", async () => {
    mockEstimate(2_096_000_000);
    const budget = await createWarmingBudget();
    expect(budget.exhausted()).toBe(true);
  });

  it("allows warming on a fresh origin and stops at the budget", async () => {
    mockEstimate(5_000_000);
    const budget = await createWarmingBudget();
    expect(budget.exhausted()).toBe(false);
    let stopped = false;
    for (let i = 0; i < 20000 && !stopped; i++) stopped = await budget.note(1_000_000);
    expect(stopped).toBe(true);
  });

  it("degrades to a conservative allowance when estimate() is unavailable", async () => {
    mockEstimate(null);
    const budget = await createWarmingBudget();
    expect(budget.exhausted()).toBe(false);
    let stopped = false;
    for (let i = 0; i < 5000 && !stopped; i++) stopped = await budget.note(1_000_000);
    expect(stopped).toBe(true);
  });

  it("uses a fixed 400 MB ceiling on native Android (ignores web quota)", async () => {
    mockEstimate(2_096_000_000);
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    const budget = await createWarmingBudget();
    // Native ignores the saturated web quota estimate entirely.
    expect(budget.exhausted()).toBe(false);
    expect(await budget.note(100 * 1024 * 1024)).toBe(false);
    // ...but stops once its own 400 MB disposable allowance is spent.
    expect(await budget.note(400 * 1024 * 1024)).toBe(true);
    (globalThis as any).Capacitor = undefined;
  });
});
