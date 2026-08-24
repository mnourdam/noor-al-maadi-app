// ============================================================
// Identity Ownership — the single authority for "whose data is this?"
// ------------------------------------------------------------
// Every piece of personal progression data in Irth belongs to exactly
// one owner:
//
//     guest:<deviceId>      — the anonymous player on this device
//     user:<userId>         — a signed-in account
//
// The owner key is the namespace under which ALL personal storage is
// partitioned (see ./partition.ts) and the guard every async response
// must pass before it is allowed to touch application state
// (see ./guard.ts).
//
// This module is intentionally dependency-free and synchronous so it can
// be initialised before React, the router, or Supabase have booted.
// ============================================================

export type OwnerKey = string; // `guest:<deviceId>` | `user:<userId>`

const DEVICE_ID_KEY = "irth.device.id.v1";
const ACTIVE_OWNER_KEY = "irth.identity.activeOwner.v1";

function raw(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function randomId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* ignore */ }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

let deviceIdCache: string | null = null;

/** Stable per-install identifier. Never partitioned, never cleared on logout. */
export function getDeviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  const s = raw();
  let id = "";
  try { id = s?.getItem(DEVICE_ID_KEY) ?? ""; } catch { /* ignore */ }
  if (!id) {
    id = randomId();
    try { s?.setItem(DEVICE_ID_KEY, id); } catch { /* ignore */ }
  }
  deviceIdCache = id;
  return id;
}

export function guestOwnerKey(): OwnerKey {
  return `guest:${getDeviceId()}`;
}

export function userOwnerKey(userId: string): OwnerKey {
  return `user:${userId}`;
}

export function isUserOwner(owner: OwnerKey): boolean {
  return owner.startsWith("user:");
}

/** `user:<id>` → `<id>`; guest owners have no user id. */
export function ownerUserId(owner: OwnerKey): string | null {
  return owner.startsWith("user:") ? owner.slice(5) : null;
}

// ------------------------------------------------------------
// Active owner + epoch
// ------------------------------------------------------------

let activeOwner: OwnerKey | null = null;
let epoch = 0;

type Listener = (owner: OwnerKey, previous: OwnerKey | null) => void;
const listeners = new Set<Listener>();

/**
 * Best-effort synchronous boot resolution: read the persisted Supabase
 * session straight out of localStorage so the very first storage access
 * of the process already lands in the right namespace (no flash of the
 * wrong identity, no data written to the wrong owner).
 */
function resolveBootOwner(): OwnerKey {
  const s = raw();
  if (!s) return guestOwnerKey();
  // A previously recorded active owner wins — it is written atomically by
  // resetForIdentityChange() and survives cold start.
  try {
    const stored = s.getItem(ACTIVE_OWNER_KEY);
    if (stored && (stored.startsWith("user:") || stored.startsWith("guest:"))) {
      // A stored `user:` owner is only trusted while a session still exists.
      if (stored.startsWith("guest:")) return guestOwnerKey();
      if (sessionUserIdFromStorage(s) === stored.slice(5)) return stored;
    }
  } catch { /* ignore */ }
  const uid = sessionUserIdFromStorage(s);
  return uid ? userOwnerKey(uid) : guestOwnerKey();
}

function sessionUserIdFromStorage(s: Storage): string | null {
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const v = s.getItem(k);
      if (!v) continue;
      const json = v.startsWith("base64-")
        ? atob(v.slice(7))
        : v;
      const parsed = JSON.parse(json) as { user?: { id?: string } };
      const id = parsed?.user?.id;
      if (typeof id === "string" && id) return id;
    }
  } catch { /* malformed session — treat as guest */ }
  return null;
}

export function getActiveOwner(): OwnerKey {
  if (!activeOwner) activeOwner = resolveBootOwner();
  return activeOwner;
}

export function getActiveUserId(): string | null {
  return ownerUserId(getActiveOwner());
}

/** Monotonic counter bumped on every identity change. Used for race guards. */
export function getIdentityEpoch(): number {
  return epoch;
}

/**
 * Low-level owner swap. Do NOT call directly from features — always go
 * through `resetForIdentityChange()` so caches/subscriptions are torn down
 * atomically with the swap.
 */
export function setActiveOwnerInternal(next: OwnerKey): { changed: boolean; previous: OwnerKey } {
  const previous = getActiveOwner();
  if (previous === next) return { changed: false, previous };
  activeOwner = next;
  epoch += 1;
  // Diagnostics
  try {
    if (typeof window !== "undefined") {
      (window as any).__irth_active_owner = next;
      (window as any).__irth_identity_epoch = epoch;
    }
  } catch {}
  try { raw()?.setItem(ACTIVE_OWNER_KEY, next); } catch { /* ignore */ }
  for (const l of Array.from(listeners)) {
    try { l(next, previous); } catch { /* listener must never break the swap */ }
  }
  return { changed: true, previous };
}

export function onOwnerChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Test-only hard reset of the in-memory identity state. */
export function __resetIdentityForTests(): void {
  activeOwner = null;
  deviceIdCache = null;
  epoch = 0;
  listeners.clear();
}

export const IDENTITY_DEVICE_ID_KEY = DEVICE_ID_KEY;
export const IDENTITY_ACTIVE_OWNER_KEY = ACTIVE_OWNER_KEY;
