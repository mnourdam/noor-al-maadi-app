import * as React from "react";

// Irth identity colors (inline; no Tailwind/CSS-vars to keep Android-safe).
const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#1f1813";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";

type Mode = "login" | "signup" | "forgot";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  background: SURFACE_2,
  color: TEXT,
  font: "16px system-ui, -apple-system, sans-serif",
  lineHeight: 1.4,
  padding: "14px 14px",
  outline: "none",
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: GOLD_SOFT,
  font: "700 13px system-ui, sans-serif",
  marginBottom: 8,
  letterSpacing: "0.02em",
};

export function isAndroidAuthMinPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-auth-min" || pathname.endsWith("/android-auth-min");
}

function readInitialMode(): Mode {
  if (typeof window === "undefined") return "login";
  try {
    const sp = new URLSearchParams(window.location.search);
    const m = (sp.get("mode") || "").toLowerCase();
    if (m === "signup" || m === "forgot") return m;
  } catch { /* ignore */ }
  return "login";
}

export function AndroidAuthMinTest() {
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const confirmRef = React.useRef<HTMLInputElement | null>(null);
  const forgotEmailRef = React.useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = React.useState<Mode>(readInitialMode);
  const [status, setStatus] = React.useState<string>("");
  const [success, setSuccess] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.add("android-auth-min-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    return () => document.documentElement.classList.remove("android-auth-min-active");
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus("");
    setSuccess(false);
  };

  const submitLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSuccess(false);
    setStatus("جارٍ تسجيل الدخول…");
    try {
      const email = (emailRef.current?.value ?? "").trim();
      const password = passwordRef.current?.value ?? "";
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(error.message);
      } else {
        setSuccess(true);
        setStatus("تم تسجيل الدخول بنجاح.");
        setTimeout(() => { window.location.href = "/"; }, 600);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const name = (nameRef.current?.value ?? "").trim();
    const email = (emailRef.current?.value ?? "").trim();
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";
    if (!name) { setStatus("يرجى إدخال الاسم."); setSuccess(false); return; }
    if (password.length < 6) { setStatus("كلمة المرور يجب أن تكون 6 أحرف على الأقل."); setSuccess(false); return; }
    if (password !== confirm) { setStatus("كلمتا المرور غير متطابقتين."); setSuccess(false); return; }
    setBusy(true);
    setSuccess(false);
    setStatus("جارٍ إنشاء الحساب…");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const redirectTo = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { display_name: name, full_name: name, username: name },
        },
      });
      if (error) {
        setStatus(error.message);
      } else {
        setSuccess(true);
        setStatus("تم إنشاء الحساب. تحقّق من بريدك لإتمام التفعيل إن لزم.");
        setTimeout(() => { window.location.href = "/"; }, 1200);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const email = (forgotEmailRef.current?.value ?? "").trim();
    if (!email) { setStatus("يرجى إدخال البريد الإلكتروني."); setSuccess(false); return; }
    setBusy(true);
    setSuccess(false);
    setStatus("جارٍ إرسال رابط الاستعادة…");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        setStatus(error.message);
      } else {
        setSuccess(true);
        setStatus("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "signup" ? "إنشاء حساب" : mode === "forgot" ? "استعادة كلمة المرور" : "تسجيل الدخول";
  const subtitle = mode === "signup"
    ? "بوّابة التاريخ — انضم إلى إرث"
    : mode === "forgot"
      ? "أدخل بريدك لإرسال رابط الاستعادة"
      : "بوّابة التاريخ — تسجيل الدخول";

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "max(28px, env(safe-area-inset-top)) 18px max(28px, env(safe-area-inset-bottom))",
        background: `radial-gradient(ellipse at top, #2a1d10 0%, ${INK} 60%, #050403 100%)`,
        color: TEXT,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        transform: "none",
        filter: "none",
        backdropFilter: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <style>{`
        html.android-auth-min-active,
        html.android-auth-min-active body,
        html.android-auth-min-active #root {
          margin: 0 !important;
          min-height: 100% !important;
          background: ${INK} !important;
          overflow: auto !important;
          overscroll-behavior: auto !important;
          touch-action: manipulation !important;
        }
        html.android-auth-min-active *,
        html.android-auth-min-active *::before,
        html.android-auth-min-active *::after {
          animation: none !important;
          transition: none !important;
          transform: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          contain: none !important;
          content-visibility: visible !important;
        }
        html.android-auth-min-active input {
          -webkit-user-select: text !important;
          user-select: text !important;
          -webkit-text-size-adjust: 100% !important;
          caret-color: ${GOLD} !important;
        }
        html.android-auth-min-active input::placeholder {
          color: #6b5a44 !important;
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img
            src="/assets/splash/irth-logo.png"
            alt="إرث"
            width={72}
            height={72}
            style={{ display: "inline-block", marginBottom: 12 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <h1 style={{ margin: 0, font: "800 28px system-ui, sans-serif", color: GOLD, letterSpacing: "0.04em" }}>
            إرث
          </h1>
          <p style={{ margin: "6px 0 0", color: "#9a8a6e", font: "13px system-ui, sans-serif" }}>
            {subtitle}
          </p>
        </div>

        {/* Mode tabs (login / signup) */}
        {mode !== "forgot" ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            padding: 4,
            background: SURFACE_2,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            marginBottom: 14,
          }}>
            <ModeTab active={mode === "login"} label="دخول" onClick={() => switchMode("login")} />
            <ModeTab active={mode === "signup"} label="إنشاء حساب" onClick={() => switchMode("signup")} />
          </div>
        ) : null}

        {/* Card */}
        <div style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 22,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,90,0.08)",
        }}>
          <h2 style={{ margin: "0 0 16px", font: "800 18px system-ui, sans-serif", color: TEXT }}>{title}</h2>

          {mode === "login" ? (
            <form onSubmit={submitLogin} autoComplete="on">
              <Field label="البريد الإلكتروني" htmlFor="aam-email">
                <input ref={emailRef} id="aam-email" name="email" type="email" inputMode="email"
                  autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <Field label="كلمة المرور" htmlFor="aam-password">
                <input ref={passwordRef} id="aam-password" name="password" type="password"
                  autoComplete="current-password" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <PrimaryButton busy={busy} label="تسجيل الدخول" />
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button type="button" onClick={() => switchMode("forgot")}
                  style={linkBtnStyle}>نسيت كلمة المرور؟</button>
              </div>
            </form>
          ) : null}

          {mode === "signup" ? (
            <form onSubmit={submitSignup} autoComplete="on">
              <Field label="الاسم" htmlFor="aam-name">
                <input ref={nameRef} id="aam-name" name="name" type="text"
                  autoComplete="name" autoCorrect="off" spellCheck={false} required style={inputStyle} />
              </Field>
              <Field label="البريد الإلكتروني" htmlFor="aam-email">
                <input ref={emailRef} id="aam-email" name="email" type="email" inputMode="email"
                  autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <Field label="كلمة المرور" htmlFor="aam-password">
                <input ref={passwordRef} id="aam-password" name="new-password" type="password"
                  autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <Field label="تأكيد كلمة المرور" htmlFor="aam-confirm">
                <input ref={confirmRef} id="aam-confirm" name="confirm-password" type="password"
                  autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <PrimaryButton busy={busy} label="إنشاء الحساب" />
            </form>
          ) : null}

          {mode === "forgot" ? (
            <form onSubmit={submitForgot} autoComplete="on">
              <Field label="البريد الإلكتروني" htmlFor="aam-forgot-email">
                <input ref={forgotEmailRef} id="aam-forgot-email" name="email" type="email" inputMode="email"
                  autoComplete="email" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                  required dir="ltr" style={inputStyle} />
              </Field>
              <PrimaryButton busy={busy} label="إرسال رابط الاستعادة" />
              <div style={{ marginTop: 14, textAlign: "center" }}>
                <button type="button" onClick={() => switchMode("login")} style={linkBtnStyle}>
                  العودة إلى تسجيل الدخول
                </button>
              </div>
            </form>
          ) : null}

          {status ? (
            <p style={{
              marginTop: 16,
              marginBottom: 0,
              font: "13px/1.6 system-ui, sans-serif",
              color: success ? GOLD_SOFT : "#e8b4a0",
              textAlign: "center",
            }}>
              {status}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => { window.location.href = "/"; }}
          style={{
            display: "block",
            width: "100%",
            boxSizing: "border-box",
            marginTop: 16,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            background: "transparent",
            color: GOLD_SOFT,
            font: "600 14px system-ui, sans-serif",
            padding: "12px",
          }}
        >
          العودة إلى التطبيق
        </button>
      </div>
    </main>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "0 0 16px" }}>
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${GOLD}`,
        borderRadius: 10,
        background: busy ? "#6b5530" : `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)`,
        color: "#1a1208",
        font: "800 16px system-ui, sans-serif",
        padding: "14px 14px",
        letterSpacing: "0.03em",
        boxShadow: "0 6px 18px rgba(212,175,90,0.25)",
        marginTop: 4,
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}

function ModeTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "none",
        borderRadius: 8,
        padding: "10px 12px",
        font: "700 13px system-ui, sans-serif",
        background: active ? `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)` : "transparent",
        color: active ? "#1a1208" : GOLD_SOFT,
        boxShadow: active ? "0 2px 8px rgba(212,175,90,0.25)" : "none",
      }}
    >
      {label}
    </button>
  );
}

const linkBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: GOLD_SOFT,
  font: "600 13px system-ui, sans-serif",
  padding: 6,
  textDecoration: "underline",
};
