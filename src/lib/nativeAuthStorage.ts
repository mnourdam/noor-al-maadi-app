// Durable, Supabase-compatible storage adapter.
//
// Web / preview: uses `window.localStorage` synchronously (existing behavior).
// Capacitor Android: uses `@capacitor/preferences` under a dedicated
// "irth-auth" group so PKCE code verifiers and session tokens persist
// across Chrome Custom Tab launches, Activity backgrounding, and WebView
// recreation.
//
// gotrue-js accepts an async storage adapter, so returning `Promise<...>`
// from getItem/setItem/removeItem is fine even in web (the calls resolve
// synchronously via localStorage).

import { Capacitor } from "@capacitor/core";

export interface AsyncSupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const GROUP = "irth-auth";

function isNative(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Lazy import so web bundles that never touch this path don't pull the
// Capacitor Preferences plugin into the critical hot chunk.
async function prefs() {
  const mod = await import("@capacitor/preferences");
  return mod.Preferences;
}

class NativePreferencesStorage implements AsyncSupabaseStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      const P = await prefs();
      await P.configure({ group: GROUP });
      const { value } = await P.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  }
  async setItem(key: string, value: string): Promise<void> {
    try {
      const P = await prefs();
      await P.configure({ group: GROUP });
      await P.set({ key, value });
    } catch { /* ignore */ }
  }
  async removeItem(key: string): Promise<void> {
    try {
      const P = await prefs();
      await P.configure({ group: GROUP });
      await P.remove({ key });
    } catch { /* ignore */ }
  }
}

class LocalStorageAdapter implements AsyncSupabaseStorage {
  async getItem(key: string): Promise<string | null> {
    try { return typeof window === "undefined" ? null : window.localStorage.getItem(key); }
    catch { return null; }
  }
  async setItem(key: string, value: string): Promise<void> {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); }
    catch { /* ignore */ }
  }
  async removeItem(key: string): Promise<void> {
    try { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
    catch { /* ignore */ }
  }
}

let cached: AsyncSupabaseStorage | null = null;
export function getDurableAuthStorage(): AsyncSupabaseStorage {
  if (cached) return cached;
  cached = isNative() ? new NativePreferencesStorage() : new LocalStorageAdapter();
  return cached;
}
