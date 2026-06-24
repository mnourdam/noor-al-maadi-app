// ============================================================
// Campaign chronological ordering.
// ------------------------------------------------------------
// Players should always be guided from the oldest historical
// campaigns to the most recent ones. We never order by
// created_at / updated_at / title.
//
// We try to extract the earliest year mentioned in
// `historicalPeriod` (Hijri or Gregorian). If a campaign has no
// parseable year we treat it as +Infinity so it sinks to the end
// instead of randomly leading the list.
// ============================================================

import type { Campaign } from "@/types/campaign";

const AR_INDIC: Record<string, string> = {
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
};
function westernize(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => AR_INDIC[d] ?? d);
}

/** Earliest year (Hijri preferred, else Gregorian) extracted from the campaign. */
export function campaignSortYear(c: Campaign): number {
  const period = westernize(c.historicalPeriod ?? "");
  // Detect Gregorian markers (م) — convert to approximate Hijri only if needed.
  // We sort numerically so we just need a comparable axis. Hijri years are
  // ~622 years behind Gregorian; we add an offset when only Gregorian is present
  // so the two scales don't interleave incorrectly.
  const nums = period.match(/\d{1,4}/g)?.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0) ?? [];
  if (!nums.length) return Number.POSITIVE_INFINITY;
  const minYear = Math.min(...nums);
  // Heuristic: if the string contains "م" but not "هـ"/"هجري", treat as Gregorian.
  const hasGregorian = /م(?![ا-ي])/.test(period) || /ميلاد/.test(period);
  const hasHijri = /ه|هـ|هجري/.test(period);
  if (hasGregorian && !hasHijri) return Math.max(0, minYear - 622);
  return minYear;
}

/** Sort campaigns from oldest historical period → newest. */
export function sortCampaignsChronological<T extends Campaign>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const ya = campaignSortYear(a);
    const yb = campaignSortYear(b);
    if (ya !== yb) return ya - yb;
    return (a.title ?? "").localeCompare(b.title ?? "", "ar");
  });
}
