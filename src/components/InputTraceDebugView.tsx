import * as React from "react";
import {
  ANDROID_FOCUS_AB_LABELS,
  readAndroidFocusABFlags,
  writeAndroidFocusABFlags,
  type AndroidFocusABFlags,
} from "@/lib/androidFocusAB";

const STORAGE_KEY = "irth_input_trace_last_freeze";

export function InputTraceDebugView() {
  const [json, setJson] = React.useState("");
  const [count, setCount] = React.useState(0);
  const [copyMsg, setCopyMsg] = React.useState("");
  const [flags, setFlags] = React.useState<AndroidFocusABFlags>(() => readAndroidFocusABFlags());

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
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    refresh();
  };

  const updateFlag = (key: keyof AndroidFocusABFlags, value: boolean) => {
    const next = { ...flags, [key]: value };
    setFlags(next);
    writeAndroidFocusABFlags(next);
    setCopyMsg("Flag saved. Reload the app before testing this A/B run.");
    setTimeout(() => setCopyMsg(""), 3000);
  };

  const reload = () => window.location.reload();

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
        <button onClick={reload} style={{ ...btn, background: "#1f6f5b", color: "#ecfdf5" }}>Reload with flags</button>
      </div>
      <section style={{ border: "1px solid #1f2a44", borderRadius: 8, padding: 12, marginBottom: 12, background: "#0f1a2c" }}>
        <h2 style={{ fontSize: 14, margin: "0 0 8px", color: "#fcd34d" }}>Android Focus A/B flags</h2>
        <p style={{ fontSize: 11, opacity: 0.7, margin: "0 0 10px" }}>
          Toggle one flag, reload, reproduce the focus freeze, then export the trace/logcat.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {ANDROID_FOCUS_AB_LABELS.map((item) => (
            <label key={item.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", borderTop: "1px solid #1f2a44", paddingTop: 8 }}>
              <input
                type="checkbox"
                checked={!!flags[item.key]}
                onChange={(event) => updateFlag(item.key, event.currentTarget.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ display: "block", fontSize: 12 }}>{item.label}</strong>
                <span style={{ display: "block", fontSize: 11, opacity: 0.65 }}>{item.description}</span>
              </span>
            </label>
          ))}
        </div>
        <pre style={{ margin: "10px 0 0", padding: 8, background: "#111c2f", borderRadius: 6, fontSize: 10, overflowX: "auto" }}>
          {JSON.stringify(flags, null, 2)}
        </pre>
      </section>
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