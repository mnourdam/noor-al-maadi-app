/**
 * Achievement i18n resolver.
 *
 * The engine and registry entries hold only i18n keys. This module resolves
 * a key to a string against a locale bundle. Locale bundles are pure data
 * files under `./locale/*.ts`; adding a language does not touch the engine
 * or any definition.
 */

import { ar } from "./locale/ar";

export type LocaleId = "ar";

const BUNDLES: Record<LocaleId, Record<string, string>> = { ar };

let currentLocale: LocaleId = "ar";

export function setAchievementLocale(locale: LocaleId): void {
  currentLocale = locale;
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
export function resolveI18n(key: string | undefined | null): string | null {
  if (!key) return null;
  const bundle = BUNDLES[currentLocale] ?? {};
  const value = bundle[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Dev-only: list of keys known to a locale — used by registry validation. */
export function knownI18nKeys(locale: LocaleId = currentLocale): ReadonlySet<string> {
  return new Set(Object.keys(BUNDLES[locale] ?? {}));
}
