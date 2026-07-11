// Lightweight modal shown once after a Google OAuth sign-in when the
// outcome doesn't match what the user tapped (existing account via
// "signup" button, or brand-new account via "signin" button). Mounted
// globally in __root.tsx; reads the pending result from localStorage on
// mount and clears it after display.

import { useEffect, useState } from "react";
import {
  consumeGoogleAuthResult,
  GOOGLE_AUTH_RESULT_STORAGE_KEY,
  type GoogleAuthResultKind,
} from "@/lib/googleAuthResult";

type Copy = { title: string; body: string };

const COPY: Record<GoogleAuthResultKind, Copy> = {
  existing_signin_via_signup: {
    title: "لديك حساب مسبقًا",
    body: "تم العثور على حسابك، وتم تسجيل الدخول إليه بنجاح.",
  },
  new_signup_via_signin: {
    title: "تم إنشاء حسابك",
    body: "تم إنشاء حساب جديد باستخدام Google، وأصبحت مسجل الدخول الآن.",
  },
};

export function GoogleAuthResultDialog() {
  const [kind, setKind] = useState<GoogleAuthResultKind | null>(null);

  useEffect(() => {
    // Initial read (post-navigation from callback or native deep link).
    setKind(consumeGoogleAuthResult());

    // Cross-tab / late-write pickup (e.g. native flow writes the result
    // immediately before window.location.replace('/profile')).
    const onStorage = (e: StorageEvent) => {
      if (e.key !== GOOGLE_AUTH_RESULT_STORAGE_KEY) return;
      const next = consumeGoogleAuthResult();
      if (next) setKind(next);
    };
    window.addEventListener("storage", onStorage);

    // Same-tab poll for a brief window — storage events don't fire in the
    // same tab that wrote them, and the write may race the mount.
    let tries = 0;
    const iv = window.setInterval(() => {
      tries += 1;
      const next = consumeGoogleAuthResult();
      if (next) {
        setKind(next);
        window.clearInterval(iv);
      } else if (tries >= 10) {
        window.clearInterval(iv);
      }
    }, 300);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(iv);
    };
  }, []);

  if (!kind) return null;
  const copy = COPY[kind];

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-auth-result-title"
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setKind(null)}
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-gold/25 bg-surface p-6 shadow-elegant">
        <h2
          id="google-auth-result-title"
          className="font-display text-lg font-bold text-gold"
        >
          {copy.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {copy.body}
        </p>
        <button
          type="button"
          onClick={() => setKind(null)}
          className="mt-5 w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
        >
          متابعة
        </button>
      </div>
    </div>
  );
}
