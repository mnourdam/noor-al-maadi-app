import { describe, it, expect } from "vitest";
import { reshuffleDistinct } from "@/components/games/ChronologyRenderer";

describe("reshuffleDistinct", () => {
  it("returns an order different from the previous incorrect one", () => {
    const correct = [0, 1, 2, 3];
    const prev = [3, 2, 1, 0];
    for (let i = 0; i < 20; i++) {
      const next = reshuffleDistinct(prev, correct);
      expect(next).toHaveLength(prev.length);
      expect(next.slice().sort()).toEqual(prev.slice().sort());
      const sameAsPrev = next.every((v, i) => v === prev[i]);
      expect(sameAsPrev).toBe(false);
    }
  });

  it("does not reveal the correct order", () => {
    const correct = [0, 1, 2, 3, 4];
    const prev = [4, 3, 2, 1, 0];
    for (let i = 0; i < 20; i++) {
      const next = reshuffleDistinct(prev, correct);
      const sameAsCorrect = next.every((v, i) => v === correct[i]);
      expect(sameAsCorrect).toBe(false);
    }
  });

  it("handles trivial single-item arrays deterministically", () => {
    expect(reshuffleDistinct([0], [0])).toEqual([0]);
  });
});
