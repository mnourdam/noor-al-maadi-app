import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";
import { supabase } from "@/integrations/supabase/client";

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
          ? `${window.location.origin}/reset-password`
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
        title={mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}
        subtitle="احفظ تقدمك على جميع أجهزتك"
      >
        <div className="mb-3">
          <Link to="/profile" className="text-sm text-muted-foreground hover:text-foreground">رجوع</Link>
        </div>

        <div className="rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-lg py-2 text-sm transition ${mode === "signin" ? "bg-gradient-gold text-primary-foreground shadow-gold" : "text-muted-foreground"}`}
            >دخول</button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg py-2 text-sm transition ${mode === "signup" ? "bg-gradient-gold text-primary-foreground shadow-gold" : "text-muted-foreground"}`}
            >حساب جديد</button>
          </div>

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
                ? (mode === "signup" ? "جاري إنشاء الحساب…" : "جاري تسجيل الدخول…")
                : mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            بإنشاء حساب فإنك توافق على مزامنة تقدمك بأمان في السحابة.
          </p>
        </div>
      </Screen>
    </AppShell>
  );
}
