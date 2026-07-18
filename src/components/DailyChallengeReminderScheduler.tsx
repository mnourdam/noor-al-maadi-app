// Mounts once at the root and drives the Smart Daily Challenge
// local-notification schedule (Phase 2c). No visible UI.
//
// Lifecycle triggers:
//   • App boot (mount)
//   • Auth state change (login / logout / user switch)
//   • App resume from background (visibilitychange → visible)
//   • Daily-challenge completion event
//   • Notification preferences updated event (bell menu / settings)
//
// Every trigger simply calls `rescheduleDailyChallenge(reason)` which
// is idempotent: it always cancels the previous single pending entry
// (id 8801) before scheduling the next, so duplicates cannot pile up.

import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  rescheduleDailyChallenge,
  cancelDailyChallenge,
  clearLastMeta,
} from "@/lib/notifications/dailyChallengeScheduler";

const COMPLETION_EVENT = "irth:daily-challenge-completed";
const PREFS_UPDATED_EVENT = "irth:notification-preferences-updated";

export function DailyChallengeReminderScheduler(): null {
  useEffect(() => {
    let cancelled = false;

    const kick = (reason: string) => {
      if (cancelled) return;
      void rescheduleDailyChallenge(reason);
    };

    // Boot.
    kick("boot");

    // Auth transitions — clear the no-repeat memory on sign-out so a
    // new guest / next user starts fresh.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearLastMeta();
        void cancelDailyChallenge("signed_out");
        return;
      }
      kick(`auth:${event}`);
    });

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") kick("visibility");
    };
    const onCompleted = () => kick("challenge_completed");
    const onPrefsUpdated = () => kick("prefs_updated");

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener(COMPLETION_EVENT, onCompleted as EventListener);
      window.addEventListener(PREFS_UPDATED_EVENT, onPrefsUpdated as EventListener);
    }

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener(COMPLETION_EVENT, onCompleted as EventListener);
        window.removeEventListener(PREFS_UPDATED_EVENT, onPrefsUpdated as EventListener);
      }
    };
  }, []);

  return null;
}
