import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";
// Google native sign-in helper preserved at "@/lib/native-auth" for future LC re-enable.
import { PasswordField } from "@/components/ui/PasswordField";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { consumeAuthOrigin } from "@/lib/authOrigin";
import { consumeOAuthError } from "@/lib/googleAuthResult";

// BUILD_TYPE import removed with the auth diagnostics button.
import { openAuthDialog, maskEmail } from "@/lib/authDialog";

type ResendKind = "signup" | "recovery";
type Mode = "signin" | "signup" | "forgot";


import { evaluatePassword, checkHibp, isWeakPasswordError, WEAK_PASSWORD_COPY, type HibpResult } from "@/lib/passwordPolicy";

/** Map raw auth-provider errors to friendly Arabic dialog copy. */
function classifyAuthError(msg: string, mode: Mode): { title: string; body: string; retry?: boolean; toLogin?: boolean } {
  const m = (msg || "").toLowerCase();
  if (m.includes("already") && m.includes("registered")) {
    return { title: "الحساب موجود بالفعل", body: "هذا البريد مسجّل مسبقاً في إرث. يمكنك تسجيل الدخول باستخدامه أو استعادة كلمة المرور.", toLogin: true };
  }
  if (isWeakPasswordError(msg)) {
    return { title: WEAK_PASSWORD_COPY.title, body: WEAK_PASSWORD_COPY.body, retry: true };
  }
  if (m.includes("invalid") && m.includes("credent")) {
    return { title: "بيانات الدخول غير صحيحة", body: "تأكد من البريد وكلمة المرور ثم حاول مجدداً.", retry: true };
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("offline")) {
    return { title: "تعذّر الاتصال", body: "تحقّق من اتصال الإنترنت ثم أعد المحاولة.", retry: true };
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("429")) {
    return { title: "الرجاء الانتظار قليلاً", body: "تم إرسال عدد كبير من المحاولات. انتظر دقيقة ثم أعد المحاولة." };
  }
  return {
    title: mode === "signup" ? "تعذّر إنشاء الحساب" : mode === "forgot" ? "تعذّر إرسال رابط الاستعادة" : "تعذّر تسجيل الدخول",
    body: "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
    retry: true,
  };
}

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول" }] }),
  validateSearch: (_s: Record<string, unknown>): Record<string, never> => ({}),
  // Phase 2 (Referrals removal): `?ref=CODE` was retired. Legacy links that
  // still include it land on the sign-in view; the value is ignored.
  component: AuthPage,
});




function AuthPage() {
  const navigate = useNavigate();
  Route.useSearch();
  const { signIn, signUp, user } = useAccount();
  // Phase 2 (Referrals removal): default to signin; `?ref=` was retired.
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [hibp, setHibp] = useState<HibpResult | null>(null);
  const [hibpPending, setHibpPending] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  // referralRef removed in Phase 2 (Referrals removal).

  const sync = useMemo(() => evaluatePassword(passwordValue), [passwordValue]);
  useEffect(() => {
    if (mode !== "signup") { setHibp(null); setHibpPending(false); return; }
    setHibp(null);
    if (!sync.syncOk) { setHibpPending(false); return; }
    const controller = new AbortController();
    setHibpPending(true);
    const t = setTimeout(() => {
      checkHibp(passwordValue, controller.signal)
        .then((r) => setHibp(r))
        .catch(() => setHibp({ status: "skipped", reason: "error" }))
        .finally(() => setHibpPending(false));
    }, 350);
    return () => { controller.abort(); clearTimeout(t); setHibpPending(false); };
  }, [passwordValue, sync.syncOk, mode]);

  const hibpBlocked = hibp?.status === "pwned";
  const signupPolicyOk = sync.syncOk && !hibpBlocked && !hibpPending;
  const signupProblems = hibpBlocked
    ? [...sync.problems, "هذه الكلمة ظهرت في تسريبات معروفة — اختر كلمة مختلفة"]
    : sync.problems;

  useEffect(() => {
    if (user) {
      const dest = consumeAuthOrigin("/profile");
      navigate({ to: dest as "/profile" });
    }
  }, [user, navigate]);

  // Surface a branded Irth dialog if the native Google OAuth flow bounced
  // back here after failing to complete the PKCE exchange.
  useEffect(() => {
    let flagged = false;
    let errorDetails = null;

    try {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.get("oauth_error") === "1") flagged = true;
        
        // Use the new structured error store
        errorDetails = consumeOAuthError();
        if (errorDetails) flagged = true;

        if (window.sessionStorage.getItem("irth.oauth_error.v1") === "1") {
          flagged = true;
          window.sessionStorage.removeItem("irth.oauth_error.v1");
        }
        
        if (flagged) {
          url.searchParams.delete("oauth_error");
          window.history.replaceState(null, "", url.toString());
        }
      }
    } catch { /* ignore */ }

    if (flagged) {
      const reason = errorDetails?.reason || "UNKNOWN";
      
      // Never show "Google login failed" if session established but we just timed out on UI sync
      if (reason === "TIMEOUT_WITH_VALID_SESSION" || reason === "POST_LOGIN_SYNC_FAILED") {
        console.info("[auth-page] ignoring false-failure diagnostic:", reason);
        return;
      }

      if (reason === "USER_CANCELLED") {
        console.info("[auth-page] user cancelled Google picker — silent");
        return;
      }

      openAuthDialog({
        id: "google-oauth-bounce",
        tone: "error",
        title: "تعذّر تسجيل الدخول عبر Google",
        body: errorDetails?.message || "لم نتمكن من إكمال تسجيل الدخول عبر Google. تحقّق من اتصال الإنترنت ثم حاول مجدداً.",
        primary: { label: "إعادة المحاولة" },
      });
    }
  }, []);


  async function requestResend(kind: ResendKind, email: string) {
    const authEmailMode = ((import.meta.env.VITE_AUTH_EMAIL_MODE as string | undefined) ?? "custom").toLowerCase();
    try {
      if (kind === "recovery") {
        if (authEmailMode === "custom") {
          const { requestPasswordResetEmail } = await import("@/lib/auth-emails");
          await requestPasswordResetEmail(email);
        } else {
          const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback?type=recovery` : undefined;
          await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        }
      } else {
        const { data, error: rerr } = await supabase.auth.resend({ type: "signup", email });
        void data;
        if (rerr) throw rerr;
      }
      openAuthDialog({
        id: `resent-${kind}-${email}`,
        tone: "success",
        title: "تم إرسال الرابط",
        body: "أرسلنا رابطاً جديداً إلى بريدك الإلكتروني. تحقّق من صندوق الوارد.",
        detail: maskEmail(email),
        primary: { label: "حسنًا" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cls = classifyAuthError(msg, "forgot");
      openAuthDialog({
        id: `resend-error-${Date.now()}`,
        tone: "error",
        title: cls.title,
        body: cls.body,
        primary: { label: "إعادة المحاولة", onClick: () => void requestResend(kind, email), keepOpen: true },
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);

    const email = (emailRef.current?.value ?? "").trim();
    const password = passwordRef.current?.value ?? "";
    const username = (usernameRef.current?.value ?? "").trim();
    // referral code capture removed in Phase 2

    try {
      if (mode === "forgot") {
        if (!email) { setError("أدخل بريدك الإلكتروني"); return; }
        const authEmailMode = ((import.meta.env.VITE_AUTH_EMAIL_MODE as string | undefined) ?? "custom").toLowerCase();
        try {
          if (authEmailMode === "custom") {
            const { requestPasswordResetEmail } = await import("@/lib/auth-emails");
            await requestPasswordResetEmail(email);
          } else {
            const redirectTo = typeof window !== "undefined"
              ? `${window.location.origin}/auth/callback?type=recovery`
              : undefined;
            const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
            if (resetErr) throw resetErr;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const cls = classifyAuthError(msg, "forgot");
          openAuthDialog({
            id: `forgot-error-${Date.now()}`,
            tone: "error",
            title: cls.title,
            body: cls.body,
            primary: { label: "إعادة المحاولة" },
          });
          return;
        }
        openAuthDialog({
          id: `recovery-sent-${email}`,
          tone: "success",
          title: "أرسلنا رابط الاستعادة",
          body: "تحقّق من بريدك الإلكتروني واضغط رابط الاستعادة لتعيين كلمة مرور جديدة.",
          detail: maskEmail(email),
          primary: { label: "حسنًا" },
          secondary: { label: "إعادة إرسال الرابط", onClick: () => void requestResend("recovery", email), keepOpen: true },
        });
        return;
      }
      let r: { ok: boolean; error?: string };
      if (mode === "signup") {
        // Canonical policy gate — mirrors reset-password and server rules.
        if (!signupPolicyOk) {
          openAuthDialog({
            id: `signup-weak-${Date.now()}`,
            tone: "error",
            title: WEAK_PASSWORD_COPY.title,
            body: WEAK_PASSWORD_COPY.body,
            primary: { label: "حسنًا" },
          });
          return;
        }
        r = await signUp({ email, password, username, displayName: username });
      } else {
        r = await signIn(email, password);
      }
      if (!r.ok) {
        const cls = classifyAuthError(r.error ?? "", mode);
        openAuthDialog({
          id: `auth-error-${Date.now()}`,
          tone: "error",
          title: cls.title,
          body: cls.body,
          primary: { label: cls.retry ? "إعادة المحاولة" : "حسنًا" },
          secondary: cls.toLogin ? { label: "العودة لتسجيل الدخول", onClick: () => setMode("signin") } : undefined,
        });
        return;
      }
      // Signup with email confirmation required — r.error carries the info string.
      if (mode === "signup" && r.error) {
        openAuthDialog({
          id: `signup-sent-${email}`,
          tone: "info",
          title: "تحقق من بريدك الإلكتروني",
          body: "أرسلنا رابط التحقق إلى بريدك الإلكتروني. افتح الرسالة واضغط رابط التأكيد لإكمال إنشاء حسابك.",
          detail: maskEmail(email),
          primary: { label: "حسنًا" },
          secondary: { label: "إعادة إرسال الرابط", onClick: () => void requestResend("signup", email), keepOpen: true },
        });
        return;
      }
      const dest = consumeAuthOrigin("/profile");
      navigate({ to: dest as "/profile" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cls = classifyAuthError(msg, mode);
      openAuthDialog({
        id: `auth-throw-${Date.now()}`,
        tone: "error",
        title: cls.title,
        body: cls.body,
        primary: { label: "إعادة المحاولة" },
      });
    } finally {
      setBusy(false);
    }
  }



  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: 16,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(0,0,0,0.35)",
    color: "white",
    outline: "none",
  };

  return (
    <AppShell>
      <Screen
        title={mode === "signup" ? "إنشاء حساب" : mode === "forgot" ? "استعادة كلمة المرور" : "تسجيل الدخول"}
        subtitle={mode === "forgot" ? "سنرسل رابط إعادة التعيين إلى بريدك" : "احفظ تقدمك على جميع أجهزتك"}
      >
        <div className="mb-3">
          <Link to="/profile" className="text-sm text-muted-foreground hover:text-foreground">رجوع</Link>
        </div>

        <div className="rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          {mode !== "forgot" && (
            <>
              <GoogleSignInButton
                label={mode === "signup" ? "إنشاء حساب عبر Google" : "تسجيل الدخول عبر Google"}
                intent={mode === "signup" ? "signup" : "signin"}
                onError={(m) => { setError(m); setInfo(null); }}
                onBeforeRedirect={() => { setError(null); setInfo(null); }}
              />
              <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <span className="h-px flex-1 bg-white/10" />
                <span>أو</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}




          {mode !== "forgot" && (
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 p-1">
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className={`rounded-lg py-2 text-sm transition ${mode === "signin" ? "bg-gradient-gold text-primary-foreground shadow-gold" : "text-muted-foreground"}`}
              >دخول</button>
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
                className={`rounded-lg py-2 text-sm transition ${mode === "signup" ? "bg-gradient-gold text-primary-foreground shadow-gold" : "text-muted-foreground"}`}
              >حساب جديد</button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-3" autoComplete="on">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">اسم المستخدم</span>
                <input
                  ref={usernameRef}
                  type="text"
                  name="username"
                  defaultValue=""
                  required
                  minLength={3}
                  maxLength={30}
                  autoComplete="username"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  style={inputStyle}
                  placeholder="مثال: صلاح_الدين"
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">البريد الإلكتروني</span>
              <input
                ref={emailRef}
                type="email"
                name="email"
                required
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                style={inputStyle}
                placeholder="you@example.com"
              />
            </label>
            {mode !== "forgot" && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">كلمة المرور</span>
                <PasswordField
                  ref={passwordRef}
                  name="password"
                  required
                  minLength={mode === "signup" ? 8 : 6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  style={inputStyle}
                  placeholder={mode === "signup" ? "٨ أحرف على الأقل" : "٦ أحرف على الأقل"}
                  value={mode === "signup" ? passwordValue : undefined}
                  onChange={mode === "signup" ? (e) => setPasswordValue(e.target.value) : undefined}
                />
                {mode === "signup" && passwordValue.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>قوة كلمة المرور</span>
                      <span>
                        {hibpPending
                          ? "جاري التحقق…"
                          : hibpBlocked
                            ? "مسرّبة"
                            : ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"][sync.score]}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full transition-all ${
                          hibpBlocked
                            ? "bg-rose-500"
                            : ["bg-rose-500", "bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"][sync.score]
                        }`}
                        style={{ width: `${(sync.score / 4) * 100}%` }}
                      />
                    </div>
                    {signupProblems.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/80">
                        {signupProblems.map((p: string) => (
                          <li key={p}>• {p.startsWith("هذه") ? p : `يجب أن تحتوي على ${p}`}</li>
                        ))}
                      </ul>
                    )}
                    {sync.syncOk && !hibpPending && hibp?.status === "skipped" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        تعذر التحقق من تسرب كلمة المرور حالياً.
                      </p>
                    )}
                  </div>
                )}
                {mode === "signup" && passwordValue.length === 0 && (
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                    استخدم ٨ أحرف على الأقل مع مزج أحرف كبيرة وصغيرة وأرقام، وتجنّب الكلمات الشائعة أو المسرّبة.
                  </span>
                )}
              </label>
            )}
            {/* Phase 2 (Referrals removal): the optional referral code
                input was removed. No referral surface remains on signup. */}

            {error && <p className="text-xs text-rose-300">{error}</p>}
            {info && <p className="text-xs text-emerald-300">{info}</p>}

            <button
              type="submit"
              disabled={busy || (mode === "signup" && (!signupPolicyOk || passwordValue.length === 0))}
              className="w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-60"
            >
              {busy
                ? (mode === "signup" ? "جاري إنشاء الحساب…" : mode === "forgot" ? "جاري الإرسال…" : "جاري تسجيل الدخول…")
                : mode === "signup" ? "إنشاء الحساب" : mode === "forgot" ? "إرسال رابط الاستعادة" : "تسجيل الدخول"}
            </button>

            {mode === "signin" && (
              <button
                type="button"
                onClick={() => { setMode("forgot"); setError(null); setInfo(null); }}
                className="block w-full text-center text-[12px] text-gold hover:underline"
              >
                هل نسيت كلمة المرور؟
              </button>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
                className="block w-full text-center text-[12px] text-muted-foreground hover:text-foreground"
              >
                العودة لتسجيل الدخول
              </button>
            )}
          </form>


          {/* Auth diagnostics button removed from user-facing screen.
              The /admin/native-auth-diagnostics route remains reachable
              directly for debug/admin builds. */}


          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            بإنشاء حساب فإنك توافق على مزامنة تقدمك بأمان في السحابة.
          </p>
        </div>
      </Screen>
    </AppShell>
  );
}
