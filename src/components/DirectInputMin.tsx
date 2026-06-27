import { useState } from "react";

export const DIRECT_INPUT_MIN_PATH = "/debug/react-direct-input-min";

export function isDirectInputMinPath(): boolean {
  try {
    return window.location.pathname === DIRECT_INPUT_MIN_PATH;
  } catch {
    return false;
  }
}

export function DirectInputMin() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Direct React Input Min</h1>
      <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
        No router, no providers, no app shell. Pure ReactDOM.createRoot.
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{ padding: "10px 16px", marginBottom: 16, background: "#d4a056", color: "#0b1424", border: "none", borderRadius: 6, fontWeight: 600 }}
      >
        Counter: {count}
      </button>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain input</label>
        <input
          type="text"
          placeholder="Type here…"
          style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain textarea</label>
        <textarea
          rows={4}
          placeholder="Type here…"
          style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
      </div>
    </div>
  );
}
