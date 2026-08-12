// ============================================================
// resetForIdentityChange — THE single approved identity switch path
// ------------------------------------------------------------
// Must be used for: sign-in, sign-out, account switch, session expiry,
// account deletion, and any auth-listener-detected user change.
//
// The switch is atomic from the UI's point of view:
//   1. stop the previous identity's syncing + subscriptions
//   2. cancel and drop every cached query belonging to it
//   3. swap the active owner (this instantly repoints ALL personal
//      storage at the new namespace — see ./partition.ts)
//   4. tell every in-memory store to drop state and re-hydrate from
//      the new owner's namespace
//
// There is no page reload and no UI hiding: isolation is real, at the
// storage + memory + sync layers.
// ============================================================

import type { QueryClient } from "@tanstack/react-query";
import {
  getActiveOwner,
  guestOwnerKey,
  setActiveOwnerInternal,
  userOwnerKey,
  type OwnerKey,
} from "./owner";
import { IDENTITY_CHANGED_EVENT, setAuthReady } from "./guard";

let queryClient: QueryClient | null = null;

export function registerIdentityQueryClient(qc: QueryClient): void {
  queryClient = qc;
}

export type IdentityChangeReason =
  | "sign-in"
  | "sign-out"
  | "account-switch"
  | "session-expired"
  | "account-deleted"
  | "auth-listener";

export interface IdentityChangeDetail {
  owner: OwnerKey;
  previous: OwnerKey;
  reason: IdentityChangeReason;
}

/**
 * Swap the active identity. `nextUserId === null` means guest mode.
 * Returns `changed: false` when the identity was already active (idempotent,
 * so repeated INITIAL_SESSION / SIGNED_IN events cost nothing).
 */
export async function resetForIdentityChange(opts: {
  nextUserId: string | null;
  reason: IdentityChangeReason;
}): Promise<{ changed: boolean; owner: OwnerKey; previous: OwnerKey }> {
  const next = opts.nextUserId ? userOwnerKey(opts.nextUserId) : guestOwnerKey();
  const previous = getActiveOwner();
  if (previous === next) return { changed: false, owner: next, previous };

  // 1) Stop the previous identity's realtime traffic before anything else,
  //    so no late payload can be delivered mid-swap.
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.removeAllChannels();
  } catch { /* offline / not initialised */ }

  // 2) Cancel in-flight queries and drop everything the previous identity
  //    cached. Cancel first: a resolving fetch must not repopulate the cache.
  if (queryClient) {
    try { await queryClient.cancelQueries(); } catch { /* ignore */ }
    try { queryClient.clear(); } catch { /* ignore */ }
  }

  // 3) Atomic owner swap — every personal storage key now resolves into the
  //    new namespace and the identity epoch invalidates every in-flight guard.
  const res = setActiveOwnerInternal(next);

  // 4) Drop in-memory module caches, then let providers re-hydrate.
  try {
    const mods = await Promise.allSettled([
      import("@/lib/stories/unlock-cache"),
      import("@/lib/emblems/avatar-persistence"),
      import("@/lib/tutorial/persistence"),
      import("@/lib/profile"), // Ensure ProfileProvider's in-memory scalars are reset
    ]);
    const [unlock, avatar, tutorial, profileMod] = mods;
    if (unlock.status === "fulfilled") {
      try { (unlock.value as { clearUnlockCache?: () => void }).clearUnlockCache?.(); } catch { /* ignore */ }
    }
    if (avatar.status === "fulfilled") {
      try { (avatar.value as { clearPendingAvatar?: () => void }).clearPendingAvatar?.(); } catch { /* ignore */ }
    }
    if (tutorial.status === "fulfilled") {
      try { (tutorial.value as { invalidateOnboardingCache?: () => void }).invalidateOnboardingCache?.(); } catch { /* ignore */ }
    }
    if (profileMod.status === "fulfilled") {
      // ProfileProvider uses irth:identity-changed to re-hydrate, 
      // but we can also trigger any exported cleanup if added.
    }
  } catch { /* ignore */ }

  if (typeof window !== "undefined") {
    const detail: IdentityChangeDetail = {
      owner: next,
      previous: res.previous,
      reason: opts.reason,
    };
    try {
      window.dispatchEvent(new CustomEvent(IDENTITY_CHANGED_EVENT, { detail }));
    } catch { /* ignore */ }
  }

  return { changed: true, owner: next, previous: res.previous };
}

export { IDENTITY_CHANGED_EVENT };
