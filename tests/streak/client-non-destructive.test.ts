import { describe, it, expect } from "vitest";
import { deriveStreak } from "@/lib/profile";
import { irthDayKey, irthYesterdayKey, addIrthDays } from "@/lib/irth-day";

/**
 * V16 invariant: `deriveStreak` is a DISPLAY derivation. It reports status
 * but the client must never persist its zero over a server streak.
 */
describe("deriveStreak — display only", () => {
  const now = new Date("2026-08-28T20:30:00Z"); // 23:30 Riyadh 2026-08-28

  it("counts a Riyadh-today activity as safe", () => {
    const d = deriveStreak(7, irthDayKey(now), now);
    expect(d.status).toBe("safe");
    expect(d.streak).toBe(7);
  });

  it("server streak 7 with Riyadh-yesterday last day stays 7 (at-risk, not zero)", () => {
    const d = deriveStreak(7, irthYesterdayKey(now), now);
    expect(d.status).toBe("at-risk");
    expect(d.streak).toBe(7);
  });

  it("reports expired without implying the stored value should be erased", () => {
    const d = deriveStreak(7, addIrthDays(irthDayKey(now), -4), now);
    expect(d.status).toBe("expired");
    // The DISPLAY value is 0 …
    expect(d.streak).toBe(0);
    // … but nothing in the derivation mutates or returns a persistence
    // instruction; the caller keeps the stored value.
  });

  it("a UTC-slice day (the old bug) no longer marks a live streak expired", () => {
    const utcSliceDay = now.toISOString().slice(0, 10); // 2026-08-28
    const riyadhDay = irthDayKey(now); // 2026-08-28 here, but the key point:
    expect(deriveStreak(5, riyadhDay, now).status).toBe("safe");
    // At 00:30 Riyadh the two disagree — the Riyadh key wins.
    const past = new Date("2026-08-28T21:30:00Z");
    expect(irthDayKey(past)).toBe("2026-08-29");
    expect(past.toISOString().slice(0, 10)).toBe("2026-08-28");
    expect(deriveStreak(5, irthDayKey(past), past).status).toBe("safe");
    expect(utcSliceDay).toBe("2026-08-28");
  });

  it("a wrong device clock cannot change the Riyadh mapping of a real instant", () => {
    const instant = new Date("2026-08-28T21:30:00Z");
    expect(irthDayKey(instant)).toBe("2026-08-29");
  });
});
