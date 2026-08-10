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
  | "new_signup_via_signin"
  | "identity_linked"
  | "existing_account_signin";

const INTENT_KEY = "irth.google_auth_intent.v1";
const RESULT_KEY = "irth.google_auth_result.v1";
const ERROR_KEY = "irth.oauth_error_details.v1";

export type OAuthErrorReason = 
  | "USER_CANCELLED"
  | "OAUTH_EXCHANGE_FAILED"
  | "SESSION_NOT_ESTABLISHED"
  | "POST_LOGIN_SYNC_FAILED"
  | "TIMEOUT_WITH_VALID_SESSION"
  | "UNKNOWN";

export interface OAuthErrorDetails {
  reason: OAuthErrorReason;
  message?: string;
  ts: number;
}


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
  // Case 1: tapped signup but the account already existed → friendly notice.
  if (intent === "signup" && !isNew) return "existing_signin_via_signup";
  // Case 2 (signin + new) and Case 4 (signup + new): show "account created".
  if (isNew) return "new_signup_via_signin";
  // Case 3: signin + existing → no dialog, silent continue.
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
    if (
      v === "existing_signin_via_signup" ||
      v === "new_signup_via_signin" ||
      v === "identity_linked" ||
      v === "existing_account_signin"
    ) {
      s.removeItem(RESULT_KEY);
      return v;
    }
  } catch { /* ignore */ }
  return null;
}

export const GOOGLE_AUTH_RESULT_STORAGE_KEY = RESULT_KEY;

/**
 * After a successful Google OAuth exchange, decide which branded dialog to
 * show and audit the identity link idempotently.
 *
 * Rules:
 * - If Supabase auto-linked Google onto a pre-existing email/password
 *   account (i.e. the RPC reports `first_time_link: true`), show
 *   "تم ربط حسابك" — this happens at most once per (user, provider).
 * - If the user already has multiple identities but we've audited before,
 *   show "لديك حساب مسبقًا" (silent-continue for repeat Google sign-ins is
 *   also acceptable; we prefer explicit reassurance on APK).
 * - If the user is brand new (isNewlyCreatedUser), fall back to the
 *   existing intent-based dialog (created / existing-via-signup).
 * - On RPC failure, degrade to the intent-based logic; never crash.
 */
export async function resolveGoogleAuthResult(args: {
  user: import("@supabase/supabase-js").User | null | undefined;
  intent: GoogleAuthIntent | null;
  supabase: import("@supabase/supabase-js").SupabaseClient;
}): Promise<GoogleAuthResultKind | null> {
  const { user, intent, supabase } = args;
  if (!user) return null;

  const providers = Array.isArray(user.identities)
    ? user.identities.map((i) => i.provider).filter(Boolean)
    : [];
  const hasMultipleProviders = new Set(providers).size >= 2;
  const isNew = isNewlyCreatedUser(user);

  // Brand-new account (single-identity signup) → keep the existing UX.
  if (isNew && !hasMultipleProviders) {
    return computeGoogleAuthResult(user, intent);
  }

  // Attempt idempotent audit + first-time detection.
  try {
    const { data, error } = await supabase.rpc("record_identity_link", {
      p_provider: "google",
    });
    if (!error && data && typeof data === "object") {
      const firstTime = (data as { first_time_link?: boolean }).first_time_link === true;
      if (firstTime) return "identity_linked";
      // Audited before, multi-provider user → this is a repeat Google sign-in.
      if (hasMultipleProviders) return "existing_account_signin";
    }
  } catch { /* ignore — fall through to intent-based logic */ }

  return computeGoogleAuthResult(user, intent);
}

