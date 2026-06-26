import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/debug/react-bare-input-min")({
  component: BareInputMin,
});

// Intentionally minimal: no AppShell, no providers beyond what __root injects,
// no app CSS classes, no animations, no diagnostics. Plain inline styles only.
// Logcat marker on mount so we can correlate with native traces.
function BareInputMin() {
  const [count, setCount] = useState(0);

  // Toggle a hard-reset class on <html> only while this route is mounted.
  // Matching CSS lives in src/styles.css under `.react-bare-input-test`.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("react-bare-input-test");
    return () => { html.classList.remove("react-bare-input-test"); };
  }, []);

  if (typeof window !== "undefined" && !(window as unknown as { __irthReactBareMounted?: boolean }).__irthReactBareMounted) {
    (window as unknown as { __irthReactBareMounted?: boolean }).__irthReactBareMounted = true;
    // eslint-disable-next-line no-console
    console.log("IRTH_REACT_BARE_INPUT_MIN_MOUNTED");
  }

  const wrap: React.CSSProperties = {
    all: "initial",
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    minHeight: "100vh",
    padding: "16px",
    background: "#ffffff",
    color: "#000000",
    fontFamily: "system-ui, sans-serif",
    fontSize: "16px",
  };

  const fieldStyle: React.CSSProperties = {
    all: "unset",
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    marginTop: "8px",
    padding: "12px",
    border: "1px solid #888",
    borderRadius: "4px",
    background: "#ffffff",
    color: "#000000",
    fontSize: "16px",
    WebkitUserSelect: "text",
    userSelect: "text",
    touchAction: "auto",
    pointerEvents: "auto",
  };

  return (
    <div style={wrap} dir="ltr" lang="en">
      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
        React Bare Input Min
      </h1>
      <p style={{ marginTop: "8px", color: "#333" }}>
        No AppShell, no app CSS classes, no animations. Inline styles only.
      </p>

      <label style={{ display: "block", marginTop: "16px" }}>
        Plain input:
        <input type="text" placeholder="type here" style={fieldStyle} />
      </label>

      <label style={{ display: "block", marginTop: "16px" }}>
        Plain textarea:
        <textarea rows={4} placeholder="type here" style={fieldStyle} />
      </label>

      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{
          ...fieldStyle,
          marginTop: "16px",
          textAlign: "center",
          background: "#0b1424",
          color: "#ffffff",
          cursor: "pointer",
        }}
      >
        Counter: {count}
      </button>
    </div>
  );
}
