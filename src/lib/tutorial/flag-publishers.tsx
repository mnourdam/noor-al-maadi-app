// ============================================================
// Guided Tutorial — Eligibility flag publishers
// ------------------------------------------------------------
// Bridges independent app subsystems into the tutorial's
// eligibility bus WITHOUT touching those subsystems. Mounted once
// under <TutorialProvider>.
//
// Signals published:
//   - cinematicUnmounted
//   - openingCompletedEvent
//   - firstLaunchChoiceRecorded
//   - sessionReady
//   - authDialogClosed
//   - googleAuthResultDialogClosed
//   - recoveryGuardInactive
//
// Everything is inferred by observing existing globals: the
// `OPENING_COMPLETED_EVENT` window event, localStorage keys, the
// shared `subscribeAuthDialog` bus, the `useAccount()` session, and
// polling `isRecoveryMode()`. No component APIs change.
// ============================================================

import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { OPENING_COMPLETED_EVENT } from "@/components/cinematic/CinematicOpening";
import { loadCinematicOpeningConfig } from "@/lib/cinematic-opening/config";
import { hasCompleted as openingCompleted } from "@/lib/cinematic-opening/persistence";
import { subscribeAuthDialog, type AuthDialogOptions } from "@/lib/authDialog";
import { useAccount } from "@/lib/account";
import { isRecoveryMode } from "@/lib/recoveryMode";
import { getReconciliationState, subscribeReconciliation } from "@/lib/boot/reconciliation";

import {
  refreshFirstLaunchChoiceFlag,
  setEligibilityFlag,
} from "./eligibility";

export function TutorialFlagPublishers() {
  const { loadingSession, user } = useAccount();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Session-ready flag.
  useEffect(() => {
    setEligibilityFlag("sessionReady", !loadingSession);
  }, [loadingSession]);

  // Tutorial auto-start must not race authenticated onboarding hydration.
  // Guests have no server mirror, so they are considered reconciled once the
  // auth session check is done. Signed-in users must wait for AccountProvider's
  // boot reconciliation to reach the authoritative server result.
  useEffect(() => {
    const publish = () => {
      if (loadingSession) {
        setEligibilityFlag("onboardingReconciled", false);
        return;
      }
      if (!user) {
        setEligibilityFlag("onboardingReconciled", true);
        return;
      }
      const s = getReconciliationState();
      setEligibilityFlag("onboardingReconciled", s === "reconciled" || s === "offline-local");
    };
    publish();
    return subscribeReconciliation(publish);
  }, [loadingSession, user?.id]);

  // Opening-completed authority.
  //
  // The cinematic opening owns exactly one truth: for a given
  // configured version, has this device completed it? We derive the
  // tutorial-eligibility flag from that authority using the SAME
  // config loader + persistence check that CinematicOpening and
  // FirstLaunchGate use. No hardcoded version, no independent lifecycle
  // state, no timing hacks.
  //
  // - If the opening is not configured (cfg == null) or was already
  //   completed for its current version, the opening will not play on
  //   this boot — publish "completed" immediately.
  // - Otherwise, wait for `OPENING_COMPLETED_EVENT`, which the opening
  //   dispatches from `finish()` (and once more when persistence has
  //   just recorded completion). The listener stays attached for the
  //   lifetime of the mount so it also catches replays.
  useEffect(() => {
    const setDone = () => {
      setEligibilityFlag("openingCompletedEvent", true);
      setEligibilityFlag("cinematicUnmounted", true);
    };
    let cancelled = false;
    if (typeof window === "undefined") return undefined;
    window.addEventListener(OPENING_COMPLETED_EVENT, setDone);
    (async () => {
      try {
        const cfg = await loadCinematicOpeningConfig();
        if (cancelled) return;
        if (!cfg || (!cfg.replayForAllUsers && openingCompleted(cfg.version))) {
          setDone();
        }
      } catch {
        /* ignore — event path remains authoritative */
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener(OPENING_COMPLETED_EVENT, setDone);
    };
  }, []);


  // First-launch choice: refresh on mount, on focus, on storage, and
  // whenever the pathname changes (choice may have just been made).
  // First-launch choice: refresh on mount, on focus, on storage
  // (cross-tab), on same-document `irth:first-launch-choice-resolved`
  // event, and whenever the pathname changes.
  useEffect(() => {
    refreshFirstLaunchChoiceFlag();
    const onSignal = () => refreshFirstLaunchChoiceFlag();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onSignal);
      window.addEventListener("storage", onSignal);
      window.addEventListener("irth:first-launch-choice-resolved", onSignal);
      return () => {
        window.removeEventListener("focus", onSignal);
        window.removeEventListener("storage", onSignal);
        window.removeEventListener("irth:first-launch-choice-resolved", onSignal);
      };
    }
    return undefined;
  }, [pathname]);

  // Auth-dialog bus (shared by IrthAuthDialog + GoogleAuthResultDialog).
  useEffect(() => {
    const cb = (opts: AuthDialogOptions | null) => {
      const open = opts != null;
      setEligibilityFlag("authDialogClosed", !open);
      setEligibilityFlag("googleAuthResultDialogClosed", !open);
    };
    return subscribeAuthDialog(cb);
  }, []);

  // Recovery-mode guard: no subscription API — poll on route change
  // and on a low-frequency interval as a safety net. This is cheap:
  // the poll is a boolean read from a tiny in-memory flag.
  useEffect(() => {
    const publish = () => {
      setEligibilityFlag("recoveryGuardInactive", !isRecoveryMode());
    };
    publish();
    const id = window.setInterval(publish, 1000);
    return () => window.clearInterval(id);
  }, [pathname]);

  return null;
}
