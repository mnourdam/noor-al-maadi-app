/**
 * Canonical IRTH calendar day (V16).
 *
 * The streak system's day boundary is `Asia/Riyadh` on BOTH sides:
 *   - server: `(now() AT TIME ZONE 'Asia/Riyadh')::date`
 *   - client: `irthDayKey()` below
 *
 * This helper MUST NOT depend on the device timezone, device DST rules or
 * the device locale. It is the single client-side source of truth for any
 * streak day comparison. Do not re-implement day keys in streak paths.
 */
export const IRTH_TIMEZONE = "Asia/Riyadh";

const FALLBACK_OFFSET_MS = 3 * 60 * 60 * 1000; // Riyadh is a fixed UTC+3, no DST.

/** `YYYY-MM-DD` for the given instant in the canonical IRTH timezone. */
export function irthDayKey(date: Date = new Date()): string {
  try {
    // `en-CA` yields ISO-shaped `YYYY-MM-DD`.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: IRTH_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Extremely old runtimes without full ICU: Riyadh has no DST, so a fixed
    // +03:00 shift on the UTC instant is exact.
    return new Date(date.getTime() + FALLBACK_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  }
}

/** `YYYY-MM-DD` for the IRTH day before the given instant. */
export function irthYesterdayKey(date: Date = new Date()): string {
  return addIrthDays(irthDayKey(date), -1);
}

/** Shift a `YYYY-MM-DD` IRTH day key by whole days (timezone-free math). */
export function addIrthDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map((n) => Number(n));
  const base = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return new Date(base + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Whole-day distance `a - b` between two IRTH day keys. */
export function irthDayDiff(a: string, b: string): number {
  const p = (k: string) => {
    const [y, m, d] = k.split("-").map((n) => Number(n));
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((p(a) - p(b)) / 86_400_000);
}
