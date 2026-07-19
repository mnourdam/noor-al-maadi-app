// ============================================================
// TutorialHomeDiagBadge — dev-only floating diagnostics badge
// ------------------------------------------------------------
// Temporary developer-only badge shown on Home to observe live
// tutorial engine state during first-launch flow reproduction.
// Pure read-only — polls tutorialDebug.diagnostics() every 400ms.
// ============================================================

import { useEffect, useState } from "react";
import { tutorialDebug } from "@/lib/tutorial";
import type { TutorialDiagnostics } from "@/lib/tutorial";

export function TutorialHomeDiagBadge() {
  const [diag, setDiag] = useState<TutorialDiagnostics | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setDiag(tutorialDebug.diagnostics());
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const rows: Array<[string, string]> = diag
    ? [
        ["state", String(diag.currentState)],
        ["eligible", String(diag.eligible)],
        ["waiting", diag.waitingReason ?? "—"],
        ["overlayStack", String(diag.envInputs.overlayStackSize)],
        ["pathname", diag.envInputs.pathname],
        ["homeFrames", String(diag.envInputs.homeStableFrames)],
        ["docVisible", String(diag.envInputs.documentVisible)],
      ]
    : [["diag", "no binding"]];

  return (
    <div
      dir="ltr"
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2147483000,
        maxWidth: 260,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.82)",
        color: "#fff",
        font: "500 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.15)",
      }}
      aria-hidden="true"
    >
      <div style={{ color: "#ffd166", marginBottom: 4, fontWeight: 700 }}>
        TUTORIAL DIAG
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6 }}>
          <span style={{ color: "#9ecbff", minWidth: 78 }}>{k}</span>
          <span style={{ wordBreak: "break-all" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
