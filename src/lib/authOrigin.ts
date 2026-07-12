// Post-auth redirect destination.
//
// The user's login/signup flow can be triggered from two very different
// places:
//   1. The mandatory startup auth gate (FirstLaunchGate) → land on "/".
//   2. The Account page ("حسابي" = /profile) or any other in-app auth
//      affordance → return to where they came from (usually /profile).
//
// We persist the desired return path in localStorage so it survives
// Google's OAuth redirect, the native Capacitor deep-link bounce, the
// web /auth/callback exchange, and any accidental reload mid-flow.
//
// Only same-origin, absolute internal paths are accepted; external URLs
// and protocol-relative paths ("//evil") are rejected to prevent open
// redirect abuse. The stored value is single-use — reading it also
// clears it so a stale entry cannot hijack a future login.

const KEY = "irth.authOrigin.v1";
const DEFAULT_PATH = "/";

// Known safe internal paths the login flow may legitimately return to.
// A prefix match is used so nested routes (e.g. /profile/edit) are OK.
const ALLOWED_PREFIXES = ["/", "/profile", "/account"];

function isSafePath(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false; // protocol-relative
  if (path.includes("\\")) return false;
  // Only allow known internal roots.
  return ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p === "/" ? "/" : `${p}/`) || path.startsWith(`${p}?`),
  );
}

/** Record where the auth flow was initiated from. Called before navigating
 *  to /auth or before triggering a Google OAuth redirect. */
export function setAuthOrigin(path: string): void {
  try {
    if (typeof window === "undefined") return;
    const safe = isSafePath(path) ? path : DEFAULT_PATH;
    window.localStorage.setItem(KEY, safe);
  } catch {
    /* ignore */
  }
}

/** Read the stored origin without clearing it (used to forward as `next=`
 *  on the OAuth redirect URL). */
export function peekAuthOrigin(): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(KEY);
    return isSafePath(v) ? v : null;
  } catch {
    return null;
  }
}

/** Read + clear. Called once the session is confirmed, right before the
 *  final navigation. Returns a guaranteed safe path (default "/"). */
export function consumeAuthOrigin(fallback: string = DEFAULT_PATH): string {
  let value: string | null = null;
  try {
    if (typeof window !== "undefined") {
      value = window.localStorage.getItem(KEY);
      window.localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
  if (isSafePath(value)) return value;
  return isSafePath(fallback) ? fallback : DEFAULT_PATH;
}

/** Explicitly drop any stored origin (e.g. on sign-out). */
export function clearAuthOrigin(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
