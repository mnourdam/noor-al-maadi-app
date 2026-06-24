// ============================================================
// Campaign chronological ordering.
// ------------------------------------------------------------
// Player-facing campaign order is DETERMINISTIC and never depends
// on created_at / updated_at / imported_at / insertion order.
//
// Priority chain (lower = earlier in history):
//   1. chronological_order   — explicit admin-curated position
//   2. sort_year             — canonical starting year (Hijri scale)
//   3. historicalPeriod      — parsed from Arabic text as fallback
//
// Campaigns missing all three sink to the end with a stable
// alphabetical tiebreaker, never random.
// ============================================================

import type { Campaign } from "@/types/campaign";

const AR_INDIC: Record<string, string> = {
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
};
function westernize(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => AR_INDIC[d] ?? d);
}

/** Final fallback: parse earliest year from `historicalPeriod` (Hijri-normalized). */
export function parseHistoricalPeriodYear(period: string | undefined | null): number | null {
  if (!period) return null;
  const text = westernize(period);
  const nums = text.match(/\d{1,4}/g)?.map(Number).filter((n) => Number.isFinite(n) && n > 0) ?? [];
  if (!nums.length) return null;
  const minYear = Math.min(...nums);
  const hasGregorian = /م(?![ا-ي])/.test(text) || /ميلاد/.test(text);
  const hasHijri = /ه|هـ|هجري/.test(text);
  if (hasGregorian && !hasHijri) return Math.max(0, minYear - 622);
  return minYear;
}

/** Resolved sort key. Lower = earlier. POSITIVE_INFINITY for unknown. */
export function campaignSortKey(c: Campaign): number {
  if (typeof c.chronological_order === "number" && Number.isFinite(c.chronological_order)) {
    return c.chronological_order;
  }
  if (typeof c.sort_year === "number" && Number.isFinite(c.sort_year)) {
    // Offset sort_year by a large constant so explicit chronological_order
    // values (typically small integers) always precede year-based positions.
    return 1_000_000 + c.sort_year;
  }
  const parsed = parseHistoricalPeriodYear(c.historicalPeriod);
  if (parsed != null) return 2_000_000 + parsed;
  return Number.POSITIVE_INFINITY;
}

/** Back-compat shim — used in older modules. */
export function campaignSortYear(c: Campaign): number {
  return campaignSortKey(c);
}

/** Sort campaigns from oldest historical period → newest. */
export function sortCampaignsChronological<T extends Campaign>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ya = campaignSortKey(a);
    const yb = campaignSortKey(b);
    if (ya !== yb) return ya - yb;
    return (a.title ?? "").localeCompare(b.title ?? "", "ar");
  });
}
