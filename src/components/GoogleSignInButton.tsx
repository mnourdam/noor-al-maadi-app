// Reusable "Continue with Google" button.
// - Web: direct Supabase Auth OAuth (custom Google credentials configured in
//   the Supabase provider settings). Redirects to /auth/callback which
//   exchanges the code and lands the user on their intended destination.
// - Android (Capacitor APK): opens Google in a Chrome Custom Tab via the
//   existing native-auth helper. The custom-scheme deep link finishes the
//   PKCE exchange inside the WebView.
//
// This component is the single source of truth for the Google sign-in flow;
// every auth surface (login page, signup page, first-launch gate, modals)
// should render it instead of duplicating logic.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isCapacitorNative, signInWithGoogleNative } from "@/lib/native-auth";
import { setGoogleAuthIntent, type GoogleAuthIntent } from "@/lib/googleAuthResult";
import { peekAuthOrigin } from "@/lib/authOrigin";
import { useAccount } from "@/lib/account";

type Props = {
  /** Same-origin path to return to after successful sign-in (web only). */
  next?: string;
  /** Optional label override. Defaults to "المتابعة عبر Google". */
  label?: string;
  /** Which button the user pressed. Used only to pick the friendly
   * post-auth dialog copy ("account already existed" vs "account created"). */
  intent?: GoogleAuthIntent;
  /** Called after a failed attempt (native error, missing URL, etc.). */
  onError?: (message: string) => void;
  /** Called before opening the browser / redirecting. */
  onBeforeRedirect?: () => void;
  className?: string;
};

export function GoogleSignInButton({
  next,
  label = "المتابعة عبر Google",
  intent,
  onError,
  onBeforeRedirect,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const { isAuthResetting } = useAccount() || { isAuthResetting: false };

  async function handleClick() {
    if (busy || isAuthResetting) return;
    setBusy(true);
    try {

      // Persist the intent so the post-auth dialog (web callback OR native
      // deep link) can compare it against the actual outcome.
      if (intent) setGoogleAuthIntent(intent);

      onBeforeRedirect?.();

      if (isCapacitorNative()) {
        console.info("[native-auth-start]", {
          ts: new Date().toISOString(),
          platform: "android",
          stage: "user-tapped-google",
          hasIntent: Boolean(intent),
        });
        console.info("[google-oauth] branch=NATIVE (Capacitor)");
        // Bounded race so a hung native bridge (e.g. a stalled Preferences
        // call) can never leave the button spinning forever.
        const timeoutMs = 12000;
        const nativeCall = signInWithGoogleNative();
        const timeoutSentinel = new Promise<{ ok: false; error: string; timedOut: true }>((resolve) => {
          setTimeout(() => resolve({ ok: false, error: "timeout", timedOut: true }), timeoutMs);
        });
        const r = await Promise.race([nativeCall, timeoutSentinel]);
        if (!r.ok) {
          const msg =
            "timedOut" in r
              ? "استغرقت العملية وقتاً طويلاً. أعد المحاولة."
              : r.error ?? "تعذر تسجيل الدخول عبر Google.";
          onError?.(msg);
        }
        return;
      }


      // Web flow — direct Supabase Google OAuth (custom credentials).
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const stored = peekAuthOrigin();
      const candidate = next ?? stored ?? "/";
      const safeNext =
        candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      console.info("[google-oauth] branch=WEB redirectTo=", redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        console.error("[google-oauth] init failed", error.message);
        onError?.(error.message || "تعذر بدء تسجيل الدخول عبر Google.");
      }
      // On success, the browser navigates to Google; nothing more to do.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[google-oauth] unexpected", msg);
      onError?.(msg || "حدث خطأ غير متوقع أثناء تسجيل الدخول عبر Google.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || isAuthResetting}
      dir="rtl"
      className={
        className ??
        "flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-white/95 disabled:opacity-60"
      }
      aria-label={label}
    >
      <GoogleGlyph className="size-5 shrink-0" />
      <span>{busy ? "جاري التحويل…" : label}</span>
    </button>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.3 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.7l6.3 5.2C41 34.6 44 29.7 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
