import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    IrthNativeDiagnostics?: {
      logInputEvent?: (eventName: string, payload: string) => void;
    };
  }
}

export const Route = createFileRoute("/debug/native-input-min")({
  head: () => ({ meta: [{ title: "Native Input Min — Irth" }] }),
  component: NativeInputMinRoute,
});

function NativeInputMinRoute() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const marker = "IRTH_NATIVE_INPUT_MIN_MOUNTED";
    try {
      window.IrthNativeDiagnostics?.logInputEvent?.(
        marker,
        JSON.stringify({ route: window.location.pathname, t: Date.now() }),
      );
    } catch {
      // ignore native bridge failures in web preview
    }
    // eslint-disable-next-line no-console
    console.info(marker, { route: window.location.pathname });
  }, []);

  return (
    <main
      dir="ltr"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: 20,
        background: "#101820",
        color: "#f5f0e8",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 700 }}>
        Native Input Min
      </h1>

      <label htmlFor="native-input-min-input" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        Plain input
      </label>
      <input
        id="native-input-min-input"
        name="native-input-min-input"
        type="text"
        autoComplete="off"
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 20,
          padding: 12,
          fontSize: 16,
          color: "#111827",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: 4,
        }}
      />

      <label htmlFor="native-input-min-textarea" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
        Plain textarea
      </label>
      <textarea
        id="native-input-min-textarea"
        name="native-input-min-textarea"
        rows={6}
        autoComplete="off"
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 20,
          padding: 12,
          fontSize: 16,
          color: "#111827",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
          borderRadius: 4,
          resize: "none",
        }}
      />

      <button
        type="button"
        onClick={() => setCount((value) => value + 1)}
        style={{
          minHeight: 44,
          padding: "0 16px",
          fontSize: 16,
          fontWeight: 700,
          color: "#101820",
          background: "#d4a056",
          border: "none",
          borderRadius: 4,
        }}
      >
        Counter: {count}
      </button>
    </main>
  );
}