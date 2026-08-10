import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Screen } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getAndClearGoogleAuthIntent,
  resolveGoogleAuthResult,
  stashGoogleAuthResult,
} from "@/lib/googleAuthResult";
import { consumeAuthOrigin } from "@/lib/authOrigin";
import { setRecoveryMode } from "@/lib/recoveryMode";
import { openAuthDialog } from "@/lib/authDialog";



type SearchParams = {
  code?: string;
  type?: string;
  next?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  native?: string;
};

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "تأكيد الحساب" }] }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    code: typeof s.code === "string" ? s.code : undefined,
    type: typeof s.type === "string" ? s.type : undefined,
    next: typeof s.next === "string" ? s.next : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
    error_code: typeof s.error_code === "string" ? s.error_code : undefined,
    error_description: typeof s.error_description === "string" ? s.error_description : undefined,
    native: typeof s.native === "string" ? s.native : undefined,
  }),
  // Native Capacitor hand-off runs entirely client-side (see useEffect
  // below). A previous SSR `throw new Response(302, Location: app.lovable.irth://…)`
  // was removed: TanStack Router does not treat raw Responses from
  // `beforeLoad` as a redirect, and Chrome cannot follow a server 302 to a
  // custom scheme in any case — it aborted the response mid-flight, which
  // surfaced as ERR_CONNECTION_CLOSED before the HTML/JS could run.
  component: AuthCallbackPage,
});

type Status = "processing" | "success" | "recovery" | "expired" | "invalid" | "already_verified" | "error";

function parseHashParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return {};
  const out: Record<string, string> = {};
  for (const part of hash.split("&")) {
    const [k, v] = part.split("=");
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return out;
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      // Native Capacitor hand-off: redirect every param (code, error, hash) to
      // the app's custom scheme. The app's deep-link listener finishes the
      // PKCE exchange inside the WebView so the session lives there.
      if (search.native === "1" && typeof window !== "undefined") {
        const qs = window.location.search || "";
        const hash = window.location.hash || "";
        const target = `app.lovable.irth://auth/callback${qs}${hash}`;
        window.location.replace(target);
        return;
      }
      const hashParams = parseHashParams();
      const errCode = search.error_code || hashParams.error_code || search.error || hashParams.error;
      const errDesc = search.error_description || hashParams.error_description;
      const type = search.type || hashParams.type;
      const isRecovery = type === "recovery";

      // Handle error params from Supabase
      if (errCode) {
        if (!alive) return;
        const code = errCode.toLowerCase();
        if (code.includes("expired") || code === "otp_expired") {
          setStatus("expired");
          setMessage("انتهت صلاحية الرابط. الرجاء طلب رابط جديد.");
        } else if (code.includes("invalid") || code.includes("not_found")) {
          setStatus("invalid");
          setMessage("الرابط غير صالح أو تم استخدامه مسبقاً.");
        } else {
          setStatus("error");
          setMessage(errDesc || "تعذر إتمام العملية.");
        }
        return;
      }

      // Recovery: set the persistent flag BEFORE the code exchange so the
      // root guard blocks every protected route even if the WebView is
      // recreated between exchange and navigation.
      if (isRecovery) setRecoveryMode(true);

      // PKCE code exchange flow
      if (search.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(search.code);
        if (!alive) return;
        if (error) {
          // Recovery link failed — clear the flag so the user is not
          // trapped on the reset screen with no session.
          if (isRecovery) setRecoveryMode(false);
          const m = error.message.toLowerCase();
          if (m.includes("expired")) { setStatus("expired"); setMessage("انتهت صلاحية الرابط."); }
          else if (m.includes("invalid") || m.includes("used")) { setStatus("invalid"); setMessage("الرابط غير صالح أو مستخدم."); }
          else { setStatus("error"); setMessage(error.message); }
          return;
        }
      }

      // Recovery flow → push to reset-password. Flag is already set.
      if (isRecovery) {
        if (!alive) return;
        setStatus("recovery");
        setTimeout(() => navigate({ to: "/reset-password", replace: true }), 400);
        return;
      }


      // Hash-based token session (signup/magic link)
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (data.session) {
        const intent = getAndClearGoogleAuthIntent();
        // Re-fetch the user to get merged `identities[]` after Supabase's
        // auto-linker attached Google to a pre-existing email/password user.
        const { data: userRes } = await supabase.auth.getUser();
        const kind = await resolveGoogleAuthResult({
          user: userRes.user ?? data.session.user,
          intent,
          supabase,
        }).catch(e => {
          console.error("[auth-callback] resolveGoogleAuthResult failed (non-fatal)", e);
          return null;
        });
        if (kind) stashGoogleAuthResult(kind);

        setStatus("success");
        setMessage("تم تأكيد بريدك الإلكتروني بنجاح. مرحباً بك في إرث!");
        const stored = consumeAuthOrigin("");
        const nextParam = typeof search.next === "string" && search.next.startsWith("/") && !search.next.startsWith("//") ? search.next : "";
        const dest = stored || nextParam || "/";
        openAuthDialog({
          id: "email-verified",
          tone: "success",
          title: "تم تأكيد بريدك",
          body: "اكتمل إنشاء حسابك، ويمكنك الآن متابعة رحلتك في إرث.",
          primary: {
            label: "متابعة",
            onClick: () => navigate({ to: dest as "/" }),
          },
        });
      } else {
        setStatus("already_verified");
        setMessage("الرابط لا يحتوي على جلسة جديدة. ربما تم تأكيد الحساب مسبقاً.");
      }
    })();
    return () => { alive = false; };

  }, [search, navigate]);

  const tone =
    status === "success" || status === "recovery" ? "text-emerald-300"
    : status === "processing" ? "text-muted-foreground"
    : "text-rose-300";

  const title =
    status === "processing" ? "جاري التحقق…"
    : status === "success" ? "تم التأكيد"
    : status === "recovery" ? "تحويل…"
    : status === "expired" ? "انتهت الصلاحية"
    : status === "invalid" ? "رابط غير صالح"
    : status === "already_verified" ? "تم التحقق مسبقاً"
    : "تعذرت العملية";

  return (
    <AppShell>
      <Screen title="تأكيد الحساب" subtitle="نتحقق من رابط التأكيد">
        <div className="rounded-3xl border border-gold/25 bg-surface p-6 shadow-elegant space-y-4">
          <h2 className={`text-lg font-bold ${tone}`}>{title}</h2>
          {message && <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>}

          {status === "processing" && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/3 animate-pulse bg-gradient-gold" />
            </div>
          )}

          {(status === "expired" || status === "invalid" || status === "error") && (
            <div className="flex flex-col gap-2 pt-2">
              <Link
                to="/auth"
                search={{}}

                className="block w-full rounded-xl bg-gradient-gold py-2.5 text-center text-sm font-bold text-primary-foreground shadow-gold"
              >
                طلب رابط جديد
              </Link>
              <Link to="/" className="block text-center text-[12px] text-muted-foreground hover:text-foreground">
                العودة للرئيسية
              </Link>
            </div>
          )}

          {status === "already_verified" && (
            <div className="flex flex-col gap-2 pt-2">
              <Link
                to="/auth"
                search={{}}
                className="block w-full rounded-xl bg-gradient-gold py-2.5 text-center text-sm font-bold text-primary-foreground shadow-gold"
              >
                تسجيل الدخول
              </Link>
            </div>
          )}

          {status === "success" && (
            <Link
              to="/profile"
              className="block w-full rounded-xl bg-gradient-gold py-2.5 text-center text-sm font-bold text-primary-foreground shadow-gold"
            >
              متابعة إلى حسابك
            </Link>
          )}
        </div>
      </Screen>
    </AppShell>
  );
}
