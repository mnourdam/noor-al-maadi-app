// Durable, Supabase-compatible storage adapter for native PKCE.
//
// The Android Google flow must never await a Capacitor plugin while gotrue-js
// is generating/storing the PKCE verifier. Real APK traces proved the
// Preferences bridge can hang before Browser.open(). This adapter therefore
// resolves immediately from window.localStorage, with an in-memory mirror as a
// fallback when localStorage is unavailable.

export interface AsyncSupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// In-memory mirror + best-effort localStorage mirror. Guarantees gotrue-js
// forward progress without touching any native plugin in the PKCE path.
const mem = new Map<string, string>();
function memGet(key: string): string | null {
  try {
    if (typeof window !== "undefined") {
      const value = window.localStorage.getItem(key);
      if (value != null) {
        mem.set(key, value);
        return value;
      }
    }
  } catch { /* ignore */ }
  if (mem.has(key)) return mem.get(key) ?? null;
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

class ImmediateNativePkceStorage implements AsyncSupabaseStorage {
  async getItem(key: string): Promise<string | null> {
    return memGet(key);
  }
  async setItem(key: string, value: string): Promise<void> {
    memSet(key, value);
  }
  async removeItem(key: string): Promise<void> {
    memDel(key);
  }
}

let cached: AsyncSupabaseStorage | null = null;
export function getDurableAuthStorage(): AsyncSupabaseStorage {
  if (cached) return cached;
  cached = new ImmediateNativePkceStorage();
  return cached;
}
