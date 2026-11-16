import { useSyncExternalStore } from 'react';
import { UI_MESSAGES, uiDirection, type UiLanguage } from './messages';
import { createLanguagePreference, UI_LANGUAGE_KEY } from './preference';

export { UI_LANGUAGE_KEY } from './preference';
// English remains an explicitly selected partial preview. Expand automatic
// only after full reviewed UI/content coverage, not by adding target locales.
const preference = createLanguagePreference<UiLanguage>({
  selectable: ['ar', 'en'],
  automatic: ['ar'],
  storage: () => window.localStorage,
  deviceLanguages: () => window.navigator.languages?.length
    ? window.navigator.languages : [window.navigator.language],
});
let subscriptions = 0;
export function getUiLanguage(): UiLanguage {
  return typeof window === 'undefined' ? 'ar' : preference.get();
}
export function setUiLanguage(next: UiLanguage): void {
  if (typeof window !== 'undefined') preference.set(next);
}
function storageChanged(event: StorageEvent) {
  if (event.key !== UI_LANGUAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    preference.externalChange();
  } catch { /* denied storage preserves the session */ }
}
function subscribe(listener: () => void) {
  const unsubscribe = preference.subscribe(listener);
  if (++subscriptions === 1) window.addEventListener('storage', storageChanged);
  preference.reconcile();
  return () => {
    unsubscribe();
    if (--subscriptions === 0) window.removeEventListener('storage', storageChanged);
  };
}
export function useUiLanguage() {
  const language = useSyncExternalStore(subscribe, getUiLanguage, () => 'ar' as const);
  return { language, direction: uiDirection(language), messages: UI_MESSAGES[language], setLanguage: setUiLanguage };
}
