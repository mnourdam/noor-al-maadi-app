import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, Lock, UserRound, ChevronLeft, Gift, Eye, EyeOff } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell, Screen } from "@/components/AppShell";
import { useAccount } from "@/lib/account";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ ref: typeof s.ref === "string" ? s.ref : undefined }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { signIn, signUp, user } = useAccount();
  const [mode, setMode] = useState<Mode>(search.ref ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [referralCode, setReferralCode] = useState(search.ref ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => { if (search.ref) setReferralCode(search.ref); }, [search.ref]);

  // Email verification redirect — Supabase appends `#access_token=...&type=signup`
  // and the client auto-detects the session. We just surface a friendly toast
  // and let the auth listener handle the navigation below.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    if (hash.includes("type=signup") || hash.includes("type=recovery") || hash.includes("type=magiclink")) {
      setInfo("تم تأكيد البريد الإلكتروني بنجاح. جارٍ تسجيل الدخول…");
      // Clean the URL so a refresh doesn't keep showing the message.
      try { window.history.replaceState({}, "", window.location.pathname + window.location.search); } catch { /* ignore */ }
    }
  }, []);

  // Already signed in → kick to profile (covers both manual login and the
  // post-verification auto sign-in).
  useEffect(() => {
    if (user) navigate({ to: "/profile" });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        // PR6: mirror the server-side normalization (`upper(trim(...))`)
        // exactly so client validation never disagrees with the RPC.
        const normalizedReferral = referralCode.trim().toUpperCase();
        const r = await signUp({
          email,
          password,
          username,
          displayName: username,
          referralCode: normalizedReferral || undefined,
        });
        if (!r.ok) { setError(r.error ?? "تعذر إنشاء الحساب"); return; }
        if (r.error) { setInfo(r.error); return; } // verify email message
        navigate({ to: "/profile" });
      } else {
        const r = await signIn(email, password);
        if (!r.ok) { setError(r.error ?? "تعذر تسجيل الدخول"); return; }
        navigate({ to: "/profile" });
      }
    } finally {
      setBusy(false);
    }
  }


  return (
    <AppShell>
      <Screen
        title={mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}
        subtitle="احفظ تقدمك على جميع أجهزتك"
      >
        <div className="mb-3">
          <Link to="/profile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> رجوع
          </Link>
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

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field icon={<UserRound className="size-4" />} label="اسم المستخدم">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={30}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="مثال: صلاح_الدين"
                />
              </Field>
            )}
            <Field icon={<Mail className="size-4" />} label="البريد الإلكتروني">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="you@example.com"
              />
            </Field>
            <Field icon={<Lock className="size-4" />} label="كلمة المرور">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="6 أحرف على الأقل"
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                aria-label={showPwd ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="text-muted-foreground hover:text-gold"
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </Field>
            {mode === "signup" && (
              <Field icon={<Gift className="size-4" />} label="رمز الإحالة (اختياري)">
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.replace(/\s+/g, "").toUpperCase())}
                  onBlur={(e) => setReferralCode(e.target.value.trim().toUpperCase())}
                  maxLength={20}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="IRTH-XXXXXX"
                />
              </Field>
            )}

            {error && <p className="text-xs text-rose-300">{error}</p>}
            {info && <p className="text-xs text-emerald-300">{info}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-60"
            >
              {busy ? "..." : mode === "signup" ? "إنشاء الحساب" : "تسجيل الدخول"}
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            بإنشاء حساب فإنك توافق على مزامنة تقدمك بأمان في السحابة. سندعم Google قريباً.
          </p>
        </div>
      </Screen>
    </AppShell>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-background/60 px-3 py-2">
        <span className="text-gold">{icon}</span>
        {children}
      </div>
    </label>
  );
}