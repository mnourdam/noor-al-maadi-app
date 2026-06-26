import * as React from "react";

/**
 * Bare-minimum React input page. No providers, no router, no CSS, no global
 * listeners, no console spam. If THIS freezes, the cause is React mount or
 * `android-client.tsx` bootstrap itself — not AppShell, not providers.
 *
 * Reached via `/android-react-min` (see android-client.tsx).
 */
export function AndroidReactMinTest() {
  const [v, setV] = React.useState("");
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 16px" }}>React-minimal input test</h1>
      <p style={{ fontSize: 13, margin: "0 0 12px", color: "#555" }}>
        No providers, no router, no AppShell, no CSS bundle, no global listeners.
      </p>

      <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Uncontrolled</label>
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue=""
        style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, border: "1px solid #c9c9c9", borderRadius: 6, marginBottom: 18 }}
      />

      <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Controlled</label>
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={v}
        onChange={(e) => setV(e.currentTarget.value)}
        style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, border: "1px solid #c9c9c9", borderRadius: 6, marginBottom: 18 }}
      />

      <p style={{ fontSize: 12, color: "#777" }}>Length: {v.length}</p>

      <button
        type="button"
        onClick={() => { window.location.href = "/android-input-test"; }}
        style={{ marginTop: 16, padding: "10px 14px", border: "1px solid #111", borderRadius: 6, background: "#eee", color: "#111", fontWeight: 700 }}
      >
        Back to /android-input-test
      </button>
      <button
        type="button"
        onClick={() => { window.location.href = "/"; }}
        style={{ marginTop: 8, padding: "10px 14px", border: "1px solid #111", borderRadius: 6, background: "#0f766e", color: "#fff", fontWeight: 700, display: "block" }}
      >
        Back to app
      </button>
    </div>
  );
}

export function isAndroidReactMinPath(pathname = typeof window !== "undefined" ? window.location.pathname : "") {
  return pathname === "/android-react-min" || pathname.endsWith("/android-react-min");
}
