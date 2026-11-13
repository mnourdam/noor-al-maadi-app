/**
 * Achievement i18n resolver.
 *
 * The engine and registry entries hold only i18n keys. This module resolves
 * a key to a string against a locale bundle. Locale bundles are pure data
 * files under `./locale/*.ts`; adding a language does not touch the engine
 * or any definition.
 */

import { ar } from "./locale/ar";
import { en } from "./locale/en";

export type LocaleId = "ar" | "en";

const BUNDLES: Record<LocaleId, Record<string, string>> = { ar, en };

let currentLocale: LocaleId = "ar";

export function setAchievementLocale(locale: LocaleId): void {
  currentLocale = locale === "en" ? "en" : "ar";
}

export function getAchievementLocale(): LocaleId {
  return currentLocale;
}

/**
 * Resolve an i18n key to a display string.
 *
 * Returns `null` when the key is missing so callers can decide how to
 * render (e.g. hide the row, show a placeholder). Never throws.
 */
export function resolveI18n(key: string | undefined | null, locale: LocaleId = currentLocale): string | null {
  if (!key) return null;
  const bundle = BUNDLES[locale] ?? BUNDLES.ar;
  const value = bundle[key];
  const fallback = BUNDLES.ar[key];
  return typeof value === "string" && value.trim().length > 0 ? value
    : typeof fallback === "string" && fallback.trim().length > 0 ? fallback : null;
}

/** Dev-only: list of keys known to a locale — used by registry validation. */
export function knownI18nKeys(locale: LocaleId = currentLocale): ReadonlySet<string> {
  return new Set(Object.keys(BUNDLES[locale] ?? {}));
}
