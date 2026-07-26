/**
 * Safe string normalization for untrusted data.
 *
 * Anything that comes from localStorage / sessionStorage, an offline snapshot,
 * a URL search param, or a network row is UNTRUSTED: a field typed `string` in
 * TypeScript can still be `undefined`/`null`/a number at runtime. Calling
 * `.toLowerCase()` on such a value throws
 * `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`,
 * which on Android surfaced as a persistent crash loop (the bad row survived
 * force-close because it lived in localStorage).
 *
 * Rule: never call `.toLowerCase()` / `.trim()` directly on a value that came
 * from storage or the network. Route it through these helpers.
 */

/** Any value → trimmed string. Never throws. */
export function safeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Any value → trimmed lowercase string. Never throws. Empty when unusable. */
export function safeKey(value: unknown): string {
  const t = safeText(value);
  return t ? t.toLowerCase() : "";
}

/** Trimmed string, or `undefined` when empty — for search params / optional fields. */
export function optionalText(value: unknown): string | undefined {
  const t = safeText(value);
  return t.length > 0 ? t : undefined;
}

/** Locale-aware compare that tolerates missing values. */
export function safeCompare(a: unknown, b: unknown, locale?: string): number {
  return safeText(a).localeCompare(safeText(b), locale);
}
