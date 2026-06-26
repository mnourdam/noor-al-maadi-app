import * as React from "react";

const STORAGE_KEY = "irth_input_trace_last_freeze";

export function InputTraceDebugView() {
  const [json, setJson] = React.useState("");
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(() => {
    let stored = "";
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) || "";
    } catch { /* ignore */ }
    const arr = (window as any).__IRTH_INPUT_TRACE__ ?? [];
    const nextJson = stored || JSON.stringify(arr, null, 2);
    setCount(stored ? safeTraceCount(stored) : arr.length);
    setJson(nextJson);
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#0b1424", color: "#f3f4f6", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Input Trace ({count} entries)</h1>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 12px" }}>
        This page is passive only. Use Logcat / ADB flags; no in-app switches or buttons are rendered.
      </p>
      <pre
        style={{
          width: "100%",
          maxHeight: "55vh",
          overflow: "hidden",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          background: "#111c2f",
          color: "#e5e7eb",
          border: "1px solid #1f2a44",
          borderRadius: 8,
          padding: 8,
          boxSizing: "border-box",
        }}
      >{json.slice(0, 4000)}</pre>
    </div>
  );
}

function safeTraceCount(json: string): number {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
