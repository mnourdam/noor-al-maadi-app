import { describe, it, expect } from "bun:test";
import {
  ROTATION_MODES,
  selectDailyRotation,
  epochDayFromDateKey,
  modeForSlot,
  type RotatableGame,
} from "@/lib/games/dailyRotation";

// Synthetic catalogue mirroring production shape: several games per mode,
// each tagged with an era so historical diversity can be asserted too.
const ERAS = ["العصر النبوي", "الخلافة الراشدة", "الدولة الأموية", "الدولة العباسية", "الدولة الأيوبية"];

function catalogue(perMode = 12): RotatableGame[] {
  const out: RotatableGame[] = [];
  ROTATION_MODES.forEach((mode, mi) => {
    for (let i = 0; i < perMode; i++) {
      out.push({
        id: `${mode}-${i}`,
        slug: `${mode}-slug-${i}`,
        mode,
        era: ERAS[(mi + i) % ERAS.length],
      });
    }
  });
  return out;
}

const START = epochDayFromDateKey("2026-01-01");
const DAYS = 90;

function simulate(games: RotatableGame[], days = DAYS) {
  return Array.from({ length: days }, (_, i) =>
    selectDailyRotation(START + i, games),
  );
}

describe("daily challenge rotation — 90-day simulation", () => {
  const games = catalogue();
  const sim = simulate(games);

  it("always yields two picks", () => {
    for (const d of sim) expect(d.picks).toHaveLength(2);
  });

  it("never puts two challenges of the same mode in one day", () => {
    for (const d of sim) {
      expect(d.picks[0].game.mode).not.toBe(d.picks[1].game.mode);
    }
  });

  it("never repeats a mode back-to-back across the day boundary", () => {
    for (let i = 1; i < sim.length; i++) {
      const prevLast = sim[i - 1].picks[1].game.mode;
      const nextFirst = sim[i].picks[0].game.mode;
      expect(nextFirst).not.toBe(prevLast);
    }
  });

  it("never repeats the same game on consecutive days", () => {
    for (let i = 1; i < sim.length; i++) {
      const prev = new Set(sim[i - 1].picks.map((p) => p.game.id));
      for (const p of sim[i].picks) expect(prev.has(p.game.id)).toBe(false);
    }
  });

  it("does not repeat a game inside a full catalogue lap", () => {
    // Each mode has 12 games and appears once per bag cycle, so within any
    // window of 12 appearances a game must not repeat.
    const seen = new Map<string, number[]>();
    sim.forEach((d, day) =>
      d.picks.forEach((p) => {
        const arr = seen.get(p.game.id) ?? [];
        arr.push(day);
        seen.set(p.game.id, arr);
      }),
    );
    for (const days of seen.values()) {
      for (let i = 1; i < days.length; i++) {
        expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("keeps mode distribution balanced and leaves no mode neglected", () => {
    const counts = new Map<string, number>();
    const lastSeen = new Map<string, number>();
    const gaps = new Map<string, number>();
    sim.forEach((d, day) =>
      d.picks.forEach((p) => {
        counts.set(p.game.mode, (counts.get(p.game.mode) ?? 0) + 1);
        const prev = lastSeen.get(p.game.mode);
        if (prev != null) {
          gaps.set(p.game.mode, Math.max(gaps.get(p.game.mode) ?? 0, day - prev));
        }
        lastSeen.set(p.game.mode, day);
      }),
    );
    const total = DAYS * 2;
    const fair = total / ROTATION_MODES.length;
    for (const mode of ROTATION_MODES) {
      const c = counts.get(mode) ?? 0;
      // Shuffle bag ⇒ each mode appears exactly once per cycle.
      expect(Math.abs(c - fair)).toBeLessThanOrEqual(2);
      // Never absent for a long stretch.
      expect(gaps.get(mode) ?? 0).toBeLessThanOrEqual(5);
    }
  });

  it("prefers different historical eras within a day when possible", () => {
    const sameEra = sim.filter(
      (d) => d.picks[0].game.era && d.picks[0].game.era === d.picks[1].game.era,
    );
    expect(sameEra.length / sim.length).toBeLessThan(0.18);
  });

  it("is deterministic for the same date, regardless of call order or clock", () => {
    for (let i = 0; i < 30; i++) {
      const a = selectDailyRotation(START + i, games);
      const b = selectDailyRotation(START + i, games.slice().reverse());
      expect(b.picks.map((p) => p.game.id)).toEqual(a.picks.map((p) => p.game.id));
      expect(a.date).toBe(b.date);
    }
  });

  it("keeps the global slot stream free of adjacent duplicates", () => {
    for (let s = 1; s < 400; s++) {
      expect(modeForSlot(s)).not.toBe(modeForSlot(s - 1));
    }
  });
});

describe("daily challenge rotation — degraded catalogues", () => {
  it("substitutes when a planned mode has no eligible content", () => {
    const games = catalogue().filter((g) => g.mode !== "crossword");
    const sim = simulate(games, 60);
    for (const d of sim) {
      expect(d.picks).toHaveLength(2);
      expect(d.picks[0].game.mode).not.toBe(d.picks[1].game.mode);
    }
  });

  it("still avoids same-mode days when completions shrink the pool", () => {
    const games = catalogue(3);
    const completed = new Set(games.filter((_, i) => i % 3 === 0).map((g) => g.id));
    for (let i = 0; i < 60; i++) {
      const d = selectDailyRotation(START + i, games, { completedIds: completed });
      expect(d.picks).toHaveLength(2);
      expect(d.picks[0].game.mode).not.toBe(d.picks[1].game.mode);
    }
  });

  it("reports exhaustion when everything is completed", () => {
    const games = catalogue(2);
    const completed = new Set(games.map((g) => g.id));
    const d = selectDailyRotation(START, games, { completedIds: completed });
    expect(d.exhausted).toBe(true);
    expect(d.picks).toHaveLength(0);
  });
});
