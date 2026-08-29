import { describe, it, expect, beforeEach, vi } from "vitest";

// Identity-partitioned storage: pin a stable owner for the whole suite.
vi.mock("@/lib/identity/owner", () => ({ getActiveOwner: () => "tester" }));

class MemoryStorage {
  map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const storage = new MemoryStorage();
(globalThis as any).window = { localStorage: storage };
if (!(globalThis as any).crypto?.randomUUID) {
  (globalThis as any).crypto = { randomUUID: () => `tx-${Math.random().toString(16).slice(2)}` };
}

const {
  purchaseOrderingHelp,
  recoverPendingOrderingHelp,
  getOrderingState,
  clearOrderingHelp,
} = await import("@/lib/campaigns/ordering-help");
const { correctIndexOfOrderingId } = await import("@/lib/campaigns/ordering-seating");
const { activityKey } = await import("@/lib/campaignLedger");

const STORE_KEY = "tester:irth.campaign.ordering.help.v3";
const KEY = "activity:c1:ch1:a1";
const FP = "a1|A|B|C|D";
const ORDER = ["evt-2", "evt-0", "evt-3", "evt-1"];

/** Minimal React-safe wallet mirroring `trySpendDinars`: decide, then debit. */
function makeWallet(start: number) {
  let balance = start;
  let charges = 0;
  return {
    get balance() { return balance; },
    get charges() { return charges; },
    trySpend(n: number) {
      if (balance < n) return false; // synchronous decision — no deduction
      balance -= n;
      charges++;
      return true;
    },
    /** Legacy-style deferred updater: reports false but debits later. */
    deferredSpend(n: number) {
      queueMicrotask(() => { if (balance >= n) { balance -= n; charges++; } });
      return false;
    },
  };
}

const buy = (order: string[], pay: (txId: string) => boolean) =>
  purchaseOrderingHelp(KEY, FP, order, correctIndexOfOrderingId, { pay });

beforeEach(() => storage.clear());

describe("ordering hint economy", () => {
  it("20 dinars → one hint, balance 0, exactly one charge", () => {
    const w = makeWallet(20);
    const r = buy(ORDER, () => w.trySpend(20));
    expect(r).not.toBeNull();
    expect(w.balance).toBe(0);
    expect(w.charges).toBe(1);
    expect(getOrderingState(KEY, FP)?.pinnedIds).toEqual([r!.itemId]);
    expect(getOrderingState(KEY, FP)?.pending).toBeUndefined();
  });

  it("19 dinars → no hint, balance unchanged, zero charges", () => {
    const w = makeWallet(19);
    const r = buy(ORDER, () => w.trySpend(20));
    expect(r).toBeNull();
    expect(w.balance).toBe(19);
    expect(w.charges).toBe(0);
    expect(getOrderingState(KEY, FP)?.pinnedIds ?? []).toEqual([]);
    expect(getOrderingState(KEY, FP)?.pending).toBeUndefined();
  });

  it("failed payment commits no pin and leaves no pending intent", () => {
    const r = buy(ORDER, () => false);
    expect(r).toBeNull();
    expect(getOrderingState(KEY, FP)?.pinnedIds ?? []).toEqual([]);
    expect(getOrderingState(KEY, FP)?.pending).toBeUndefined();
  });

  it("the synchronous wallet cannot produce a paid no-op (legacy deferred pattern can)", () => {
    const legacy = makeWallet(100);
    expect(buy(ORDER, () => legacy.deferredSpend(20))).toBeNull(); // reported failure...
    // ...and the legacy pattern still debits afterwards → paid no-op.
    return Promise.resolve().then(() => {
      expect(legacy.balance).toBe(80);

      storage.clear();
      const safe = makeWallet(100);
      const r = buy(ORDER, () => safe.trySpend(20));
      expect(r).not.toBeNull();
      expect(safe.balance).toBe(80);
      expect(safe.charges).toBe(1);
    });
  });

  it("rapid repeated purchases never exceed the charged amount", () => {
    const w = makeWallet(40); // affords exactly two hints
    let pins = 0;
    for (let i = 0; i < 6; i++) {
      const state = getOrderingState(KEY, FP);
      const order = state?.pinnedIds.length ? ORDER : ORDER;
      const r = buy(order, () => w.trySpend(20));
      if (r) pins++;
    }
    expect(w.charges).toBe(pins);
    expect(pins).toBeLessThanOrEqual(2);
    expect(w.balance).toBe(40 - pins * 20);
    expect(getOrderingState(KEY, FP)?.pinnedIds.length ?? 0).toBe(pins);
  });

  it("never pins the last item (leaves one for the player)", () => {
    const w = makeWallet(1000);
    let guard = 0;
    while (buy(ORDER, () => w.trySpend(20)) && guard++ < 10) { /* buy until refused */ }
    expect(getOrderingState(KEY, FP)!.pinnedIds.length).toBeLessThanOrEqual(ORDER.length - 1);
  });
});

describe("pending payment recovery", () => {
  function seedPending(paid: boolean) {
    const state: any = {
      pinnedIds: [],
      fingerprint: FP,
      pending: { itemId: "evt-2", txId: "tx-1", at: new Date().toISOString() },
    };
    if (paid) state.pending.paidAt = new Date().toISOString();
    storage.setItem(STORE_KEY, JSON.stringify({ [KEY]: state }));
  }

  it("paid pending → recovers exactly one pin", () => {
    seedPending(true);
    const seen: string[] = [];
    recoverPendingOrderingHelp(KEY, FP, (id) => seen.push(id));
    expect(seen).toEqual(["evt-2"]);
    expect(getOrderingState(KEY, FP)!.pinnedIds).toEqual(["evt-2"]);
    // Second pass must not duplicate.
    recoverPendingOrderingHelp(KEY, FP, (id) => seen.push(id));
    expect(seen).toEqual(["evt-2"]);
    expect(getOrderingState(KEY, FP)!.pinnedIds).toEqual(["evt-2"]);
  });

  it("unpaid pending (and legacy entries without paidAt) → no free pin", () => {
    seedPending(false);
    const seen: string[] = [];
    recoverPendingOrderingHelp(KEY, FP, (id) => seen.push(id));
    expect(seen).toEqual([]);
    expect(getOrderingState(KEY, FP)!.pinnedIds).toEqual([]);
    expect(getOrderingState(KEY, FP)!.pending).toBeUndefined();
  });

  it("already-committed pin → no duplicate recovery", () => {
    storage.setItem(STORE_KEY, JSON.stringify({
      [KEY]: {
        pinnedIds: ["evt-2"],
        fingerprint: FP,
        pending: { itemId: "evt-2", txId: "tx-1", at: "x", paidAt: "y" },
      },
    }));
    const seen: string[] = [];
    recoverPendingOrderingHelp(KEY, FP, (id) => seen.push(id));
    expect(seen).toEqual([]);
    expect(getOrderingState(KEY, FP)!.pinnedIds).toEqual(["evt-2"]);
  });
});

describe("ordering help storage key", () => {
  it("renderer key equals the route cleanup key", () => {
    const campaignId = "c1", chapterId = "ch1", activityId = "a1";
    const rendererKey = activityKey(campaignId, chapterId, activityId);
    expect(rendererKey).toBe(KEY);
    expect(rendererKey).toBe(activityKey(campaignId, chapterId, activityId));
  });

  it("completion clears the correctly-keyed entry", () => {
    const w = makeWallet(20);
    buy(ORDER, () => w.trySpend(20));
    expect(getOrderingState(KEY, FP)).not.toBeNull();
    clearOrderingHelp(activityKey("c1", "ch1", "a1"));
    expect(getOrderingState(KEY, FP)).toBeNull();
  });

  it("stale legacy \"default\" entries are never loaded by the correct key", () => {
    const legacyKey = activityKey("c1", "default", "a1");
    storage.setItem(STORE_KEY, JSON.stringify({
      [legacyKey]: { pinnedIds: ["evt-0", "evt-1"], fingerprint: FP },
    }));
    expect(getOrderingState(KEY, FP)).toBeNull();
    expect(getOrderingState(legacyKey, FP)?.pinnedIds).toEqual(["evt-0", "evt-1"]);
  });
});
