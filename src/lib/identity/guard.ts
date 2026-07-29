// ============================================================
// Identity Guard — anti-race primitives
// ------------------------------------------------------------
// A slow response belonging to account A must never be applied after
// the app switched to guest or to account B. Every async read/sync
// path captures the identity it started under and re-checks it before
// touching state.
// ============================================================

import { getActiveOwner, getActiveUserId, getIdentityEpoch, type OwnerKey } from "./owner";

export interface IdentityToken {
  owner: OwnerKey;
  epoch: number;
}

export function captureIdentity(): IdentityToken {
  return { owner: getActiveOwner(), epoch: getIdentityEpoch() };
}

/** True only when the identity has not changed since the token was taken. */
export function isIdentityCurrent(token: IdentityToken): boolean {
  return token.epoch === getIdentityEpoch() && token.owner === getActiveOwner();
}

/** Guard for a payload that carries the user it belongs to. */
export function belongsToActiveUser(userId: string | null | undefined): boolean {
  return !!userId && userId === getActiveUserId();
}

/**
 * Wraps an async task with an identity check. Resolves to `null` when the
 * identity changed while the task was in flight, so callers can simply
 * `if (!result) return;` instead of poisoning the new identity's state.
 */
export async function runOwned<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const token = captureIdentity();
  const controller = new AbortController();
  const off = subscribeAbortOnIdentityChange(token, controller);
  try {
    const value = await task(controller.signal);
    return isIdentityCurrent(token) ? value : null;
  } finally {
    off();
  }
}

function subscribeAbortOnIdentityChange(token: IdentityToken, c: AbortController): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    if (!isIdentityCurrent(token)) {
      try { c.abort(); } catch { /* ignore */ }
    }
  };
  window.addEventListener(IDENTITY_CHANGED_EVENT, handler);
  return () => window.removeEventListener(IDENTITY_CHANGED_EVENT, handler);
}

export const IDENTITY_CHANGED_EVENT = "irth:identity-changed";
