// Cross-flow helpers for the "friendly Google sign-in outcome" dialog.
//
// Both Google buttons (تسجيل الدخول عبر Google / إنشاء حساب عبر Google) run
// the exact same OAuth flow. The only difference the user perceives is a
// small dialog shown *after* the session is established, when the outcome
// doesn't match what they tapped:
//
//   - tapped "signup" but the account already existed → "لديك حساب مسبقًا"
//   - tapped "signin" but no account existed yet      → "تم إنشاء حسابك"
//
// The intent is stored in localStorage before the OAuth redirect so it
// survives the full round-trip (web callback OR native deep link). The
// result is written after the exchange and consumed by a global dialog
// mounted at the root.

import type { User } from "@supabase/supabase-js";

export type GoogleAuthIntent = "signin" | "signup";
export type GoogleAuthResultKind =
  | "existing_signin_via_signup"
  | "new_signup_via_signin";

const INTENT_KEY = "irth.google_auth_intent.v1";
const RESULT_KEY = "irth.google_auth_result.v1";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function setGoogleAuthIntent(intent: GoogleAuthIntent): void {
  const s = safeStorage();
  if (!s) return;
  try { s.setItem(INTENT_KEY, intent); } catch { /* ignore */ }
}

export function getAndClearGoogleAuthIntent(): GoogleAuthIntent | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const v = s.getItem(INTENT_KEY);
    if (v === "signin" || v === "signup") {
      s.removeItem(INTENT_KEY);
      return v;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * A Supabase user is considered brand-new when created_at and
 * last_sign_in_at are effectively the same (created during this OAuth
 * exchange). We allow a 10s window to absorb clock skew between the
 * provider and Supabase.
 */
export function isNewlyCreatedUser(user: User | null | undefined): boolean {
  if (!user?.created_at) return false;
  const created = new Date(user.created_at).getTime();
  const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : created;
  if (!Number.isFinite(created) || !Number.isFinite(last)) return false;
  return Math.abs(last - created) < 10_000;
}

export function computeGoogleAuthResult(
  user: User | null | undefined,
  intent: GoogleAuthIntent | null,
): GoogleAuthResultKind | null {
  if (!user || !intent) return null;
  const isNew = isNewlyCreatedUser(user);
  if (intent === "signup" && !isNew) return "existing_signin_via_signup";
  if (intent === "signin" && isNew) return "new_signup_via_signin";
  return null;
}

export function stashGoogleAuthResult(kind: GoogleAuthResultKind | null): void {
  const s = safeStorage();
  if (!s) return;
  try {
    if (kind) s.setItem(RESULT_KEY, kind);
    else s.removeItem(RESULT_KEY);
  } catch { /* ignore */ }
}

export function consumeGoogleAuthResult(): GoogleAuthResultKind | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const v = s.getItem(RESULT_KEY);
    if (v === "existing_signin_via_signup" || v === "new_signup_via_signin") {
      s.removeItem(RESULT_KEY);
      return v;
    }
  } catch { /* ignore */ }
  return null;
}

export const GOOGLE_AUTH_RESULT_STORAGE_KEY = RESULT_KEY;
