import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  isRecoveryAllowedPath,
  isRecoveryMode,
  setRecoveryMode,
} from "@/lib/recoveryMode";

/**
 * Root-level guard for password-recovery mode.
 *
 * While a recovery session is active (the user tapped a recovery email
 * link but has NOT yet chosen a new password), block every route except
 * `/reset-password` and the `/auth*` surfaces (so an expired-link retry
 * still works). The flag survives APK reopen; it is cleared only after
 * a successful password update or on sign-out.
 */
export function RecoveryModeGuard() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Supabase fires `PASSWORD_RECOVERY` after a recovery-code exchange (or
  // when the client detects recovery tokens in the URL). Set the flag as
  // soon as we see it; `SIGNED_OUT` clears it defensively.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      } else if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Whenever the route changes, enforce the redirect.
  useEffect(() => {
    if (!isRecoveryMode()) return;
    if (isRecoveryAllowedPath(pathname)) return;
    navigate({ to: "/reset-password", replace: true }).catch(() => {
      /* best-effort */
    });
  }, [pathname, navigate]);

  return null;
}
