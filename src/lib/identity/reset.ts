import { getActiveOwner, userOwnerKey, guestOwnerKey, type OwnerKey, setActiveOwnerInternal } from "./owner";
import { setAuthReady } from "./guard";
import { recordTrace } from "@/lib/diag-trace";

let queryClient: any = null;
let lastInitializedOwner: OwnerKey | null = null;
let inflightReset: Promise<{ changed: boolean; owner: OwnerKey; previous: OwnerKey }> | null = null;

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
  recordTrace("sync-forensics", "IDENTITY_CHANGE_START", JSON.stringify({ reason: opts.reason, nextUserId: opts.nextUserId?.slice(0, 8) }));
  const next = opts.nextUserId ? userOwnerKey(opts.nextUserId) : guestOwnerKey();
  const previous = getActiveOwner();

  recordTrace("logout-audit", "identity-reset:start", JSON.stringify({
    previousOwner: previous,
    requestedNextOwner: next,
    reason: opts.reason
  }));

  // Only collapse if identical identity is ALREADY active AND fully initialized.
  if (previous === next && lastInitializedOwner === next && !inflightReset) {
    if (opts.nextUserId) setAuthReady(true);
    return { changed: false, owner: next, previous };
  }
  
  if (inflightReset && previous === next) return inflightReset;

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
  recordTrace("sync-forensics", "PARTITION_SWITCH_START", next);
  recordTrace("logout-audit", "owner:before", previous);
  const res = setActiveOwnerInternal(next);
  recordTrace("logout-audit", "owner:after", next);
  recordTrace("sync-forensics", "PARTITION_SWITCH_DONE", next);

  recordTrace("logout-audit", "cleanup:start");

  // 4) Drop in-memory module caches, then let providers re-hydrate.
  try {
    const mods = await Promise.allSettled([
      import("@/lib/stories/unlock-cache"),
      import("@/lib/emblems/avatar-persistence"),
      import("@/lib/tutorial/persistence"),
      import("@/lib/campaigns/intro/content-store"),
      import("@/lib/profile"),
      import("@/lib/achievements/v2/engine"),
      import("@/lib/campaigns/useCampaignProgression"),
      import("@/lib/investigations/progress"),
    ]);
    const [unlock, avatar, tutorial, campaignIntro, profileMod, achEngine, campaignProg, invProgress] = mods;
    
    if (unlock.status === "fulfilled") {
      try { (unlock.value as any).clearUnlockCache?.(); } catch { /* ignore */ }
    }
    if (avatar.status === "fulfilled") {
      try { (avatar.value as any).clearPendingAvatar?.(); } catch { /* ignore */ }
    }
    if (tutorial.status === "fulfilled") {
      try { (tutorial.value as any).invalidateOnboardingCache?.(); } catch { /* ignore */ }
    }
    if (campaignIntro.status === "fulfilled") {
      try { (campaignIntro.value as any).clearIntroLinkCache?.(); } catch { /* ignore */ }
    }
    
    // ATOMIC PROGRESSION RESET
    if (achEngine.status === "fulfilled") {
      try { (achEngine.value as any).resetAchievementEngine?.(opts.nextUserId); } catch { /* ignore */ }
    }
    if (campaignProg.status === "fulfilled") {
      try { 
        (campaignProg.value as any).clearCampaignProgressionCache?.(); 
        if (!opts.nextUserId) {
          // Import completions directly to sanitize Guest storage
          import("@/lib/campaigns/completions").then(c => {
            c.sanitizeGuestCampaignCompletions();
          }).catch(() => {});
          // Also sanitize Guest achievements via engine
          if (achEngine.status === "fulfilled") {
            try { (achEngine.value as any).resetAchievementEngine?.(null); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
    if (invProgress.status === "fulfilled") {
      try { (invProgress.value as any).resetInvestigationIdentity?.(opts.nextUserId); } catch { /* ignore */ }
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

  recordTrace("sync-forensics", "AUTH_READY", String(!!opts.nextUserId));
  return { changed: true, owner: next, previous: res.previous };
}
