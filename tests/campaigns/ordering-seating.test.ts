import { describe, it, expect } from "vitest";
import {
  seatPinnedItems,
  arePinsSeated,
  correctIndexOfOrderingId,
} from "@/lib/campaigns/ordering-seating";

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) >>> 0);
}

const idsFor = (n: number) => Array.from({ length: n }, (_, i) => `evt-${i}`);
const shuffle = (arr: string[], rand: () => number) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand() % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};
const isPermutation = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

const SIZES = [3, 4, 5, 6, 7, 8];

describe("canonical pin seating", () => {
  it("places every pin at its correct index (property, 600 random boards)", () => {
    const rand = rng(1234);
    let boards = 0;
    for (const n of SIZES) {
      for (let t = 0; t < 100; t++) {
        const ids = idsFor(n);
        const order = shuffle(ids, rand);
        const pinCount = rand() % n;
        const pins = shuffle(ids, rand).slice(0, pinCount);
        const seated = seatPinnedItems(order, pins);
        boards++;
        expect(arePinsSeated(seated, pins)).toBe(true);
        expect(isPermutation(seated, order)).toBe(true);
        expect(new Set(seated).size).toBe(n);
      }
    }
    expect(boards).toBe(600);
  });

  it("is idempotent", () => {
    const rand = rng(99);
    for (const n of SIZES) {
      for (let t = 0; t < 50; t++) {
        const ids = idsFor(n);
        const order = shuffle(ids, rand);
        const pins = shuffle(ids, rand).slice(0, rand() % n);
        const once = seatPinnedItems(order, pins);
        expect(seatPinnedItems(once, pins)).toEqual(once);
      }
    }
  });

  it("is independent of the pin-set insertion order", () => {
    const rand = rng(7);
    for (const n of SIZES) {
      for (let t = 0; t < 50; t++) {
        const ids = idsFor(n);
        const order = shuffle(ids, rand);
        const pins = shuffle(ids, rand).slice(0, rand() % n);
        expect(seatPinnedItems(order, [...pins].reverse())).toEqual(
          seatPinnedItems(order, pins),
        );
      }
    }
  });

  it("preserves the relative order of free items", () => {
    const order = ["evt-2", "evt-0", "evt-3", "evt-1"];
    const seated = seatPinnedItems(order, ["evt-1"]);
    expect(seated.indexOf("evt-1")).toBe(1);
    const free = seated.filter((id) => id !== "evt-1");
    expect(free).toEqual(["evt-2", "evt-0", "evt-3"]);
  });

  it("reproduces the legacy displacement bug case correctly", () => {
    // n=3, shuffle [evt-1, evt-2, evt-0]; pins evt-1 then evt-2.
    // Legacy remove/splice produced [evt-1, evt-0, evt-2] (evt-1 displaced).
    const seated = seatPinnedItems(["evt-1", "evt-2", "evt-0"], ["evt-1", "evt-2"]);
    expect(seated).toEqual(["evt-0", "evt-1", "evt-2"]);
  });

  it("tolerates malformed / out-of-range pin ids without losing items", () => {
    const order = ["evt-0", "evt-1", "evt-9"];
    const seated = seatPinnedItems(order, ["evt-9", "evt-0"]);
    expect(isPermutation(seated, order)).toBe(true);
    expect(seated.indexOf("evt-0")).toBe(0);
  });
});

describe("hint sequences", () => {
  /** Mirrors the renderer: purchase eligibility + full re-seat after each hint. */
  function runHints(n: number, order0: string[], rand: () => number, opts: {
    manualMoveBetween?: boolean;
    reloadBetween?: boolean;
    maxHints?: number;
  } = {}) {
    const ids = idsFor(n);
    let order = [...order0];
    let pins: string[] = [];
    const max = opts.maxHints ?? n - 1;
    while (pins.length < max) {
      const eligible = order.filter(
        (id) => !pins.includes(id) && correctIndexOfOrderingId(id) !== order.indexOf(id),
      );
      if (eligible.length === 0 || pins.length >= n - 1) break;
      const pick = eligible[rand() % eligible.length]!;
      pins = [...pins, pick];
      order = seatPinnedItems(order, pins);

      expect(arePinsSeated(order, pins)).toBe(true);
      expect(isPermutation(order, ids)).toBe(true);

      if (opts.manualMoveBetween) {
        const freeIdx = order.findIndex((id) => !pins.includes(id));
        const otherIdx = order.findIndex((id, i) => i !== freeIdx && !pins.includes(id));
        if (freeIdx >= 0 && otherIdx >= 0) {
          const moved = [...order];
          const [x] = moved.splice(freeIdx, 1);
          moved.splice(otherIdx, 0, x!);
          order = seatPinnedItems(moved, pins);
          expect(arePinsSeated(order, pins)).toBe(true);
        }
      }

      if (opts.reloadBetween) {
        // Cold start: fresh shuffle + persisted pins → canonical seating.
        order = seatPinnedItems(shuffle(ids, rand), pins);
        expect(arePinsSeated(order, pins)).toBe(true);
      }
    }
    return { order, pins };
  }

  for (const n of SIZES) {
    it(`n=${n}: 0/1/2/N-1 hints, with manual moves and reloads, keep every pin seated`, () => {
      const rand = rng(n * 31 + 5);
      const ids = idsFor(n);
      for (const maxHints of [0, 1, 2, n - 1]) {
        for (const variant of [{}, { manualMoveBetween: true }, { reloadBetween: true }]) {
          for (let t = 0; t < 25; t++) {
            const start = shuffle(ids, rand);
            const { order, pins } = runHints(n, start, rand, { ...variant, maxHints });
            expect(arePinsSeated(order, pins)).toBe(true);
            expect(isPermutation(order, ids)).toBe(true);
            expect(new Set(order).size).toBe(n);
          }
        }
      }
    });

    it(`n=${n}: with N-1 pins the board equals the correct order and Check passes`, () => {
      const rand = rng(n * 977 + 13);
      for (let t = 0; t < 100; t++) {
        const ids = idsFor(n);
        const { order, pins } = runHints(n, shuffle(ids, rand), rand);
        if (pins.length !== n - 1) {
          // Hints stopped early only because the board was already correct.
          expect(order).toEqual(ids);
          continue;
        }
        expect(order).toEqual(ids);
        // Check-equivalent comparison (positional label equality).
        const labels = order.map((id) => `L${correctIndexOfOrderingId(id)}`);
        const correct = ids.map((id) => `L${correctIndexOfOrderingId(id)}`);
        expect(labels.every((v, i) => v === correct[i])).toBe(true);
      }
    });
  }
});
