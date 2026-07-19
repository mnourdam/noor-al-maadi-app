// ============================================================
// Home-only tutorial diagnostic badge (temporary).
// ------------------------------------------------------------
// Visible in every build until the tutorial successfully reaches
// `showing_step`. Reads exclusively from the public tutorial debug
// API — no engine internals. Removes itself the moment the tour
// starts displaying a step.
// ============================================================

import { useEffect, useState } from "react";
import {
  tutorialDebug,
  readLastStartDiagnostic,
  __tutorialAutoStartTelemetry,
  type LastStartDiagnostic,
} from "@/lib/tutorial";

export function TutorialHomeDiagBadge() {
  const [diag, setDiag] = useState(() => tutorialDebug.diagnostics());
  const [snap, setSnap] = useState<LastStartDiagnostic | null>(() =>
    readLastStartDiagnostic(),
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setDiag(tutorialDebug.diagnostics());
      setSnap(readLastStartDiagnostic());
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  // Hide once the tutorial actually starts drawing a step.
  if (diag && diag.currentState === "showing_step") return null;

  const state = diag?.currentState ?? "—";
  const eligible = diag ? String(diag.eligible) : "—";
  const waiting = diag?.waitingReason ?? "—";
  const firstTargetExists = snap ? String(snap.firstTargetExists) : "—";

  return (
    <div
      dir="ltr"
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        color: "#fef3c7",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "6px 8px",
        borderRadius: 6,
        border: "1px solid #b45309",
        maxWidth: 260,
        pointerEvents: "none",
      }}
    >
      <div style={{ color: "#fbbf24", fontWeight: 700 }}>tutorial diag</div>
      <div>state: {state}</div>
      <div>eligible: {eligible}</div>
      <div>waiting: {waiting}</div>
      <div>autoStartRan: {__tutorialAutoStartTelemetry.autoStartEffectRan}</div>
      <div>reqStart: {__tutorialAutoStartTelemetry.requestStartCalled}</div>
      <div>reqStartResult: {__tutorialAutoStartTelemetry.lastRequestStartResult}</div>
      <div>firstTarget: {firstTargetExists}</div>
      <div>
        overlays: {snap?.externalOverlayStackSize ?? "—"}/
        {snap?.totalOverlayStackSize ?? "—"}
      </div>
      {snap && snap.overlayContributors.length > 0 ? (
        <div style={{ marginTop: 2 }}>
          {snap.overlayContributors.map((c) => (
            <div key={c.label}>· {c.label} × {c.count}</div>
          ))}
        </div>
      ) : null}
    </div>

  );
}
