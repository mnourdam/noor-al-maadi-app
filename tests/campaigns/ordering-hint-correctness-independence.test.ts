import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const { purchaseOrderingHelp, getOrderingState } = await import("@/lib/campaigns/ordering-help");
const { correctIndexOfOrderingId, seatPinnedItems } = await import("@/lib/campaigns/ordering-seating");

const KEY = "activity:c1:ch1:a1";
const FP = "a1|A|B|C|D";
const CORRECT = ["evt-0", "evt-1", "evt-2", "evt-3"];
const WRONG = ["evt-2", "evt-0", "evt-3", "evt-1"];

function makeWallet(start: number) {
  let balance = start;
  let charges = 0;
  return {
    get balance() { return balance; },
    get charges() { return charges; },
    trySpend(n: number) {
      if (balance < n) return false;
      balance -= n;
      charges++;
      return true;
    },
  };
}

const buy = (order: string[], pay: (txId: string) => boolean) =>
  purchaseOrderingHelp(KEY, FP, order, correctIndexOfOrderingId, { pay });

/**
 * Mirrors the renderer's V17-01 gating rule exactly: no term may derive from
 * the live arrangement being correct.
 */
const HINT_COST = 20;
function hintDisabled(args: {
  resolved: boolean; hintBusy: boolean; pinnedIds: string[]; order: string[]; dinars: number;
}) {
  return args.resolved
    || args.hintBusy
    || args.pinnedIds.length >= args.order.length - 1
    || args.dinars < HINT_COST;
}

beforeEach(() => storage.clear());

describe("V17-01 — hint availability is independent of live correctness", () => {
  const base = { resolved: false, hintBusy: false, pinnedIds: [] as string[], dinars: 100 };

  it("incorrect arrangement → hint available", () => {
    expect(hintDisabled({ ...base, order: WRONG })).toBe(false);
  });

  it("correct arrangement before Verify → identical availability", () => {
    expect(hintDisabled({ ...base, order: CORRECT }))
      .toBe(hintDisabled({ ...base, order: WRONG }));
  });

  it("wrong → correct → wrong never changes the button state", () => {
    const seq = [WRONG, CORRECT, WRONG, CORRECT, ["evt-1", "evt-0", "evt-2", "evt-3"]];
    const states = seq.map((order) => hintDisabled({ ...base, order }));
    expect(new Set(states).size).toBe(1);
    expect(states[0]).toBe(false);
  });

  it("only correctness-neutral causes disable the button", () => {
    expect(hintDisabled({ ...base, order: CORRECT, dinars: 19 })).toBe(true);   // funds
    expect(hintDisabled({ ...base, order: WRONG, dinars: 19 })).toBe(true);
    expect(hintDisabled({ ...base, order: CORRECT, pinnedIds: ["evt-0", "evt-1", "evt-2"] })).toBe(true); // cap
    expect(hintDisabled({ ...base, order: CORRECT, resolved: true })).toBe(true);
    expect(hintDisabled({ ...base, order: CORRECT, hintBusy: true })).toBe(true);
  });
});

describe("V17-01 — purchases behave identically on a correct board", () => {
  it("purchase while incorrect pins one item and charges once", () => {
    const w = makeWallet(100);
    const r = buy(WRONG, () => w.trySpend(HINT_COST));
    expect(r).not.toBeNull();
    expect(w.charges).toBe(1);
    expect(getOrderingState(KEY, FP)!.pinnedIds).toEqual([r!.itemId]);
  });

  it("purchase while ALREADY correct pins a legitimate item and charges exactly once", () => {
    const w = makeWallet(100);
    const r = buy(CORRECT, () => w.trySpend(HINT_COST));
    expect(r).not.toBeNull();
    expect(CORRECT).toContain(r!.itemId);
    expect(w.charges).toBe(1);
    expect(w.balance).toBe(80);
    const state = getOrderingState(KEY, FP)!;
    expect(state.pinnedIds).toEqual([r!.itemId]);
    expect(state.pending).toBeUndefined();
    // Board stays valid after re-seating with the new pin.
    const seated = seatPinnedItems(CORRECT, state.pinnedIds, correctIndexOfOrderingId);
    expect([...seated].sort()).toEqual([...CORRECT].sort());
  });

  it("an already-purchased item is never sold again", () => {
    const w = makeWallet(1000);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const r = buy(CORRECT, () => w.trySpend(HINT_COST));
      if (!r) break;
      expect(seen.has(r.itemId)).toBe(false);
      seen.add(r.itemId);
    }
    expect(getOrderingState(KEY, FP)!.pinnedIds.length).toBe(seen.size);
  });

  it("cap (n-1) stays enforced on a correct board", () => {
    const w = makeWallet(1000);
    let guard = 0;
    while (buy(CORRECT, () => w.trySpend(HINT_COST)) && guard++ < 10) { /* buy until refused */ }
    const pins = getOrderingState(KEY, FP)!.pinnedIds.length;
    expect(pins).toBe(CORRECT.length - 1);
    expect(w.charges).toBe(pins);
  });

  it("insufficient dinars on a correct board → no pin, zero debit", () => {
    const w = makeWallet(19);
    expect(buy(CORRECT, () => w.trySpend(HINT_COST))).toBeNull();
    expect(w.charges).toBe(0);
    expect(w.balance).toBe(19);
    expect(getOrderingState(KEY, FP)?.pinnedIds ?? []).toEqual([]);
    expect(getOrderingState(KEY, FP)?.pending).toBeUndefined();
  });
});

describe("V17-01 — source guard", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/components/imported-campaign/ActivityRenderer.tsx"),
    "utf8",
  );
  const help = readFileSync(
    resolve(process.cwd(), "src/lib/campaigns/ordering-help.ts"),
    "utf8",
  );

  it("the renderer no longer derives hint state from live correctness", () => {
    expect(src).not.toContain("eligibleHintCount");
    const gate = src.slice(src.indexOf("const hintDisabled"), src.indexOf("const useHint"));
    expect(gate).not.toContain("correctIndexOf");
    expect(gate).not.toContain("indexOf(id)");
  });

  it("the correctness-revealing message is gone", () => {
    expect(src).not.toContain("لم يبقَ عناصر مفيدة للكشف عنها");
  });

  it("purchase eligibility no longer consults current slot correctness", () => {
    expect(help).not.toContain("isCurrentlyCorrect");
    const block = help.slice(help.indexOf("const eligibleIds"), help.indexOf("const totalItems"));
    expect(block).not.toContain("correctIndexOf");
  });
});
