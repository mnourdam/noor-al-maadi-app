// Durable, Supabase-compatible storage adapter for native PKCE.
//
// The Android Google flow must never await a Capacitor plugin while gotrue-js
// is generating/storing the PKCE verifier. Real APK traces proved the
// Preferences bridge can hang before Browser.open(). This adapter therefore
// resolves immediately from window.localStorage, with an in-memory mirror as a
// fallback when localStorage is unavailable.
//
// V11 UPDATE: Added Capacitor Preferences as a DURABLE BACKUP that is NOT
// awaited during gotrue-js calls but is synced immediately after, and 
// checked during recovery (cold start).

import { Preferences } from "@capacitor/preferences";
import { recordTrace } from "@/lib/diag-trace";

export interface AsyncSupabaseStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** 10 minutes expiry for PKCE verifiers */
const PKCE_EXPIRY_MS = 10 * 60 * 1000;

interface DurableEntry {
  value: string;
  ts: number;
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
    recordTrace("pkce-audit", "pkce:get:start", key);
    const local = memGet(key);
    if (local) {
      recordTrace("pkce-audit", "pkce:get:memory-hit");
      return local;
    }
    recordTrace("pkce-audit", "pkce:get:memory-miss");

    // COLD START RECOVERY: If not in memory/localStorage, try Capacitor Preferences
    try {
      recordTrace("pkce-audit", "pkce:get:preferences:start");
      const { value } = await Preferences.get({ key });
      if (value) {
        recordTrace("pkce-audit", "pkce:get:preferences-hit");
        try {
          const entry = JSON.parse(value) as DurableEntry;
          const age = Date.now() - entry.ts;
          if (age < PKCE_EXPIRY_MS) {
            console.info(`[native-auth-storage] Recovered durable verifier for ${key} (age: ${Math.round(age/1000)}s)`);
            memSet(key, entry.value);
            return entry.value;
          } else {
            console.warn(`[native-auth-storage] Stale verifier ignored for ${key} (age: ${Math.round(age/1000)}s)`);
            await this.removeItem(key);
          }
        } catch {
          return value;
        }
      } else {
        recordTrace("pkce-audit", "pkce:get:preferences-miss");
      }
    } catch (e) {
      recordTrace("pkce-audit", "pkce:get:preferences:error", (e as Error).message);
      console.error("[native-auth-storage] Preferences recovery failed", e);
    }

    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    recordTrace("pkce-audit", "pkce:set:start", key);
    // 1. Immediate sync write (Memory + LocalStorage)
    memSet(key, value);
    recordTrace("pkce-audit", "pkce:set:memory");

    // 2. Fire-and-forget durable backup (don't await to avoid blocking gotrue-js flow)
    this.persistDurably(key, value).then(() => {
      recordTrace("pkce-audit", "pkce:set:preferences:success");
    }).catch(e => {
      recordTrace("pkce-audit", "pkce:set:preferences:error", (e as Error).message);
      console.error("[native-auth-storage] Background durable write failed", e);
    });
  }

  async removeItem(key: string): Promise<void> {
    memDel(key);
    try {
      await Preferences.remove({ key });
    } catch (e) {
      console.error("[native-auth-storage] Preferences remove failed", e);
    }
  }

  private async persistDurably(key: string, value: string): Promise<void> {
    const entry: DurableEntry = { value, ts: Date.now() };
    await Preferences.set({
      key,
      value: JSON.stringify(entry)
    });
  }

  /**
   * Explicitly ensures the verifier has reached durable storage.
   * Called by signInWithGoogleNative before Browser.open().
   */
  async ensureDurablePersistence(key: string): Promise<boolean> {
    const localValue = memGet(key);
    if (!localValue) return false;

    try {
      await this.persistDurably(key, localValue);
      // Double check
      const { value } = await Preferences.get({ key });
      return !!value;
    } catch (e) {
      console.error("[native-auth-storage] ensureDurablePersistence failed", e);
      return false;
    }
  }
}

let cached: ImmediateNativePkceStorage | null = null;
export function getDurableAuthStorage(): ImmediateNativePkceStorage {
  if (cached) return cached;
  cached = new ImmediateNativePkceStorage();
  return cached;
}
