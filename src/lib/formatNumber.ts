/**
 * Global number formatting helper.
 * The app standardizes on Western Arabic digits (0-9) everywhere:
 * XP, dinars, hearts, levels, progress, counters, percentages, years, etc.
 *
 * Never use Arabic-Indic digits (٠-٩) or `.toLocaleString("ar-EG")`.
 */

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Format a number using Western digits with thousands separator. */
export function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "number" ? n : Number(String(n).replace(ARABIC_INDIC_DIGITS, (d) => DIGIT_MAP[d] ?? d));
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("en-US");
}

/** Format a number compactly without thousands separator (good for short counters). */
export function fmtCount(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const s = String(n).replace(ARABIC_INDIC_DIGITS, (d) => DIGIT_MAP[d] ?? d);
  return s;
}

/** Convert any Arabic-Indic digits inside an arbitrary string to Western digits. */
export function toWesternDigits(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).replace(ARABIC_INDIC_DIGITS, (d) => DIGIT_MAP[d] ?? d);
}
