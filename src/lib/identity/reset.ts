import { getActiveOwner, userOwnerKey, guestOwnerKey, type OwnerKey, setActiveOwnerInternal } from "./owner";
import { setAuthReady } from "./guard";
import { recordTrace } from "@/lib/diag-trace";

let queryClient: any = null;
let lastInitializedOwner: OwnerKey | null = null;
let resetGeneration = 0;
let inflightTarget: OwnerKey | null = null;
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
 * so repeated INITIAL_SESSION / SIGNED_IN events cost nothing). Superseded
 * requests also return changed:false with the currently active owner; they may
 * not publish readiness or resume cleanup against their successor's namespace.
 */
export async function resetForIdentityChange(opts: {
  nextUserId: string | null;
  reason: IdentityChangeReason;
}): Promise<{ changed: boolean; owner: OwnerKey; previous: OwnerKey }> {
  const next = opts.nextUserId ? userOwnerKey(opts.nextUserId) : guestOwnerKey();
  const previous = getActiveOwner();

  // Only collapse if identical identity is ALREADY active AND fully initialized.
  if (previous === next && lastInitializedOwner === next && !inflightReset) {
    if (opts.nextUserId) setAuthReady(true);
    return { changed: false, owner: next, previous };
  }
  
  if (inflightReset && inflightTarget === next) return inflightReset;

  // Target identity, not active namespace, determines same-request coalescing.
  // A newer request fences every continuation of all older resets (including ABA).
  const generation = ++resetGeneration;
  inflightTarget = next;
  const current = () => generation === resetGeneration;
  const superseded = () => ({ changed: false, owner: getActiveOwner(), previous });

  inflightReset = (async () => {
    try {
      // PRE-READINESS RESET: Drop readiness during switch so no late payload
      // belonging to the previous identity can be delivered mid-swap.
      setAuthReady(false);
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        if (!current()) return superseded();
        await supabase.removeAllChannels();
      } catch { /* offline / not initialised */ }

      if (!current()) return superseded();

      // 2) Cancel in-flight queries and drop everything the previous identity
      //    cached. Cancel first: a resolving fetch must not repopulate the cache.
      if (queryClient) {
        const client = queryClient;
        try { await client.cancelQueries(); } catch { /* ignore */ }
        if (!current()) return superseded();
        try { client.clear(); } catch { /* ignore */ }
      }

      if (!current()) return superseded();

      // 3) Atomic owner swap — every personal storage key now resolves into the
      //    new namespace and the identity epoch invalidates every in-flight guard.
      const res = setActiveOwnerInternal(next);
      if (!current()) return superseded();


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
        if (!current()) return superseded();
        const [unlock, avatar, tutorial, campaignIntro, profileMod, achEngine, campaignProg, invProgress] = mods;
        
        if (unlock.status === "fulfilled") {
          try { (unlock.value as any).clearUnlockCache?.(); } catch { /* ignore */ }
        }
        if (!current()) return superseded();
        if (avatar.status === "fulfilled") {
          try { (avatar.value as any).clearPendingAvatar?.(); } catch { /* ignore */ }
        }
        if (!current()) return superseded();
        if (tutorial.status === "fulfilled") {
          try { (tutorial.value as any).invalidateOnboardingCache?.(); } catch { /* ignore */ }
        }
        if (!current()) return superseded();
        if (campaignIntro.status === "fulfilled") {
          try { (campaignIntro.value as any).clearIntroLinkCache?.(); } catch { /* ignore */ }
        }
        
        // ATOMIC PROGRESSION RESET
        if (!current()) return superseded();
        if (achEngine.status === "fulfilled") {
          try { (achEngine.value as any).resetAchievementEngine?.(opts.nextUserId); } catch { /* ignore */ }
        }
        if (!current()) return superseded();
        if (campaignProg.status === "fulfilled") {
          try { 
            (campaignProg.value as any).clearCampaignProgressionCache?.(); 
            if (!current()) return superseded();
            if (!opts.nextUserId) {
              // Import completions directly to sanitize Guest storage
              const { sanitizeGuestCampaignCompletions } = await import("@/lib/campaigns/completions");
              if (!current()) return superseded();
              sanitizeGuestCampaignCompletions();
              if (!current()) return superseded();
              // Also sanitize Guest achievements via engine
              if (achEngine.status === "fulfilled") {
                try { (achEngine.value as any).resetAchievementEngine?.(null); } catch { /* ignore */ }
              }
            }
          } catch { /* ignore */ }
        }
        if (!current()) return superseded();
        if (invProgress.status === "fulfilled") {
          try { (invProgress.value as any).resetInvestigationIdentity?.(opts.nextUserId); } catch { /* ignore */ }
        }

      } catch { /* ignore */ }


      if (!current()) return superseded();
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

      // Event listeners may synchronously request another identity.
      if (!current()) return superseded();

      // 5) Auth readiness signal.
      if (opts.nextUserId) {
        setAuthReady(true);
      } else {
        setAuthReady(false);
      }

      lastInitializedOwner = next;
      return { changed: true, owner: next, previous: res.previous };
    } finally {
      // A superseded reset must not release its successor's coalescing slot.
      if (current()) {
        inflightReset = null;
        inflightTarget = null;
      }
    }
  })();
  
  return inflightReset;
}
