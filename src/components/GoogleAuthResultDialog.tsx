// Post-Google-OAuth notice. Uses the shared branded IrthAuthDialog
// (openAuthDialog) so all auth notices share one visual identity.
//
// The result is written to localStorage by the OAuth completion paths
// (web callback + native deep link) via stashGoogleAuthResult, then
// consumed here on mount. Handles same-tab writes, late writes, and
// cross-tab writes.

import { useEffect } from "react";
import {
  consumeGoogleAuthResult,
  GOOGLE_AUTH_RESULT_STORAGE_KEY,
  type GoogleAuthResultKind,
} from "@/lib/googleAuthResult";
import { openAuthDialog, closeAuthDialog } from "@/lib/authDialog";

type Copy = { title: string; body: string; primary: string; id: string };

const COPY: Record<GoogleAuthResultKind, Copy> = {
  existing_signin_via_signup: {
    id: "google-existing-account",
    title: "لديك حساب مسبقًا",
    body: "تم تسجيل دخولك مباشرة إلى حسابك لأن هذا البريد الإلكتروني مسجل بالفعل في إرث.",
    primary: "متابعة",
  },
  new_signup_via_signin: {
    id: "google-account-created",
    title: "تم إنشاء حسابك",
    body: "مرحبًا بك في إرث.\nتم إنشاء حسابك بنجاح، ويمكنك الآن بدء رحلتك التاريخية.",
    primary: "ابدأ الرحلة",
  },
};

function present(kind: GoogleAuthResultKind) {
  const c = COPY[kind];
  openAuthDialog({
    id: c.id,
    tone: kind === "new_signup_via_signin" ? "success" : "info",
    title: c.title,
    body: c.body,
    primary: { label: c.primary, onClick: () => closeAuthDialog() },
  });
}

export function GoogleAuthResultDialog() {
  useEffect(() => {
    const initial = consumeGoogleAuthResult();
    if (initial) present(initial);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== GOOGLE_AUTH_RESULT_STORAGE_KEY) return;
      const next = consumeGoogleAuthResult();
      if (next) present(next);
    };
    window.addEventListener("storage", onStorage);

    // Same-tab poll — storage events don't fire in the tab that wrote them,
    // and the write may race the mount (native deep link path).
    let tries = 0;
    const iv = window.setInterval(() => {
      tries += 1;
      const next = consumeGoogleAuthResult();
      if (next) {
        present(next);
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

  return null;
}
