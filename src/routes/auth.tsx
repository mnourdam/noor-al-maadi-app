import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { isCapacitorNative, signInWithGoogleNative } from "@/lib/native-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s.ref === "string" ? s.ref : undefined }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";


function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { signIn, signUp, user } = useAccount();
  const [mode, setMode] = useState<Mode>(search.ref ? "signup" : "signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const referralRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) navigate({ to: "/profile" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setInfo(null);
    setBusy(true);

    const email = (emailRef.current?.value ?? "").trim();
    const password = passwordRef.current?.value ?? "";
    const username = (usernameRef.current?.value ?? "").trim();
    const referral = (referralRef.current?.value ?? "").trim().toUpperCase();

    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setError("لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مجدداً.");
        return;
      }
      if (mode === "forgot") {
        if (!email) { setError("أدخل بريدك الإلكتروني"); return; }
        const redirectTo = typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?type=recovery`
          : undefined;
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (resetErr) { setError(resetErr.message); return; }
        setInfo("أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك. تحقّق من صندوق الوارد ومجلد الرسائل غير المرغوب فيها.");
        return;
      }
      let r: { ok: boolean; error?: string };
      if (mode === "signup") {
        r = await signUp({ email, password, username, displayName: username, referralCode: referral || undefined });
      } else {
        r = await signIn(email, password);
      }
      if (!r.ok) {
        setError(r.error ?? (mode === "signup" ? "تعذر إنشاء الحساب" : "تعذر تسجيل الدخول"));
        return;
      }
      if (mode === "signup" && r.error) { setInfo(r.error); return; }
      navigate({ to: "/profile" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "حدث خطأ غير متوقع.");
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
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (busy) return;
                  setError(null); setInfo(null); setBusy(true);
                  try {
                    const redirect_uri = typeof window !== "undefined"
                      ? `${window.location.origin}/auth/callback`
                      : undefined;
                    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri });
                    if (result.error) {
                      setError(result.error instanceof Error ? result.error.message : "تعذر تسجيل الدخول عبر Google");
                      return;
                    }
                    if (result.redirected) return;
                    navigate({ to: "/profile" });
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "تعذر تسجيل الدخول عبر Google");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mb-3 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white py-3 text-sm font-bold text-[#1f1f1f] shadow-sm transition hover:bg-white/90 disabled:opacity-60"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.232c1.891-1.742 2.981-4.305 2.981-7.351Z"/>
                  <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.619-2.422l-3.232-2.51c-.896.6-2.041.955-3.387.955-2.605 0-4.81-1.76-5.597-4.124H3.064v2.59A9.997 9.997 0 0 0 12 22Z"/>
                  <path fill="#FBBC05" d="M6.403 13.899A6.006 6.006 0 0 1 6.09 12c0-.66.114-1.302.314-1.899V7.51H3.064A9.997 9.997 0 0 0 2 12c0 1.614.386 3.14 1.064 4.49l3.339-2.591Z"/>
                  <path fill="#EA4335" d="M12 5.977c1.469 0 2.787.505 3.823 1.496l2.868-2.868C16.96 2.99 14.696 2 12 2A9.997 9.997 0 0 0 3.064 7.51L6.403 10.1C7.19 7.737 9.395 5.977 12 5.977Z"/>
                </svg>
                <span>المتابعة باستخدام Google</span>
              </button>
              <div className="my-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <div className="h-px flex-1 bg-white/10" />
                <span>أو</span>
                <div className="h-px flex-1 bg-white/10" />
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
                  defaultValue={search.ref ? "" : ""}
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
                <input
                  ref={passwordRef}
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  style={inputStyle}
                  placeholder="6 أحرف على الأقل"
                />
              </label>
            )}
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">رمز الإحالة (اختياري)</span>
                <input
                  ref={referralRef}
                  type="text"
                  name="referral"
                  defaultValue={search.ref ?? ""}
                  maxLength={20}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={inputStyle}
                  placeholder="IRTH-XXXXXX"
                />
              </label>
            )}

            {error && <p className="text-xs text-rose-300">{error}</p>}
            {info && <p className="text-xs text-emerald-300">{info}</p>}

            <button
              type="submit"
              disabled={busy}
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


          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            بإنشاء حساب فإنك توافق على مزامنة تقدمك بأمان في السحابة.
          </p>
        </div>
      </Screen>
    </AppShell>
  );
}
