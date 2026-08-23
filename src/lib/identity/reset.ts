import { getActiveOwner, userOwnerKey, guestOwnerKey, type OwnerKey, setActiveOwnerInternal } from "./owner";
import { setAuthReady } from "./guard";
import { recordTrace } from "@/lib/diag-trace";

let queryClient: any = null;
export function setQueryClientForReset(client: any) {
  queryClient = client;
}

/** Added missing exports needed for build */
export function registerIdentityQueryClient(client: any) {
  queryClient = client;
}

export type IdentityChangeReason = 
  | "boot" 
  | "login" 
  | "logout" 
  | "account-switch" 
  | "session-expired"
  | "auth-listener"
  | "sign-in"
  | "sign-out"
  | "account-deleted";

export interface IdentityChangeDetail {
  owner: OwnerKey;
  previous: OwnerKey;
  reason: IdentityChangeReason;
}

export const IDENTITY_CHANGED_EVENT = "irth:identity-changed";

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

  recordTrace("logout-audit", "identity-reset:start", JSON.stringify({
    previousOwner: previous,
    requestedNextOwner: next,
    reason: opts.reason
  }));

  if (previous === next) {
    // If we're already the correct user, ensure readiness is signaled.
    if (opts.nextUserId) setAuthReady(true);
    return { changed: false, owner: next, previous };
  }

  // PRE-READINESS RESET: Drop readiness during switch so no late payload
  // belonging to the previous identity can be delivered mid-swap.
  setAuthReady(false);
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
  recordTrace("logout-audit", "owner:before", previous);
  const res = setActiveOwnerInternal(next);
  recordTrace("logout-audit", "owner:after", next);

  recordTrace("logout-audit", "cleanup:start");

  // 4) Drop in-memory module caches, then let providers re-hydrate.
  try {
    const mods = await Promise.allSettled([
      import("@/lib/stories/unlock-cache"),
      import("@/lib/emblems/avatar-persistence"),
      import("@/lib/tutorial/persistence"),
      import("@/lib/campaigns/intro/content-store"),
      import("@/lib/profile"), // Ensure ProfileProvider's in-memory scalars are reset
    ]);
    const [unlock, avatar, tutorial, campaignIntro, profileMod] = mods;
    if (unlock.status === "fulfilled") {
      try { (unlock.value as { clearUnlockCache?: () => void }).clearUnlockCache?.(); } catch { /* ignore */ }
    }
    if (avatar.status === "fulfilled") {
      try { (avatar.value as { clearPendingAvatar?: () => void }).clearPendingAvatar?.(); } catch { /* ignore */ }
    }
    if (tutorial.status === "fulfilled") {
      try { (tutorial.value as { invalidateOnboardingCache?: () => void }).invalidateOnboardingCache?.(); } catch { /* ignore */ }
    }
    if (campaignIntro.status === "fulfilled") {
      try { (campaignIntro.value as { clearIntroLinkCache?: () => void }).clearIntroLinkCache?.(); } catch { /* ignore */ }
    }
    if (profileMod.status === "fulfilled") {
      // ProfileProvider uses irth:identity-changed to re-hydrate, 
      // but we can also trigger any exported cleanup if added.
    }
    recordTrace("logout-audit", "cleanup:end");
  } catch { /* ignore */ }

  if (typeof window !== "undefined") {
    const detail: IdentityChangeDetail = {
      owner: next,
      previous: res.previous,
      reason: opts.reason,
    };
    try {
      recordTrace("logout-audit", "identity-event:before-dispatch");
      recordTrace("logout-audit", "identity-event:dispatch");
      window.dispatchEvent(new CustomEvent(IDENTITY_CHANGED_EVENT, { detail }));
    } catch { /* ignore */ }
  }

  // 5) Auth readiness signal.
  if (opts.nextUserId) {
    setAuthReady(true);
  } else {
    setAuthReady(false);
  }

  return { changed: true, owner: next, previous: res.previous };
}
