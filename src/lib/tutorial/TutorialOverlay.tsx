// ============================================================
// Guided Tutorial — Overlay UI (Phase 2B)
// ------------------------------------------------------------
// Renders the dimmed backdrop, SVG spotlight cutout, coach-mark
// panel (Arabic RTL), and skip-confirmation dialog. Mounted from
// `TutorialProvider`'s children.
//
// Never installs its own Back listener: skip-confirm registers as a
// standard shadcn AlertDialog, and Back is forwarded through the
// unified Navigation Engine overlay LIFO.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { TUTORIAL_COPY } from "@/lib/tutorial/data";
import { useTutorial } from "@/lib/tutorial/engine";

// ------------------------------------------------------------
// Reduced-motion helper
// ------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

// ------------------------------------------------------------
// Coach-mark placement
// ------------------------------------------------------------

interface CoachMarkPos {
  top: number;
  /** rtl-friendly: we use `insetInlineStart`, but positioning is
   *  centered horizontally against the viewport. */
  left: number;
  width: number;
  arrow: "up" | "down";
}

const COACH_WIDTH = 320;
const COACH_MARGIN = 16;
const COACH_GAP = 14;
const COACH_HEIGHT_ESTIMATE = 190;

function computePlacement(
  rect: DOMRectReadOnly | null,
  preferred: "top" | "bottom" | "adaptive",
  vh: number,
  vw: number,
): CoachMarkPos {
  if (!rect) {
    return {
      top: Math.max(COACH_MARGIN, vh / 2 - COACH_HEIGHT_ESTIMATE / 2),
      left: Math.max(COACH_MARGIN, vw / 2 - COACH_WIDTH / 2),
      width: Math.min(COACH_WIDTH, vw - COACH_MARGIN * 2),
      arrow: "down",
    };
  }
  const width = Math.min(COACH_WIDTH, vw - COACH_MARGIN * 2);
  const centerX = rect.left + rect.width / 2;
  const left = Math.max(
    COACH_MARGIN,
    Math.min(vw - COACH_MARGIN - width, centerX - width / 2),
  );

  const spaceAbove = rect.top;
  const spaceBelow = vh - rect.bottom;

  let showAbove: boolean;
  if (preferred === "top") showAbove = true;
  else if (preferred === "bottom") showAbove = false;
  else showAbove = spaceAbove > spaceBelow;

  // Flip if not enough room and the other side has more.
  if (showAbove && spaceAbove < COACH_HEIGHT_ESTIMATE + COACH_GAP + COACH_MARGIN &&
      spaceBelow > spaceAbove) {
    showAbove = false;
  } else if (!showAbove &&
      spaceBelow < COACH_HEIGHT_ESTIMATE + COACH_GAP + COACH_MARGIN &&
      spaceAbove > spaceBelow) {
    showAbove = true;
  }

  const top = showAbove
    ? Math.max(COACH_MARGIN, rect.top - COACH_GAP - COACH_HEIGHT_ESTIMATE)
    : Math.min(
        vh - COACH_MARGIN - COACH_HEIGHT_ESTIMATE,
        rect.bottom + COACH_GAP,
      );

  return {
    top,
    left,
    width,
    arrow: showAbove ? "down" : "up",
  };
}

// ------------------------------------------------------------
// Overlay component
// ------------------------------------------------------------

export function TutorialOverlay() {
  const {
    api,
    config,
    snapshot,
    currentStep,
    targetRect,
    skipConfirmOpen,
    enabledOrdinal,
    enabledTotal,
  } = useTutorial();
  const reducedMotion = useReducedMotion();

  const [viewport, setViewport] = useState(() => ({
    w: typeof window === "undefined" ? 0 : window.innerWidth,
    h: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const active =
    snapshot.state !== "idle" &&
    snapshot.state !== "completed" &&
    snapshot.state !== "paused_by_overlay" &&
    currentStep != null;

  // Only reveal the dim + spotlight + coach-mark when the engine has
  // fully resolved a target for the current step. Rendering the dim
  // during `transitioning` / `locating_target` / `scrolling_to_target`
  // / `measuring_target` produces a dead opaque screen with no controls
  // — the exact freeze reported on Android for the Worlds step.
  const shouldRenderSpotlight =
    active && snapshot.state === "showing_step" && targetRect != null;
  const shouldRenderChrome = shouldRenderSpotlight;

  const placement = useMemo(
    () =>
      computePlacement(
        shouldRenderSpotlight ? targetRect : null,
        currentStep?.placement ?? "top",
        viewport.h,
        viewport.w,
      ),
    [shouldRenderSpotlight, targetRect, currentStep?.placement, viewport],
  );

  if (typeof document === "undefined") return null;
  if (!shouldRenderChrome && !skipConfirmOpen) return null;

  // Progress + prev/next flags derived from ENABLED steps only.
  // Disabled steps are invisible: they do not count toward the
  // progress denominator, cannot be reached with prev/next, and do
  // not affect the "first"/"last" affordance labels.
  const isFirstStep =
    snapshot.stepIndex != null && (enabledOrdinal ?? 0) <= 1;
  const isLastStep =
    snapshot.stepIndex != null &&
    enabledOrdinal != null &&
    enabledOrdinal >= enabledTotal;
  const stepCounter =
    enabledOrdinal != null && enabledTotal > 0
      ? TUTORIAL_COPY.stepCounter(enabledOrdinal, enabledTotal)
      : "";
  void config; // preserved for future debug-color styling

  const padding = currentStep?.padding ?? 8;

  // SVG mask: a full-viewport rect punched by the target rect.
  const cutoutX = targetRect ? targetRect.left - padding : 0;
  const cutoutY = targetRect ? targetRect.top - padding : 0;
  const cutoutW = targetRect ? targetRect.width + padding * 2 : 0;
  const cutoutH = targetRect ? targetRect.height + padding * 2 : 0;
  const cutoutR = 16;

  const transitionMs = reducedMotion ? 0 : 260;

  const node = (
    <div
      dir="rtl"
      aria-hidden={false}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {active && (
        <>
          {/* Dimmed backdrop with SVG cutout. */}
          <svg
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "auto",
              // `allowTargetInteraction: false` for every step means
              // the overlay always absorbs taps — no pass-through.
            }}
            aria-hidden="true"
          >
            <defs>
              <mask id="irth-tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                {shouldRenderSpotlight && (
                  <rect
                    x={cutoutX}
                    y={cutoutY}
                    width={cutoutW}
                    height={cutoutH}
                    rx={cutoutR}
                    ry={cutoutR}
                    fill="black"
                    style={{
                      transition: `all ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                    }}
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.72)"
              mask="url(#irth-tutorial-mask)"
            />
            {shouldRenderSpotlight && (
              <rect
                x={cutoutX}
                y={cutoutY}
                width={cutoutW}
                height={cutoutH}
                rx={cutoutR}
                ry={cutoutR}
                fill="none"
                stroke="rgba(244, 217, 139, 0.9)"
                strokeWidth={2}
                style={{
                  transition: `all ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                  filter: "drop-shadow(0 0 10px rgba(244, 217, 139, 0.35))",
                }}
              />
            )}
          </svg>

          {/* Coach-mark panel */}
          {currentStep && (
            <div
              role="dialog"
              aria-live="polite"
              aria-labelledby="irth-tutorial-title"
              aria-describedby="irth-tutorial-body"
              style={{
                position: "absolute",
                top: placement.top,
                insetInlineStart: placement.left,
                width: placement.width,
                pointerEvents: "auto",
                transition: reducedMotion
                  ? undefined
                  : `top ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1), inset-inline-start ${transitionMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease`,
                opacity: shouldRenderSpotlight ? 1 : 0,
              }}
              className="rounded-2xl border border-gold/40 bg-black/90 p-4 text-right shadow-2xl backdrop-blur"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] tracking-[0.2em] text-gold/80">
                  {stepCounter}
                </span>
                <button
                  type="button"
                  onClick={() => api.openSkipConfirm()}
                  className="text-[11px] text-white/60 underline decoration-dotted underline-offset-4 hover:text-white"
                >
                  {TUTORIAL_COPY.skip}
                </button>
              </div>
              <h2
                id="irth-tutorial-title"
                className="font-display text-base font-bold text-amber-50"
              >
                {currentStep.title}
              </h2>
              <p
                id="irth-tutorial-body"
                className="mt-1.5 text-sm leading-7 text-white/85"
              >
                {currentStep.body}
              </p>
              <div className="mt-3 flex flex-row-reverse items-center gap-2">
                <button
                  type="button"
                  onClick={() => (isLastStep ? api.finish() : api.next())}
                  className="rounded-full bg-gradient-gold px-4 py-2 text-[12px] font-bold text-primary-foreground shadow-gold"
                >
                  {isLastStep ? TUTORIAL_COPY.begin : TUTORIAL_COPY.next}
                </button>
                <button
                  type="button"
                  onClick={() => api.previous()}
                  disabled={isFirstStep}
                  className="rounded-full border border-white/20 px-4 py-2 text-[12px] text-white/80 disabled:opacity-40"
                >
                  {TUTORIAL_COPY.previous}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={skipConfirmOpen}
        onOpenChange={(open) => {
          if (!open) api.closeSkipConfirm();
        }}
      >
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>{TUTORIAL_COPY.skipConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {TUTORIAL_COPY.skipConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => api.closeSkipConfirm()}>
              {TUTORIAL_COPY.skipConfirmContinue}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => api.skip()}>
              {TUTORIAL_COPY.skipConfirmSkip}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return createPortal(node, document.body);
}
