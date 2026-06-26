import * as React from "react";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #c9c9c9",
  borderRadius: 6,
  background: "#ffffff",
  color: "#111111",
  font: "16px system-ui, sans-serif",
  lineHeight: 1.4,
  padding: "12px 14px",
  outline: "none",
  transform: "none",
  filter: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#111111",
  font: "13px system-ui, sans-serif",
  fontWeight: 700,
  marginBottom: 8,
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
    setStatus("Signing in…");
    try {
      const email = (emailRef.current?.value ?? "").trim();
      const password = passwordRef.current?.value ?? "";
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setStatus(error ? error.message : "Signed in successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected auth error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      dir="ltr"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: "max(24px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom))",
        background: "#f4f4f4",
        color: "#111111",
        fontFamily: "system-ui, sans-serif",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        transform: "none",
        filter: "none",
        backdropFilter: "none",
      }}
    >
      <style>{`
        html.android-auth-min-active,
        html.android-auth-min-active body,
        html.android-auth-min-active #root {
          margin: 0 !important;
          min-height: 100% !important;
          background: #f4f4f4 !important;
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
          caret-color: #111 !important;
        }
      `}</style>

      <h1 style={{ font: "700 20px system-ui, sans-serif", margin: "0 0 8px" }}>
        Android auth-min
      </h1>
      <p style={{ font: "13px/1.6 system-ui, sans-serif", color: "#555", margin: "0 0 18px" }}>
        No router, providers, AppShell, auth listeners, redirects, profile fetches, or auth client before submit.
      </p>

      <form onSubmit={submit} autoComplete="on">
        <div style={{ margin: "0 0 18px" }}>
          <label htmlFor="android-auth-min-email" style={labelStyle}>Email</label>
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
            style={inputStyle}
          />
        </div>

        <div style={{ margin: "0 0 18px" }}>
          <label htmlFor="android-auth-min-password" style={labelStyle}>Password</label>
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
            border: "1px solid #111111",
            borderRadius: 6,
            background: busy ? "#777777" : "#111111",
            color: "#ffffff",
            font: "700 16px system-ui, sans-serif",
            padding: "12px 14px",
          }}
        >
          Sign in
        </button>
      </form>

      {status ? <p style={{ marginTop: 14, font: "13px/1.5 system-ui, sans-serif", color: "#333" }}>{status}</p> : null}

      <button
        type="button"
        onClick={() => { window.location.href = "/"; }}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: 18,
          border: "1px solid #111111",
          borderRadius: 6,
          background: "#eeeeee",
          color: "#111111",
          font: "700 15px system-ui, sans-serif",
          padding: "10px 12px",
        }}
      >
        Back to app
      </button>
    </main>
  );
}