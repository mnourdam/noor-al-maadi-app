// Mounts once at the root and drives the Smart Daily Challenge
// local-notification schedule (Phase 2c). No visible UI.
//
// Lifecycle triggers:
//   • App boot (mount)
//   • Auth state change (login / logout / user switch)
//   • App resume from background (visibilitychange → visible)
//   • Daily-challenge completion event
//   • Notification preferences updated event (bell menu / settings)
//   • Local-notification tap (Android)
//
// Every trigger simply calls `rescheduleDailyChallenge(reason)` which
// is idempotent: it always cancels the previous single pending entry
// (id 8801) before scheduling the next, so duplicates cannot pile up.

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  rescheduleDailyChallenge,
  cancelDailyChallenge,
  clearLastMeta,
  DAILY_CHALLENGE_NOTIF_ID,
  DAILY_CHALLENGE_DEEP_LINK,
} from "@/lib/notifications/dailyChallengeScheduler";
import { resolveDeepLink } from "@/lib/notifications/deepLink";

const COMPLETION_EVENT = "irth:daily-challenge-completed";
const PREFS_UPDATED_EVENT = "irth:notification-preferences-updated";

function isNativeAndroid(): boolean {
  try {
    const cap = (globalThis as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "android";
  } catch { return false; }
}

export function DailyChallengeReminderScheduler(): null {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const kick = (reason: string) => {
      if (cancelled) return;
      void rescheduleDailyChallenge(reason);
    };

    // Boot.
    kick("boot");

    // Auth transitions — clear the no-repeat memory on sign-out so the
    // guest / next user starts fresh, and cancel the previous identity's
    // pending schedule BEFORE evaluating the new one.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearLastMeta();
        void cancelDailyChallenge("signed_out").then(() => kick("auth:SIGNED_OUT"));
        return;
      }
      // On sign-in / user switch, cancel the old identity's schedule
      // first, then reschedule under the new identity.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void cancelDailyChallenge(`auth:${event}:pre`).then(() => kick(`auth:${event}`));
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

    // Android — bind the tap listener exactly once and route through the
    // canonical `resolveDeepLink`. We deliberately do NOT create an
    // Android-only navigation path: the same resolver used by the
    // in-app Notification Center decides the destination.
    let removeTapListener: (() => void) | null = null;
    if (isNativeAndroid()) {
      void import("@capacitor/local-notifications").then((mod) => {
        if (cancelled) return;
        const LN = mod.LocalNotifications;
        LN.addListener("localNotificationActionPerformed", (event) => {
          try {
            const n = event?.notification as
              | { id?: number; extra?: Record<string, unknown> }
              | undefined;
            if (!n || n.id !== DAILY_CHALLENGE_NOTIF_ID) return;
            const extra = (n.extra ?? {}) as {
              type?: string;
              category?: string;
              deep_link?: string;
            };
            const target = resolveDeepLink({
              type: extra.type ?? "daily_challenge",
              category: extra.category ?? "daily_reminder",
              deep_link: extra.deep_link ?? DAILY_CHALLENGE_DEEP_LINK,
              payload: null,
            });
            const to = target && target.startsWith("/") ? target : DAILY_CHALLENGE_DEEP_LINK;
            router.navigate({ to, replace: false }).catch(() => {
              if (typeof window !== "undefined") window.location.assign(to);
            });
          } catch { /* swallow — never crash on tap */ }
        }).then((handle) => { removeTapListener = () => { void handle.remove(); }; });
      }).catch(() => { /* plugin unavailable — ignore */ });
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
      if (removeTapListener) removeTapListener();
    };
  }, [router]);

  return null;
}
