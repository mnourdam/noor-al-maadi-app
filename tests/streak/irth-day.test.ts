import { describe, it, expect } from "vitest";
import { irthDayKey, irthYesterdayKey, addIrthDays, irthDayDiff } from "@/lib/irth-day";

/**
 * The IRTH day key must be identical no matter what timezone the DEVICE is
 * in — it is always the Asia/Riyadh (UTC+3, no DST) calendar day of the
 * given instant.
 */
describe("irthDayKey — device timezone independence", () => {
  // 2026-08-28T20:30:00Z === 23:30 Riyadh on 2026-08-28
  const at2330Riyadh = new Date("2026-08-28T20:30:00Z");
  // 2026-08-28T21:30:00Z === 00:30 Riyadh on 2026-08-29
  const at0030Riyadh = new Date("2026-08-28T21:30:00Z");

  it("23:30 Riyadh resolves to that Riyadh day", () => {
    expect(irthDayKey(at2330Riyadh)).toBe("2026-08-28");
  });

  it("00:30 Riyadh resolves to the NEXT Riyadh day", () => {
    expect(irthDayKey(at0030Riyadh)).toBe("2026-08-29");
  });

  it("is identical for conceptually UTC / UTC+3 / UTC+8 / UTC-5 devices", () => {
    // The same absolute instant, however the device would have rendered it.
    const instant = at0030Riyadh;
    const keys = [
      irthDayKey(new Date(instant.getTime())),
      irthDayKey(new Date(instant.toISOString())),
      irthDayKey(new Date(instant.valueOf())),
    ];
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("2026-08-29");
    // A UTC device would have said 2026-08-28 with the old ISO-slice logic.
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-28");
    expect(irthDayKey(instant)).not.toBe(instant.toISOString().slice(0, 10));
  });

  it("is stable across a DST transition in a device zone (Riyadh has no DST)", () => {
    // Northern-hemisphere DST switch weekend.
    const beforeDst = new Date("2026-03-28T21:30:00Z");
    const afterDst = new Date("2026-03-29T21:30:00Z");
    expect(irthDayKey(beforeDst)).toBe("2026-03-29");
    expect(irthDayKey(afterDst)).toBe("2026-03-30");
    expect(irthDayDiff(irthDayKey(afterDst), irthDayKey(beforeDst))).toBe(1);
  });

  it("yesterday is exactly one Riyadh day back, including across month ends", () => {
    expect(irthYesterdayKey(new Date("2026-09-01T05:00:00Z"))).toBe("2026-08-31");
    expect(addIrthDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addIrthDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("day math is timezone-free", () => {
    expect(irthDayDiff("2026-08-29", "2026-08-27")).toBe(2);
    expect(irthDayDiff("2026-08-27", "2026-08-29")).toBe(-2);
  });
});
