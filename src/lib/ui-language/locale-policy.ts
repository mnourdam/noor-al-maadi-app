/** Approved target locales, not a claim that translations are release-ready. */
export const TARGET_LOCALES = ['ar', 'en', 'ur', 'id', 'tr', 'fr'] as const;
export type AppLocale = typeof TARGET_LOCALES[number];
export type TextDirection = 'rtl' | 'ltr';
export const LOCALE_META: Readonly<Record<AppLocale, { name: string; direction: TextDirection }>> = {
  ar: { name: 'العربية', direction: 'rtl' },
  en: { name: 'English', direction: 'ltr' },
  ur: { name: 'اردو', direction: 'rtl' },
  id: { name: 'Bahasa Indonesia', direction: 'ltr' },
  tr: { name: 'Türkçe', direction: 'ltr' },
  fr: { name: 'Français', direction: 'ltr' },
};

/** Accept valid language tags only. Malay and Persian are not Indonesian/Urdu. */
export function localeFromTag(value: unknown): AppLocale | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  // Preserve persisted canonical choices on older WebViews without Intl.Locale.
  const exact = value.trim().toLowerCase();
  if (TARGET_LOCALES.includes(exact as AppLocale)) return exact as AppLocale;
  try {
    const language = new Intl.Locale(value.trim()).language;
    // Legacy browser Indonesian code.
    const canonical = language === 'in' ? 'id' : language;
    return TARGET_LOCALES.includes(canonical as AppLocale) ? canonical as AppLocale : null;
  } catch { return null; }
}

export interface LocaleSelection {
  locale: AppLocale;
  source: 'manual' | 'device' | 'fallback';
}

/** Pure policy: no storage, network, DOM changes, rewards or content mutation.
 * Call after hydration. Pass only reviewed/release-enabled locales; the target
 * list alone must never activate unfinished translations. Arabic is fallback.
 */
export function selectInitialLocale(
  savedChoice: unknown,
  deviceLanguages: readonly unknown[],
  enabledLocales: readonly AppLocale[] = ['ar'],
): LocaleSelection {
  const enabled = new Set<AppLocale>(['ar', ...enabledLocales]);
  const saved = localeFromTag(savedChoice);
  if (saved && enabled.has(saved)) return { locale: saved, source: 'manual' };
  for (const tag of deviceLanguages) {
    const locale = localeFromTag(tag);
    if (locale && enabled.has(locale)) return { locale, source: 'device' };
  }
  return { locale: 'ar', source: 'fallback' };
}
