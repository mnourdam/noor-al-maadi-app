// ============================================================
// First Launch Auth Gate
// ------------------------------------------------------------
// On the very first launch (no Supabase session AND no saved
// guest choice) we present the player with three explicit
// options:
//
//   1. اللعب كضيف        — store local choice, dismiss gate
//   2. تسجيل الدخول       — navigate to /auth (signin mode)
//   3. إنشاء حساب         — navigate to /auth?ref=… (signup mode)
//
// Once the player has chosen guest mode OR signed in / signed up,
// the gate never appears again on this device unless localStorage
// is wiped. It also auto-dismisses if a Supabase session appears
// (post sign-in).
// ============================================================

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserRound, LogIn, UserPlus, AlertTriangle } from "lucide-react";
import { useAccount } from "@/lib/account";
import { AuthLink } from "@/components/AuthLink";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { setAuthOrigin } from "@/lib/authOrigin";

const GUEST_CHOICE_KEY = "irth.firstLaunch.choice.v1";

export function FirstLaunchGate() {
  const { user, loadingSession } = useAccount();
  const [open, setOpen] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { return !!window.localStorage.getItem("irth.onboarded.v1"); } catch { return true; }
  });

  // Watch for the onboarding-completed event so we can open right after.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setOnboardingDone(true);
    window.addEventListener("irth:onboarding-completed", handler);
    return () => window.removeEventListener("irth:onboarding-completed", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (loadingSession) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline-first: first launch with no connection must still allow the
      // bundled encyclopedia/campaign/museum snapshot to be browsed.
      try { window.localStorage.setItem(GUEST_CHOICE_KEY, "guest"); } catch { /* */ }
      setOpen(false);
      return;
    }
    if (user) {
      // Signed-in users never see the gate. Also record their choice
      // implicitly so the gate doesn't pop on sign-out.
      try { window.localStorage.setItem(GUEST_CHOICE_KEY, "account"); } catch { /* */ }
      setOpen(false);
      return;
    }
    // Wait until onboarding has finished (or was previously completed) so the
    // very-first-launch experience is: onboarding → auth-choice dialog.
    if (!onboardingDone) {
      setOpen(false);
      return;
    }
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(GUEST_CHOICE_KEY); } catch { /* */ }
    setOpen(!saved);
  }, [user, loadingSession, onboardingDone]);

  if (!open) return null;

  const chooseGuest = () => {
    try { window.localStorage.setItem(GUEST_CHOICE_KEY, "guest"); } catch { /* */ }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-5"
      dir="rtl"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-gold/30 bg-surface p-6 shadow-elegant">
        <div className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] tracking-[0.3em] text-gold">أهلًا بك في إرث</p>
          <h2 className="font-display mt-1 text-2xl font-bold text-foreground">
            ابدأ رحلتك في التاريخ
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            اختر طريقة دخولك للتطبيق. يمكنك دائمًا تسجيل الدخول أو إنشاء حساب لاحقًا من صفحة حسابي.
          </p>

          <div className="mt-5 space-y-2">
            <GoogleSignInButton
              label="المتابعة عبر Google"
              onBeforeRedirect={() => {
                try { window.localStorage.setItem(GUEST_CHOICE_KEY, "account"); } catch { /* */ }
                // Startup gate → after auth, land on the home page.
                setAuthOrigin("/");
              }}
              onError={() => { /* silent — user stays on gate */ }}
            />
            <div className="my-1 flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              <span className="h-px flex-1 bg-white/10" />
              <span>أو</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <AuthLink
              mode="login"
              origin="/"
              onClick={() => {
                try { window.localStorage.setItem(GUEST_CHOICE_KEY, "account"); } catch { /* */ }
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-gold px-4 py-3 text-sm font-bold text-primary-foreground shadow-gold"
            >
              <LogIn className="size-5" />
              <span className="flex-1 text-right">تسجيل الدخول</span>
            </AuthLink>
            <AuthLink
              mode="signup"
              origin="/"
              onClick={() => {
                try { window.localStorage.setItem(GUEST_CHOICE_KEY, "account"); } catch { /* */ }
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-gold/40 bg-surface px-4 py-3 text-sm font-bold text-gold"
            >
              <UserPlus className="size-5" />
              <span className="flex-1 text-right">إنشاء حساب</span>
            </AuthLink>
            <button
              onClick={chooseGuest}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/15 bg-background/40 px-4 py-3 text-sm text-foreground"
            >
              <UserRound className="size-5 text-muted-foreground" />
              <span className="flex-1 text-right">اللعب كضيف</span>
            </button>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-6 text-amber-200">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              في وضع الضيف يُحفظ تقدّمك على هذا الجهاز فقط، وقد يُفقد عند حذف التطبيق أو مسح بيانات المتصفح.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
