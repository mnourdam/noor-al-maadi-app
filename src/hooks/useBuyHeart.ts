// ============================================================
// useBuyHeart — canonical heart-purchase hook.
// ------------------------------------------------------------
// - Authenticated: calls the atomic `purchase_heart` RPC. The
//   server owns the price and locks the profile row so racing
//   taps / tabs cannot double-spend.
// - Guest: uses the local atomic reducer in ProfileProvider
//   (spendDinarsForHeart) which mutates dinars + hearts in a
//   single setState.
// Guards against rapid double-tap via an in-flight flag.
// ============================================================
import { useCallback, useRef, useState } from "react";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { HEART_COST_DINARS } from "@/lib/economy";
import { HEART_MAX, getEffectiveHearts, commitHearts } from "@/lib/hearts";

export type PurchaseStatus =
  | "purchased"
  | "hearts_full"
  | "insufficient_dinars"
  | "unauthorized"
  | "failed";

export interface PurchaseResult {
  status: PurchaseStatus;
  hearts?: number;
  dinars?: number;
}

export function useBuyHeart() {
  const { profile, spendDinarsForHeart, applyServerStats, replaceProfile } = useProfile();
  const [inFlight, setInFlight] = useState(false);
  const lock = useRef(false);

  const buy = useCallback(async (): Promise<PurchaseResult> => {
    if (lock.current) return { status: "failed" };
    lock.current = true;
    setInFlight(true);
    try {
      const now = Date.now();
      const eff = getEffectiveHearts(profile, now);
      if (eff >= HEART_MAX) return { status: "hearts_full", hearts: eff, dinars: profile.dinars };

      if (profile.loggedIn) {
        // Authenticated path — server is authoritative.
        const { data, error } = await supabase.rpc("purchase_heart");
        if (error) {
          console.error("[purchase_heart] rpc error", error);
          return { status: "failed" };
        }
        const payload = (data ?? {}) as { status?: PurchaseStatus; hearts?: number; dinars?: number };
        const status = (payload.status ?? "failed") as PurchaseStatus;
        if (status === "purchased" && typeof payload.hearts === "number" && typeof payload.dinars === "number") {
          // Preserve regeneration timer via commitHearts semantics.
          const committed = commitHearts(profile, payload.hearts, Date.now());
          replaceProfile({
            ...profile,
            dinars: payload.dinars,
            hearts: committed.hearts,
            heartsAt: committed.heartsAt,
          });
          try { window.dispatchEvent(new CustomEvent("irth:heart-purchased", { detail: { hearts: committed.hearts, dinars: payload.dinars } })); } catch {}
          return { status, hearts: committed.hearts, dinars: payload.dinars };
        }
        // Non-success: sync any drift.
        if (typeof payload.hearts === "number" || typeof payload.dinars === "number") {
          applyServerStats({ hearts: payload.hearts, dinars: payload.dinars });
        }
        return { status, hearts: payload.hearts, dinars: payload.dinars };
      }

      // Guest path — local atomic reducer.
      if ((profile.dinars ?? 0) < HEART_COST_DINARS) {
        return { status: "insufficient_dinars", hearts: eff, dinars: profile.dinars };
      }
      const ok = spendDinarsForHeart();
      if (!ok) return { status: "failed", hearts: eff, dinars: profile.dinars };
      try { window.dispatchEvent(new CustomEvent("irth:heart-purchased")); } catch {}
      return { status: "purchased" };
    } finally {
      // Short cooldown to absorb rapid double-tap even after state settles.
      setTimeout(() => { lock.current = false; }, 300);
      setInFlight(false);
    }
  }, [profile, spendDinarsForHeart, applyServerStats, replaceProfile]);

  return { buy, inFlight };
}
