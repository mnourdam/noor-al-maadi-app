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
import { hasCompleted as openingCompleted } from "@/lib/cinematic-opening/persistence";
import { subscribeAuthDialog, type AuthDialogOptions } from "@/lib/authDialog";
import { useAccount } from "@/lib/account";
import { isRecoveryMode } from "@/lib/recoveryMode";

import {
  refreshFirstLaunchChoiceFlag,
  setEligibilityFlag,
} from "./eligibility";

const OPENING_VERSION_FALLBACK = "1";

export function TutorialFlagPublishers() {
  const { loadingSession } = useAccount();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Session-ready flag.
  useEffect(() => {
    setEligibilityFlag("sessionReady", !loadingSession);
  }, [loadingSession]);

  // Opening-completed event: fires when the cinematic dispatches its
  // completion event, AND flips true when the opening's persistence
  // reports the current version already completed (returning users).
  useEffect(() => {
    const setDone = () => {
      setEligibilityFlag("openingCompletedEvent", true);
      setEligibilityFlag("cinematicUnmounted", true);
    };
    // Returning users: opening never actually mounts.
    try {
      if (openingCompleted(OPENING_VERSION_FALLBACK)) setDone();
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.addEventListener(OPENING_COMPLETED_EVENT, setDone);
      return () =>
        window.removeEventListener(OPENING_COMPLETED_EVENT, setDone);
    }
    return undefined;
  }, []);

  // First-launch choice: refresh on mount, on focus, on storage, and
  // whenever the pathname changes (choice may have just been made).
  useEffect(() => {
    refreshFirstLaunchChoiceFlag();
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
