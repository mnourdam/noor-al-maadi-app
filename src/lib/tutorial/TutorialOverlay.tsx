// ============================================================
// Guided Tutorial — Overlay UI (Presentation Polish)
// ------------------------------------------------------------
// Renders one persistent dimmed backdrop, an SVG spotlight cutout
// that smoothly morphs between step targets, an Arabic RTL
// coach-mark that crossfades between steps, and the skip-
// confirmation dialog. Mounted from `TutorialProvider`'s children.
//
// Presentation phases are derived locally from engine state — the
// engine state machine is unmodified. The dim layer is only
// unmounted when the tutorial is truly idle/completed; every
// transition between steps keeps the dim stable and only animates
// the spotlight cutout position and the coach-mark opacity.
//
// The final `finishing` state (entered on natural completion via
// "ابدأ الرحلة" or debug finish) fades the spotlight/coach-mark
// out, scrolls the Home page smoothly back to `scrollY = 0`,
// then fades the dim away and closes the overlay by calling
// `api.completeAfterFinishing()`.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";

import { TUTORIAL_COPY } from "@/lib/tutorial/data";
import { useTutorial } from "@/lib/tutorial/engine";

// ------------------------------------------------------------
// Timings (short, eased, non-flashy)
// ------------------------------------------------------------

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
// CoachMark: fast fade so step-to-step feels continuous.
const COACH_FADE_MS = 160;
// Spotlight cutout morph between step rects.
const SPOTLIGHT_MORPH_MS = 180;
// Dim layer: only fades in on first show / out on finish.
const DIM_FADE_MS = 220;
// Finish sequence timings.
const FINISH_FADE_OUT_MS = 180; // spotlight + coachmark fade out
const FINISH_SCROLL_HOLD_MS = 520; // wait for smooth scroll to progress before fading dim
const FINISH_DIM_FADE_MS = 260;
const FINISH_TOTAL_MS =
  FINISH_FADE_OUT_MS + FINISH_SCROLL_HOLD_MS + FINISH_DIM_FADE_MS;
// Post-transition button lock-out to prevent double taps.
const BUTTON_LOCK_MS = 120;

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

  if (
    showAbove &&
    spaceAbove < COACH_HEIGHT_ESTIMATE + COACH_GAP + COACH_MARGIN &&
    spaceBelow > spaceAbove
  ) {
    showAbove = false;
  } else if (
    !showAbove &&
    spaceBelow < COACH_HEIGHT_ESTIMATE + COACH_GAP + COACH_MARGIN &&
    spaceAbove > spaceBelow
  ) {
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

  // ---- Derived presentation state ----
  const state = snapshot.state;
  const finishing = state === "finishing";
  const active =
    state !== "idle" && state !== "completed" && state !== "paused_by_overlay";
  // Dim renders whenever the tutorial is active (including all
  // internal locate/scroll/measure phases and finishing). It is only
  // faded out at the very end of the finish sequence.
  const dimVisible = active;

  // The coach-mark is only fully visible while the engine has a
  // resolved target for the current step. Anything else fades it
  // toward opacity 0 while the dim/spotlight remain stable.
  const showingStep = state === "showing_step" && targetRect != null;
  const coachVisible = showingStep && !finishing;

  // Persist the last known target rect so the spotlight cutout can
  // morph continuously between steps (or fade out gracefully during
  // scrolling / finishing) instead of disappearing to a zero-size
  // rect and re-materializing. When we don't yet have a rect at all
  // (very first step), the spotlight stays hidden until targetRect
  // arrives.
  const [lastRect, setLastRect] = useState<DOMRectReadOnly | null>(null);
  useEffect(() => {
    if (targetRect) setLastRect(targetRect);
  }, [targetRect]);
  useEffect(() => {
    if (!active) setLastRect(null);
  }, [active]);
  const spotlightRect = targetRect ?? lastRect;
  const spotlightVisible =
    active && !finishing && spotlightRect != null;

  // ---- Finish sequence: scroll home to top, then close ----
  const finishSeqRef = useRef<{ ran: boolean }>({ ran: false });
  useEffect(() => {
    if (!finishing) {
      finishSeqRef.current.ran = false;
      return;
    }
    if (finishSeqRef.current.ran) return;
    finishSeqRef.current.ran = true;

    // Trigger the scroll immediately so the smooth animation runs in
    // parallel with the spotlight/coach-mark fade-out.
    try {
      if (typeof window !== "undefined") {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: reducedMotion ? "auto" : "smooth",
        });
      }
    } catch {
      try {
        window.scrollTo(0, 0);
      } catch {
        /* ignore */
      }
    }

    if (reducedMotion) {
      // Skip through the fade timings — snap-close.
      const t = window.setTimeout(() => {
        api.completeAfterFinishing();
      }, 60);
      return () => window.clearTimeout(t);
    }

    const t = window.setTimeout(() => {
      api.completeAfterFinishing();
    }, FINISH_TOTAL_MS);
    return () => window.clearTimeout(t);
  }, [finishing, reducedMotion, api]);

  // ---- Button interaction lock (prevents double-tap on transitions) ----
  const [buttonLocked, setButtonLocked] = useState(false);
  const lockButtons = () => {
    setButtonLocked(true);
    window.setTimeout(() => setButtonLocked(false), BUTTON_LOCK_MS);
  };

  // ---- Compute placement from the CURRENT step's real rect only ----
  const placement = useMemo(
    () =>
      computePlacement(
        showingStep ? targetRect : null,
        currentStep?.placement ?? "top",
        viewport.h,
        viewport.w,
      ),
    [showingStep, targetRect, currentStep?.placement, viewport],
  );

  if (typeof document === "undefined") return null;
  if (!active && !skipConfirmOpen) return null;

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

  const padding = currentStep?.padding ?? 8;
  const r = spotlightRect;
  const cutoutX = r ? r.left - padding : 0;
  const cutoutY = r ? r.top - padding : 0;
  const cutoutW = r ? r.width + padding * 2 : 0;
  const cutoutH = r ? r.height + padding * 2 : 0;
  const cutoutR = 16;

  // ---- Opacities (drive every visual phase from state) ----
  // Dim: fully opaque while active; fades out during finishing.
  const dimOpacity = dimVisible ? (finishing ? 0 : 1) : 0;
  const spotlightOpacity = spotlightVisible ? 1 : 0;
  const coachOpacity = coachVisible ? 1 : 0;

  const morphTransition = reducedMotion
    ? "none"
    : `x ${SPOTLIGHT_MORPH_MS}ms ${EASE}, y ${SPOTLIGHT_MORPH_MS}ms ${EASE}, width ${SPOTLIGHT_MORPH_MS}ms ${EASE}, height ${SPOTLIGHT_MORPH_MS}ms ${EASE}, opacity ${FINISH_FADE_OUT_MS}ms ${EASE}`;

  const coachTransition = reducedMotion
    ? "opacity 60ms linear"
    : `opacity ${COACH_FADE_MS}ms ${EASE}, top ${SPOTLIGHT_MORPH_MS}ms ${EASE}, inset-inline-start ${SPOTLIGHT_MORPH_MS}ms ${EASE}`;

  const dimTransition = reducedMotion
    ? "none"
    : `opacity ${finishing ? FINISH_DIM_FADE_MS : DIM_FADE_MS}ms ${EASE} ${
        finishing ? `${FINISH_FADE_OUT_MS + FINISH_SCROLL_HOLD_MS}ms` : "0ms"
      }`;

  // While transitioning, the coach-mark is faded to 0 — freeze its
  // buttons regardless of the lock. Also freeze during the finishing
  // fade-out to prevent last-frame double taps.
  const buttonsInteractive = coachVisible && !buttonLocked && !skipConfirmOpen;

  const node = (
    <div
      dir="rtl"
      aria-hidden={false}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        // The root must remain pointer-interactive while the skip dialog
        // is open; only the tutorial layers beneath are made inert. The
        // dialog itself is portaled to document.body, above this root.
        pointerEvents: active || skipConfirmOpen ? "auto" : "none",
      }}
    >
      {active && (
        <>
          {/* Persistent dim + morphing spotlight cutout. */}
          <svg
            width="100%"
            height="100%"
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: skipConfirmOpen ? "none" : "auto",
              opacity: dimOpacity,
              transition: dimTransition,
            }}
            aria-hidden="true"
          >
            <defs>
              <mask id="irth-tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  rx={cutoutR}
                  ry={cutoutR}
                  fill="black"
                  style={{
                    x: `${cutoutX}px`,
                    y: `${cutoutY}px`,
                    width: `${cutoutW}px`,
                    height: `${cutoutH}px`,
                    opacity: spotlightOpacity,
                    transition: morphTransition,
                  }}
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.72)"
              mask="url(#irth-tutorial-mask)"
            />
            <rect
              rx={cutoutR}
              ry={cutoutR}
              fill="none"
              stroke="rgba(244, 217, 139, 0.9)"
              strokeWidth={2}
              style={{
                x: `${cutoutX}px`,
                y: `${cutoutY}px`,
                width: `${cutoutW}px`,
                height: `${cutoutH}px`,
                opacity: spotlightOpacity,
                transition: morphTransition,
                filter: "drop-shadow(0 0 10px rgba(244, 217, 139, 0.35))",
              }}
            />
          </svg>

          {/* Coach-mark panel — always mounted while active, fades between steps. */}
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
                pointerEvents:
                  coachVisible && !skipConfirmOpen ? "auto" : "none",
                opacity: coachOpacity,
                transition: coachTransition,
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
                  disabled={!buttonsInteractive}
                  className="text-[11px] text-white/60 underline decoration-dotted underline-offset-4 hover:text-white disabled:opacity-40"
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
                  onClick={() => {
                    if (!buttonsInteractive) return;
                    lockButtons();
                    if (isLastStep) api.finish();
                    else api.next();
                  }}
                  disabled={!buttonsInteractive}
                  className="rounded-full bg-gradient-gold px-4 py-2 text-[12px] font-bold text-primary-foreground shadow-gold disabled:opacity-60"
                >
                  {isLastStep ? TUTORIAL_COPY.begin : TUTORIAL_COPY.next}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!buttonsInteractive) return;
                    lockButtons();
                    api.previous();
                  }}
                  disabled={!buttonsInteractive || isFirstStep}
                  className="rounded-full border border-white/20 px-4 py-2 text-[12px] text-white/80 disabled:opacity-40"
                >
                  {TUTORIAL_COPY.previous}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/*
       * Skip-confirmation.
       *
       * Rendered with Radix primitives directly (not the shadcn wrapper)
       * and portaled to document.body. This keeps the dialog outside the
       * tutorial root's pointer-event contract, avoiding ancestor-level
       * pointer blocking in Android WebViews. The tutorial dim already
       * darkens the scene; we only add a subtle additional wash.
       *
       * Layer hierarchy:
       *   - tutorial root: z-index 2000
       *   - coach-mark: DOM layer inside root (above SVG)
       *   - skip-confirm backdrop: z-index 2100
       *   - skip-confirm content: z-index 2101
       */}
      <AlertDialogPrimitive.Root
        open={skipConfirmOpen}
        onOpenChange={(open) => {
          if (!open) api.closeSkipConfirm();
        }}
      >
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
            style={{ zIndex: 2100, pointerEvents: "auto" }}
          />
          <AlertDialogPrimitive.Content
            dir="rtl"
            style={{ zIndex: 2101, pointerEvents: "auto" }}
            className={cn(
              "fixed left-1/2 top-1/2 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 text-right shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <div className="flex flex-col space-y-2">
              <AlertDialogPrimitive.Title className="text-lg font-semibold">
                {TUTORIAL_COPY.skipConfirmTitle}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
                {TUTORIAL_COPY.skipConfirmBody}
              </AlertDialogPrimitive.Description>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
              <AlertDialogPrimitive.Cancel
                onClick={() => api.closeSkipConfirm()}
                className="mt-2 inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:mt-0"
              >
                {TUTORIAL_COPY.skipConfirmContinue}
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action
                onClick={() => api.skip()}
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {TUTORIAL_COPY.skipConfirmSkip}
              </AlertDialogPrimitive.Action>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialogPrimitive.Root>
    </div>
  );

  return createPortal(node, document.body);
}
