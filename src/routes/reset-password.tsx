import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { PasswordField } from "@/components/ui/PasswordField";
import { setRecoveryMode } from "@/lib/recoveryMode";
import { consumeAuthOrigin } from "@/lib/authOrigin";
import { openAuthDialog } from "@/lib/authDialog";
import {
  evaluatePassword,
  checkHibp,
  isWeakPasswordError,
  WEAK_PASSWORD_COPY,
  type HibpResult,
} from "@/lib/passwordPolicy";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "تعيين كلمة مرور جديدة" }] }),
  component: ResetPasswordPage,
});


function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hibp, setHibp] = useState<HibpResult | null>(null);
  const [hibpPending, setHibpPending] = useState(false);
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
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setHasSession(!!session);
        setReady(true);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const sync = useMemo(() => evaluatePassword(password), [password]);

  // Async HIBP check — debounced. Only runs once the sync rules pass.
  useEffect(() => {
    setHibp(null);
    if (!sync.syncOk) { setHibpPending(false); return; }
    const controller = new AbortController();
    setHibpPending(true);
    const t = setTimeout(() => {
      checkHibp(password, controller.signal)
        .then((r) => { setHibp(r); })
        .catch(() => { setHibp({ status: "skipped", reason: "error" }); })
        .finally(() => { setHibpPending(false); });
    }, 350);
    return () => { controller.abort(); clearTimeout(t); setHibpPending(false); };
  }, [password, sync.syncOk]);

  const hibpBlocked = hibp?.status === "pwned";
  const problems = hibpBlocked
    ? [...sync.problems, "هذه الكلمة ظهرت في تسريبات معروفة — اختر كلمة مختلفة"]
    : sync.problems;
  const policyOk = sync.syncOk && !hibpBlocked && !hibpPending;
  const passwordsMatch = password.length > 0 && password === confirm;
  const canSubmit = ready && hasSession && policyOk && passwordsMatch && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    if (!policyOk) {
      setError("كلمة المرور لا تستوفي المتطلبات.");
      return;
    }
    if (!passwordsMatch) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) {
        // Do NOT clear recovery mode on failure — user must retry.
        const weak = isWeakPasswordError(err.message);
        openAuthDialog({
          id: `reset-error-${Date.now()}`,
          tone: "error",
          title: weak ? WEAK_PASSWORD_COPY.title : "تعذّر تحديث كلمة المرور",
          body: weak ? WEAK_PASSWORD_COPY.body : "حدث خطأ أثناء تحديث كلمة المرور. حاول مجدداً.",
          primary: { label: "إعادة المحاولة" },
        });
        return;
      }
      // Success → clear the recovery lock, then refresh the session so the
      // app treats the user as a normally signed-in account.
      setRecoveryMode(false);
      try { await supabase.auth.refreshSession(); } catch { /* best-effort */ }
      const dest = consumeAuthOrigin("/profile");
      openAuthDialog({
        id: "password-updated",
        tone: "success",
        title: "تم تحديث كلمة المرور",
        body: "تم اعتماد كلمة المرور الجديدة وتسجيل دخولك بنجاح.",
        primary: {
          label: "متابعة",
          onClick: () => navigate({ to: dest as "/profile", replace: true }),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      openAuthDialog({
        id: `reset-throw-${Date.now()}`,
        tone: "error",
        title: "تعذّر تحديث كلمة المرور",
        body: "حدث خطأ غير متوقع. حاول مجدداً.",
        primary: { label: "إعادة المحاولة" },
      });
      void msg;
    } finally {
      setBusy(false);
    }
  }


  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.35)",
    color: "white", outline: "none",
  };

  const hibpSkipped = hibp?.status === "skipped";
  const strengthLabel = hibpPending
    ? "جاري التحقق…"
    : hibpBlocked
      ? "مسرّبة"
      : ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"][sync.score];
  const strengthColor = hibpBlocked
    ? "bg-rose-500"
    : [
        "bg-rose-500",
        "bg-rose-400",
        "bg-amber-400",
        "bg-emerald-400",
        "bg-emerald-500",
      ][sync.score];
  const hibpNotice = sync.syncOk && !hibpPending && hibpSkipped
    ? "تعذر التحقق من تسرب كلمة المرور حالياً."
    : null;

  return (
    <AppShell>
      <Screen title="تعيين كلمة مرور جديدة" subtitle="اختر كلمة مرور جديدة لحسابك قبل المتابعة">
        <div className="rounded-3xl border border-gold/25 bg-surface p-5 shadow-elegant">
          {!ready ? (
            <p className="text-sm text-muted-foreground">جاري التحقق من الرابط…</p>
          ) : !hasSession ? (
            <div className="space-y-3 text-sm">
              <p className="text-rose-300">
                انتهت صلاحية رابط الاستعادة أو تم استخدامه.
              </p>
              <Link
                to="/auth"
                search={{}}
                className="block w-full rounded-xl bg-gradient-gold py-2.5 text-center text-sm font-bold text-primary-foreground shadow-gold"
              >
                إرسال رابط جديد
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3" autoComplete="on">
              <p className="text-[12px] text-amber-200/90">
                لأمان حسابك، يجب تعيين كلمة مرور جديدة قبل متابعة استخدام التطبيق.
              </p>

              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">كلمة المرور الجديدة</span>
                <PasswordField
                  ref={passwordRef}
                  name="new-password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={inputStyle}
                  placeholder="٨ أحرف على الأقل"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {password.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>قوة كلمة المرور</span>
                    <span>{strengthLabel}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full transition-all ${strengthColor}`}
                      style={{ width: `${(sync.score / 4) * 100}%` }}
                    />
                  </div>
                  {problems.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/80">
                      {problems.map((p: string) => (
                        <li key={p}>• {p.startsWith("هذه") ? p : `يجب أن تحتوي على ${p}`}</li>
                      ))}
                    </ul>
                  )}
                  {hibpNotice && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{hibpNotice}</p>
                  )}
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-[11px] text-muted-foreground">تأكيد كلمة المرور</span>
                <PasswordField
                  name="confirm-password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={inputStyle}
                  placeholder="أعد إدخال كلمة المرور"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-[11px] text-rose-300">كلمتا المرور غير متطابقتين</p>
                )}
              </label>

              {error && <p className="text-xs text-rose-300">{error}</p>}
              {info && <p className="text-xs text-emerald-300">{info}</p>}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold disabled:opacity-50 disabled:cursor-not-allowed"
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
