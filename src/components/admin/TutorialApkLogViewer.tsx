// ============================================================
// Tutorial APK Log Viewer — floating in-app diagnostics button
// ------------------------------------------------------------
// Development/admin-only. Renders on the Home route inside the
// Capacitor Android WebView so we can read
// `irth.tutorial.transition-log.v1` from the SAME runtime where
// the tutorial freezes. Reads via the public tutorial API only —
// never modifies tutorial state.
//
// Visibility:
//   - Only mounted when running under Capacitor native platform.
//   - Only rendered when the signed-in user passes useAdminGuard.
//
// The floating trigger sits at z-index 2^31-1 so it stays clickable
// even when the tutorial dim layer / spotlight is up. The tutorial
// overlay uses much lower z-indices (see TutorialOverlay).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bug, Copy, Trash2, X, RefreshCw } from "lucide-react";

import { useAdminGuard } from "@/lib/admin-guard";
import {
  useTutorial,
  readTutorialTransitionLog,
  readRawTutorialTransitionLog,
  clearTutorialTransitionLog,
  useOverlayEntries,
  type TutorialTransitionEntry,
} from "@/lib/tutorial";
import { useOverlayStackSize } from "@/lib/navigation";

const TOP_Z = 2147483000; // above tutorial dim/spotlight (which uses ~50-1000)

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Prefer navigator.clipboard — works inside the Android WebView (Chrome-based)
  // when the page is served over https and has user gesture, which is our case.
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy fallback
  }
  // Legacy fallback via hidden textarea + execCommand("copy").
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatEntry(e: TutorialTransitionEntry): string {
  const head =
    e.kind === "transition"
      ? `#${e.seq} +${e.t}ms  ${e.previousState} → ${e.nextState}`
      : `#${e.seq} +${e.t}ms  [event] ${e.event}`;
  const step = `step=${e.currentStepId ?? "—"}(${e.currentStepIndex ?? "—"}) target=${e.targetId ?? "—"} rectOk=${e.targetResolved}`;
  const flags = `settled=${e.scrollSettled} skipIfUnavail=${e.skipIfTargetUnavailable} watchStart=${e.watchdogStarted} watchFired=${e.watchdogFired} apiNext=${e.apiNextCalled}`;
  const reason = e.reason ? `\n    reason: ${e.reason}` : "";
  return `${head}\n    ${step}\n    ${flags}${reason}`;
}

export function TutorialApkLogViewer() {
  const { allowed } = useAdminGuard();
  const isNative = useMemo(() => isCapacitorNative(), []);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const pollRef = useRef<number | null>(null);

  // Tutorial + overlay state via public hooks (safe: never mutates engine).
  const { snapshot } = useTutorial();
  const overlayEntries = useOverlayEntries();
  const totalOverlay = useOverlayStackSize();
  const externalOverlay = overlayEntries.filter(
    (e) => e.label !== "TutorialEngine",
  ).length;

  // Live-refresh the panel while it is open so freezes are visible.
  useEffect(() => {
    if (!open) return;
    pollRef.current = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open]);

  const entries = useMemo<TutorialTransitionEntry[]>(
    () => (open ? readTutorialTransitionLog() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, tick],
  );
  const raw = useMemo(
    () => (open ? readRawTutorialTransitionLog() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, tick],
  );

  const onCopy = useCallback(async () => {
    const payload = {
      capturedAt: new Date().toISOString(),
      tutorial: {
        currentState: snapshot.currentState,
        currentStepId: snapshot.currentStepId,
        currentStepIndex: snapshot.currentStepIndex,
        currentTargetId: snapshot.currentTargetId,
        currentTargetRect: snapshot.currentTargetRect
          ? {
              x: snapshot.currentTargetRect.x,
              y: snapshot.currentTargetRect.y,
              width: snapshot.currentTargetRect.width,
              height: snapshot.currentTargetRect.height,
            }
          : null,
        waitingReason: snapshot.waitingReason,
      },
      overlays: {
        total: totalOverlay,
        external: externalOverlay,
        labels: overlayEntries.map((e) => e.label),
      },
      rawByteLength: raw == null ? 0 : raw.length,
      entryCount: entries.length,
      transitionLog: entries,
    };
    const text = JSON.stringify(payload, null, 2);
    const ok = await copyToClipboard(text);
    if (ok) toast.success("تم نسخ السجل إلى الحافظة.");
    else toast.error("تعذّر نسخ السجل.");
  }, [snapshot, entries, raw, overlayEntries, totalOverlay, externalOverlay]);

  const onClear = useCallback(() => {
    clearTutorialTransitionLog();
    setTick((t) => t + 1);
    toast("تم مسح السجل.");
  }, []);

  if (!isNative || !allowed) return null;

  const rect = snapshot.currentTargetRect;
  const rectStr = rect
    ? `x:${Math.round(rect.x)} y:${Math.round(rect.y)} w:${Math.round(rect.width)} h:${Math.round(rect.height)}`
    : "—";

  return (
    <>
      {/* Floating trigger — always above the tutorial dim layer */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="تشخيص الجولة"
        className="fixed left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/70 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur"
        style={{ zIndex: TOP_Z, pointerEvents: "auto" }}
      >
        <Bug className="h-3.5 w-3.5" />
        تشخيص الجولة
      </button>

      {open && (
        <div
          className="fixed inset-0 flex flex-col bg-slate-950/95 p-3 text-slate-100"
          style={{ zIndex: TOP_Z + 1 }}
          role="dialog"
          aria-modal="true"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-200">
              <Bug className="h-4 w-4" />
              <h2 className="text-sm font-semibold">تشخيص الجولة (APK)</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
              aria-label="إغلاق"
            >
              <X className="h-3.5 w-3.5" />
              إغلاق
            </button>
          </div>

          <div className="mb-2 grid grid-cols-1 gap-1 rounded border border-slate-800 bg-slate-900/70 p-2 text-[11px] md:grid-cols-2">
            <Row k="currentState" v={snapshot.currentState} />
            <Row k="currentStepId" v={snapshot.currentStepId ?? "—"} />
            <Row k="currentTargetId" v={snapshot.currentTargetId ?? "—"} />
            <Row k="currentTargetRect" v={rectStr} />
            <Row k="waitingReason" v={snapshot.waitingReason ?? "—"} />
            <Row k="overlay total / external" v={`${totalOverlay} / ${externalOverlay}`} />
            <Row
              k="overlay labels"
              v={overlayEntries.map((e) => e.label).join(", ") || "—"}
            />
            <Row k="rawByteLength" v={String(raw == null ? 0 : raw.length)} />
            <Row k="entryCount" v={String(entries.length)} />
          </div>

          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopy()}
              className="inline-flex items-center gap-1 rounded border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100"
            >
              <Copy className="h-3.5 w-3.5" />
              نسخ السجل
            </button>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-xs text-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              مسح السجل
            </button>
            <button
              type="button"
              onClick={() => setTick((t) => t + 1)}
              className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث
            </button>
          </div>

          <pre
            dir="ltr"
            className="flex-1 overflow-auto whitespace-pre-wrap break-all rounded border border-slate-800 bg-slate-950/80 p-2 text-[11px] leading-relaxed text-sky-100"
          >
{entries.length > 0 ? entries.map(formatEntry).join("\n") : "— (empty)"}
          </pre>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400">{k}</span>
      <span dir="ltr" className="font-mono text-slate-100">{v}</span>
    </div>
  );
}
