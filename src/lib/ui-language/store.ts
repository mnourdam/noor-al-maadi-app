import { useSyncExternalStore } from 'react';
import { UI_MESSAGES, uiDirection, type UiLanguage } from './messages';
/** Already covered by the identity partition's device-wide preference namespace. */
export const UI_LANGUAGE_KEY = 'irth.device.uiLanguage.v1';
const listeners = new Set<() => void>();
let language: UiLanguage = 'ar';
let initialized = false;
let memoryOnly = false;
const valid = (value: unknown): value is UiLanguage => value === 'ar' || value === 'en';
function storedLanguage(): UiLanguage {
  const stored = window.localStorage.getItem(UI_LANGUAGE_KEY);
  return valid(stored) ? stored : 'ar';
}
export function getUiLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'ar';
  if (!initialized) {
    initialized = true;
    try { language = storedLanguage(); } catch { /* unavailable storage: Arabic default */ }
  }
  return language;
}
function publish(next: UiLanguage) {
  if (next === language) return;
  language = next;
  for (const listener of Array.from(listeners)) listener();
}
/** Local preference only; no profile writes, authentication or content migration. */
export function setUiLanguage(next: UiLanguage): void {
  if (!valid(next) || typeof window === 'undefined') return;
  initialized = true;
  // Retain a usable in-memory choice if private mode/quota blocks persistence.
  try {
    window.localStorage.setItem(UI_LANGUAGE_KEY, next);
    memoryOnly = window.localStorage.getItem(UI_LANGUAGE_KEY) !== next;
  } catch { memoryOnly = true; }
  publish(next);
}
function storageChanged(event: StorageEvent) {
  if (event.key !== UI_LANGUAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    initialized = true;
    const next = storedLanguage();
    memoryOnly = false;
    publish(next);
  } catch { /* unreadable storage must not reset the current in-memory choice */ }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', storageChanged);
  // Reconcile changes made in another tab while no UI subscriber was mounted.
  if (!memoryOnly) {
    try { const next = storedLanguage(); initialized = true; publish(next); } catch { /* session choice */ }
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', storageChanged);
  };
}
export function useUiLanguage() {
  const language = useSyncExternalStore(subscribe, getUiLanguage, () => 'ar' as const);
  return { language, direction: uiDirection(language), messages: UI_MESSAGES[language], setLanguage: setUiLanguage };
}
