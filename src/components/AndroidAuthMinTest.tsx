import * as React from "react";

// Irth identity colors (inline; no Tailwind/CSS-vars to keep Android-safe).
const GOLD = "#d4af5a";
const GOLD_SOFT = "#e8c878";
const INK = "#0c0a07";
const SURFACE = "#171210";
const SURFACE_2 = "#1f1813";
const BORDER = "#3a2d20";
const TEXT = "#f5ecd9";
const MUTED = "#a89madge";

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

export function AndroidAuthMinTest() {
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.add("android-auth-min-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
    return () => document.documentElement.classList.remove("android-auth-min-active");
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("جارٍ تسجيل الدخول…");
    try {
      const email = (emailRef.current?.value ?? "").trim();
      const password = passwordRef.current?.value ?? "";
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(error.message);
      } else {
        setStatus("تم تسجيل الدخول بنجاح.");
        setTimeout(() => { window.location.href = "/"; }, 600);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  };

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
          <h1 style={{
            margin: 0,
            font: "800 28px system-ui, sans-serif",
            color: GOLD,
            letterSpacing: "0.04em",
          }}>
            إرث
          </h1>
          <p style={{ margin: "6px 0 0", color: "#9a8a6e", font: "13px system-ui, sans-serif" }}>
            بوّابة التاريخ — تسجيل الدخول
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 22,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(212,175,90,0.08)",
        }}>
          <form onSubmit={submit} autoComplete="on">
            <div style={{ margin: "0 0 18px" }}>
              <label htmlFor="android-auth-min-email" style={labelStyle}>البريد الإلكتروني</label>
              <input
                ref={emailRef}
                id="android-auth-min-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                dir="ltr"
                style={inputStyle}
              />
            </div>

            <div style={{ margin: "0 0 22px" }}>
              <label htmlFor="android-auth-min-password" style={labelStyle}>كلمة المرور</label>
              <input
                ref={passwordRef}
                id="android-auth-min-password"
                name="password"
                type="password"
                autoComplete="current-password"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                dir="ltr"
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                border: `1px solid ${GOLD}`,
                borderRadius: 10,
                background: busy
                  ? "#6b5530"
                  : `linear-gradient(180deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)`,
                color: "#1a1208",
                font: "800 16px system-ui, sans-serif",
                padding: "14px 14px",
                letterSpacing: "0.03em",
                boxShadow: "0 6px 18px rgba(212,175,90,0.25)",
              }}
            >
              {busy ? "…" : "تسجيل الدخول"}
            </button>
          </form>

          {status ? (
            <p style={{
              marginTop: 16,
              marginBottom: 0,
              font: "13px/1.6 system-ui, sans-serif",
              color: status.includes("بنجاح") ? GOLD_SOFT : "#e8b4a0",
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
