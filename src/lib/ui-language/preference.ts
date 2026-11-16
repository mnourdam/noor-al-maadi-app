import { localeFromTag, selectInitialLocale, type AppLocale } from './locale-policy';

export const UI_LANGUAGE_KEY = 'irth.device.uiLanguage.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export interface PreferenceOptions<L extends AppLocale> {
  /** Must include Arabic. May include explicitly labelled opt-in previews. */
  selectable: readonly L[];
  /** Reviewed complete locales only: never automatically enable previews. */
  automatic: readonly L[];
  storage: () => StorageLike;
  deviceLanguages: () => readonly string[];
}

/** Device-only preference; no profile writes or destructive quota cleanup. */
export function createLanguagePreference<L extends AppLocale>(options: PreferenceOptions<L>) {
  if (!options.selectable.includes('ar' as L)) throw new Error('Arabic fallback required');
  if (options.automatic.some(locale => !options.selectable.includes(locale))) {
    throw new Error('Automatic locales must be selectable');
  }
  const selectable = new Set(options.selectable);
  let current = 'ar' as L;
  let initialized = false;
  let memoryOnly = false;
  const listeners = new Set<() => void>();
  function deviceDefault(): L {
    let tags: readonly string[] = [];
    try { tags = options.deviceLanguages(); } catch { /* inaccessible navigator */ }
    return selectInitialLocale(null, tags, options.automatic).locale as L;
  }
  function read(): L {
    const saved = localeFromTag(options.storage().getItem(UI_LANGUAGE_KEY));
    return saved && selectable.has(saved as L) ? saved as L : deviceDefault();
  }
  function publish(next: L) {
    if (current === next) return;
    current = next;
    for (const listener of Array.from(listeners)) listener();
  }
  return {
    get(): L {
      if (!initialized) {
        initialized = true;
        try { current = read(); } catch { current = deviceDefault(); }
      }
      return current;
    },
    set(next: L): void {
      if (!selectable.has(next)) return;
      initialized = true;
      try {
        const storage = options.storage();
        storage.setItem(UI_LANGUAGE_KEY, next);
        memoryOnly = storage.getItem(UI_LANGUAGE_KEY) !== next;
      } catch { memoryOnly = true; }
      publish(next);
    },
    /** Called on mount; preserve a failed-write session choice. */
    reconcile(): void {
      if (memoryOnly) return;
      try { const next = read(); initialized = true; publish(next); } catch { /* retain session */ }
    },
    /** Called only for this preference/localStorage events, including clear. */
    externalChange(): void {
      try {
        const next = read();
        initialized = true;
        memoryOnly = false;
        publish(next);
      } catch { /* unreadable storage cannot erase session choice */ }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
