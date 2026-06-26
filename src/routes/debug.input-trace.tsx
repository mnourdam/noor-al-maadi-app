import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

export const Route = createFileRoute("/debug/input-trace")({
  head: () => ({ meta: [{ title: "Input Trace — Irth" }] }),
  component: InputTraceDebug,
});

function InputTraceDebug() {
  const [json, setJson] = React.useState("");
  const [count, setCount] = React.useState(0);
  const [copyMsg, setCopyMsg] = React.useState("");

  const refresh = React.useCallback(() => {
    const stored = window.localStorage.getItem("irth_input_trace_last_freeze");
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyMsg("Copied to clipboard");
    } catch (e) {
      setCopyMsg("Copy failed: " + (e as Error).message);
    }
    setTimeout(() => setCopyMsg(""), 2000);
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `irth-input-trace-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    (window as any).__IRTH_INPUT_TRACE__ = [];
    window.localStorage.removeItem("irth_input_trace_last_freeze");
    refresh();
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif", background: "#0b1424", color: "#f3f4f6", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>Input Trace ({count} entries)</h1>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 12px" }}>
        Tap a real input first, type one character, then come back here to copy/export.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={refresh} style={btn}>Refresh</button>
        <button onClick={copy} style={btn}>Copy JSON</button>
        <button onClick={download} style={btn}>Download</button>
        <button onClick={clear} style={{ ...btn, background: "#7f1d1d" }}>Clear</button>
      </div>
      {copyMsg && <p style={{ fontSize: 12, color: "#fcd34d" }}>{copyMsg}</p>}
      <textarea
        readOnly
        value={json}
        style={{
          width: "100%",
          height: "60vh",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          background: "#111c2f",
          color: "#e5e7eb",
          border: "1px solid #1f2a44",
          borderRadius: 8,
          padding: 8,
          boxSizing: "border-box",
        }}
      />
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

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  background: "#d4a056",
  color: "#0b1424",
  fontWeight: 700,
  border: "none",
  fontSize: 13,
};
