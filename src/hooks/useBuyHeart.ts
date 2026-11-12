// Authenticated heart purchase: server owns pricing; local application requires
// a persisted conditional profile receipt. Uncertainty never authorizes another
// RPC. Guest behavior retains its existing immediate reducer/boolean contract.
import { useCallback, useEffect, useRef, useState } from "react";
import { useProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { HEART_COST_DINARS } from "@/lib/economy";
import { HEART_MAX, getEffectiveHearts } from "@/lib/hearts";
import { getActiveOwner, getIdentityEpoch } from "@/lib/identity/owner";

export type PurchaseStatus =
  "purchased" | "hearts_full" | "insufficient_dinars" | "unauthorized" | "failed" | "unresolved";
export interface PurchaseResult {
  status: PurchaseStatus;
  hearts?: number;
  dinars?: number;
}
function receipt(value: unknown): PurchaseResult | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const p = value as Record<string, unknown>;
  if (p.status === "unauthorized" || p.status === "failed") return { status: p.status };
  if (
    typeof p.status !== "string" ||
    !["purchased", "hearts_full", "insufficient_dinars"].includes(p.status)
  )
    return;
  if (
    typeof p.hearts !== "number" ||
    !Number.isInteger(p.hearts) ||
    p.hearts < 0 ||
    p.hearts > HEART_MAX ||
    typeof p.dinars !== "number" ||
    !Number.isSafeInteger(p.dinars) ||
    p.dinars < 0
  )
    return;
  return { status: p.status as PurchaseStatus, hearts: p.hearts, dinars: p.dinars };
}
export function useBuyHeart() {
  const { profile, userId, spendDinarsForHeart, captureHeartPurchase } = useProfile();
  const [inFlight, setInFlight] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const uncertain = useRef(false),
    lock = useRef(false),
    alive = useRef(false);
  const lifecycle = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lifecycle.current++;
      clearTimeout(timer.current);
    };
  }, []);
  const buy = useCallback(async (): Promise<PurchaseResult> => {
    if (uncertain.current) return { status: "unresolved" };
    if (lock.current || !alive.current) return { status: "failed" };
    const operation = captureHeartPurchase();
    if (!operation.current()) return { status: "failed" };
    const owner = getActiveOwner(),
      epoch = getIdentityEpoch(),
      generation = lifecycle.current;
    const current = () =>
      alive.current &&
      lifecycle.current === generation &&
      getActiveOwner() === owner &&
      getIdentityEpoch() === epoch;
    const unresolved = (): PurchaseResult => {
      uncertain.current = true;
      if (alive.current && lifecycle.current === generation) setNeedsReconciliation(true);
      return { status: "unresolved" };
    };
    lock.current = true;
    setInFlight(true);
    let dispatched = false;
    try {
      const eff = getEffectiveHearts(profile, Date.now());
      if (eff >= HEART_MAX) return { status: "hearts_full", hearts: eff, dinars: profile.dinars };
      if (profile.loggedIn) {
        const { data: session, error: authError } = await supabase.auth.getSession();
        if (!current() || !operation.current()) return { status: "failed" };
        if (authError || !userId || session.session?.user.id !== userId)
          return { status: "unauthorized" };
        dispatched = true;
        const { data, error } = await supabase.rpc("purchase_heart");
        if (!current()) return unresolved();
        if (error) return unresolved();
        const result = receipt(data);
        if (!result) return unresolved();
        if (result.status === "failed" || result.status === "unauthorized") return result;
        if (!operation.current()) return unresolved();
        // Non-success historically reconciled dinars only; do not change heart policy.
        const applied = await operation.apply({
          dinars: result.dinars!,
          ...(result.status === "purchased" ? { hearts: result.hearts! } : {}),
        });
        if (!current() || !applied) return unresolved();
        if (result.status === "purchased") {
          try {
            if (current())
              window.dispatchEvent(
                new CustomEvent("irth:heart-purchased", {
                  detail: { hearts: result.hearts, dinars: result.dinars },
                }),
              );
          } catch {
            /* observer */
          }
          if (!current()) return unresolved();
        }
        return result;
      }
      if ((profile.dinars ?? 0) < HEART_COST_DINARS)
        return { status: "insufficient_dinars", hearts: eff, dinars: profile.dinars };
      if (!current() || !operation.current()) return { status: "failed" };
      const ok = spendDinarsForHeart();
      if (!ok) return { status: "failed", hearts: eff, dinars: profile.dinars };
      try {
        if (current()) window.dispatchEvent(new CustomEvent("irth:heart-purchased"));
      } catch {
        /* observer */
      }
      return current() ? { status: "purchased" } : { status: "unresolved" };
    } catch {
      return dispatched ? unresolved() : { status: "failed" };
    } finally {
      if (alive.current && lifecycle.current === generation) {
        setInFlight(false);
        timer.current = setTimeout(() => {
          lock.current = false;
        }, 300);
      }
    }
  }, [profile, userId, spendDinarsForHeart, captureHeartPurchase]);
  // This mount-local latch is not a durable/cross-tab idempotency guarantee.
  return { buy, inFlight, needsReconciliation };
}
