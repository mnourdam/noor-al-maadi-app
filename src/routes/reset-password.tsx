import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { PasswordField } from "@/components/ui/PasswordField";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "إعادة تعيين كلمة المرور" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Supabase appends the recovery tokens to the URL hash. The client picks
  // them up automatically via detectSessionInUrl; we just wait for the
  // session to materialize.
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setHasSession(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(!!session);
        setReady(true);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const password = passwordRef.current?.value ?? "";
    if (password.length < 6) { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    setBusy(true); setError(null); setInfo(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setInfo("تم تحديث كلمة المرور بنجاح. سيتم تحويلك إلى حسابك…");
      setTimeout(() => navigate({ to: "/profile" }), 1200);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.35)",
    color: "white", outline: "none",
  };

  return (
    <AppShell>
      <Screen title="إعادة تعيين كلمة المرور" subtitle="اختر كلمة مرور جديدة لحسابك">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          {!ready ? (
            <p className="text-sm text-muted-foreground">جاري التحقق من الرابط…</p>
          ) : !hasSession ? (
            <div className="space-y-3 text-sm">
              <p className="text-rose-300">
                الرابط غير صالح أو انتهت صلاحيته. الرجاء طلب رابط جديد.
              </p>
              <Link to="/auth" search={{ ref: undefined }} className="block text-center text-gold hover:underline">
                العودة لصفحة تسجيل الدخول
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" autoComplete="on">
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">كلمة المرور الجديدة</span>
                <PasswordField
                  ref={passwordRef}
                  name="new-password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  style={inputStyle}
                  placeholder="6 أحرف على الأقل"
                />
              </label>
              {error && <p className="text-xs text-rose-300">{error}</p>}
              {info && <p className="text-xs text-emerald-300">{info}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-60"
              >
                {busy ? "جاري التحديث…" : "تحديث كلمة المرور"}
              </button>
            </form>
          )}
        </div>
      </Screen>
    </AppShell>
  );
}
