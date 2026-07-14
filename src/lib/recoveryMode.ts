// Password-recovery mode flag.
//
// A Supabase recovery-code exchange (via `exchangeCodeForSession` on a
// recovery link) yields a functionally-normal session. There is no
// server-side "recovery lock" — if we did nothing, the user would be
// signed in and able to browse the entire app before ever changing
// their password. That is the security regression we are closing.
//
// This module exposes a small persistent flag (`localStorage`, survives
// APK reopen / WebView recreation) that:
//   - is set as soon as we detect a recovery callback (before or during
//     the code exchange, and also from a `PASSWORD_RECOVERY` auth event),
//   - forces navigation to `/reset-password` from anywhere else while it
//     is active (see `RecoveryModeGuard`),
//   - is cleared only after a successful `updateUser({ password })` or
//     on `SIGNED_OUT` / an explicit abort.

const KEY = "irth.recovery-mode.v1";

export function setRecoveryMode(active: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (active) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — silent */
  }
}

export function isRecoveryMode(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

// Routes that remain reachable while recovery mode is active. Everything
// else is redirected to `/reset-password`.
export function isRecoveryAllowedPath(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname === "/reset-password") return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  // Public bounce / native hand-off endpoint.
  if (pathname.startsWith("/api/public/native-auth-bounce")) return true;
  return false;
}
