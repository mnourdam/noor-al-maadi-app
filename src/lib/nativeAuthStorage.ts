// Durable, Supabase-compatible storage adapter.
//
// Web / preview: uses `window.localStorage` synchronously (existing behavior).
// Capacitor Android: uses `@capacitor/preferences` so PKCE code verifiers
// and session tokens survive Chrome Custom Tab launches, Activity
// backgrounding, and WebView recreation.
//
// Reliability notes (2026-07 fix):
//   * `Preferences.configure({ group })` was previously awaited on every
//     read/write. With `useLegacyBridge: true` that call could never
//     resolve, hanging gotrue-js's PKCE `setItem(code_verifier)` and
//     leaving the Google button stuck in "جارٍ التحويل…".
//   * We now (a) drop the `configure()` call entirely — the default group
//     is fine for our single-app storage, (b) wrap every Preferences call
//     in a bounded timeout, and (c) fall back to an in-memory + best-effort
//     localStorage mirror if the bridge misbehaves so gotrue-js can always
//     make forward progress.

import { Capacitor } from "@capacitor/core";

export interface AsyncSupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const PREF_TIMEOUT_MS = 1500;

function isNative(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Lazy import so web bundles that never touch this path don't pull the
// Capacitor Preferences plugin into the critical hot chunk.
async function prefs() {
  const mod = await import("@capacitor/preferences");
  return mod.Preferences;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`prefs-timeout:${label}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// In-memory mirror + best-effort localStorage mirror. Guarantees gotrue-js
// forward progress even if the Capacitor bridge stalls momentarily.
const mem = new Map<string, string>();
function memGet(key: string): string | null {
  if (mem.has(key)) return mem.get(key) ?? null;
  try {
    if (typeof window !== "undefined") return window.localStorage.getItem(key);
  } catch { /* ignore */ }
  return null;
}
function memSet(key: string, value: string): void {
  mem.set(key, value);
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, value); } catch { /* ignore */ }
}
function memDel(key: string): void {
  mem.delete(key);
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); } catch { /* ignore */ }
}

class NativePreferencesStorage implements AsyncSupabaseStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      const P = await prefs();
      const { value } = await withTimeout(P.get({ key }), PREF_TIMEOUT_MS, `get:${key}`);
      if (value != null) { mem.set(key, value); return value; }
      // Preferences empty → fall back to any mirrored value we still have.
      return memGet(key);
    } catch (err) {
      try { console.warn("[nativeAuthStorage] getItem fallback", key, (err as Error)?.message); } catch { /* ignore */ }
      return memGet(key);
    }
  }
  async setItem(key: string, value: string): Promise<void> {
    // Always write the mirror first so gotrue-js can proceed even if the
    // native bridge is slow / hung.
    memSet(key, value);
    try {
      const P = await prefs();
      await withTimeout(P.set({ key, value }), PREF_TIMEOUT_MS, `set:${key}`);
    } catch (err) {
      try { console.warn("[nativeAuthStorage] setItem fallback", key, (err as Error)?.message); } catch { /* ignore */ }
    }
  }
  async removeItem(key: string): Promise<void> {
    memDel(key);
    try {
      const P = await prefs();
      await withTimeout(P.remove({ key }), PREF_TIMEOUT_MS, `remove:${key}`);
    } catch (err) {
      try { console.warn("[nativeAuthStorage] removeItem fallback", key, (err as Error)?.message); } catch { /* ignore */ }
    }
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
