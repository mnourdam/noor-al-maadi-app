// ============================================================
// Guided Tutorial — Engine (Phase 2B.5)
// ------------------------------------------------------------
// Provides:
//   - state machine + snapshot pub/sub
//   - eligibility-driven auto-start
//   - target locator (rAF poll for `[data-tutorial-target]`)
//   - measurement (ResizeObserver + scroll listeners)
//   - step transitions (forward / backward / skip-if-unavailable)
//   - pause/resume driven by the overlay stack size
//   - Back integration via the unified Navigation Engine's LIFO
//   - Skip confirmation flow
//   - extension hooks (analyticsId propagated on every payload)
//   - Phase 2B.5: enabled-only navigation + jumpToStep + debug binding
//
// It does NOT install its own Android hardware-back listener.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useRouterState } from "@tanstack/react-router";

import { useOverlayDismiss, useOverlayEntries } from "@/lib/navigation";

import {
  IRTH_FIRST_TIME_TUTORIAL,
  TUTORIAL_TARGET_RESOLUTION_WINDOW_MS,
} from "./data";
import {
  registerTutorialDebugBinding,
  writeLastStartDiagnostic,
  __tutorialAutoStartTelemetry,
  logTutorialTransition,
  logTutorialEvent,
  resetPerStepInstrumentation,
  type AutoStartResult,
} from "./debug";
import { FIRST_TIME_TUTORIAL_ID, getTutorialConfig } from "./registry";
import * as persistence from "./persistence";
import {
  computeEligibility,
  refreshFirstLaunchChoiceFlag,
  subscribeEligibility,
} from "./eligibility";
import type {
  TutorialConfig,
  TutorialEngineApi,
  TutorialEngineSnapshot,
  TutorialEngineState,
  TutorialHooks,
  TutorialStep,
} from "./types";
import { validateTutorialConfigInDev } from "./validate";

// ------------------------------------------------------------
// Enabled-step algorithm
// ------------------------------------------------------------
//
// The engine keeps `stepIndex` as the RAW index into `config.steps`
// (this preserves stable step identity for analytics/persistence).
// Navigation, however, operates over the ENABLED subset:
//
//   • firstEnabledIndex(config)              → start point
//   • lastEnabledIndex(config)               → natural finish gate
//   • nextEnabledIndex(config, rawIndex)     → forward step or null
//   • previousEnabledIndex(config, rawIndex) → backward step or null
//   • enabledOrdinal(config, rawIndex)       → 1-based position among
//                                              enabled steps (progress
//                                              counter)
//
// Disabled steps are invisible: they cannot be shown, they cannot be
// stopped on, and they do not count toward the progress indicator.

function isStepEnabled(s: TutorialStep): boolean {
  return s.enabled === true;
}

function firstEnabledIndex(config: TutorialConfig): number | null {
  for (let i = 0; i < config.steps.length; i++) {
    if (isStepEnabled(config.steps[i]!)) return i;
  }
  return null;
}

function lastEnabledIndex(config: TutorialConfig): number | null {
  for (let i = config.steps.length - 1; i >= 0; i--) {
    if (isStepEnabled(config.steps[i]!)) return i;
  }
  return null;
}

function nextEnabledIndex(
  config: TutorialConfig,
  from: number,
): number | null {
  for (let i = from + 1; i < config.steps.length; i++) {
    if (isStepEnabled(config.steps[i]!)) return i;
  }
  return null;
}

function previousEnabledIndex(
  config: TutorialConfig,
  from: number,
): number | null {
  for (let i = from - 1; i >= 0; i--) {
    if (isStepEnabled(config.steps[i]!)) return i;
  }
  return null;
}

function enabledCount(config: TutorialConfig): number {
  let n = 0;
  for (const s of config.steps) if (isStepEnabled(s)) n++;
  return n;
}

function enabledOrdinal(
  config: TutorialConfig,
  rawIndex: number,
): number {
  let n = 0;
  for (let i = 0; i <= rawIndex && i < config.steps.length; i++) {
    if (isStepEnabled(config.steps[i]!)) n++;
  }
  return n;
}

// ------------------------------------------------------------
// Internal store
// ------------------------------------------------------------

interface InternalStore {
  config: TutorialConfig;
  state: TutorialEngineState;
  stepIndex: number | null;
  paused: boolean;
  pauseReason: string | null;
  preemptedFromShowing: boolean;
  skipConfirmOpen: boolean;
  targetRect: DOMRectReadOnly | null;
  listeners: Set<() => void>;
  hooks: TutorialHooks;
}

function notify(store: InternalStore) {
  for (const l of Array.from(store.listeners)) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

function snapshotOf(store: InternalStore): TutorialEngineSnapshot {
  return {
    state: store.state,
    stepIndex: store.stepIndex,
    paused: store.paused,
    version: store.config.version,
  };
}

function transition(store: InternalStore, next: TutorialEngineState) {
  if (store.state === next) return;
  const prev = store.state;
  store.state = next;
  try {
    logTutorialTransition(prev, next);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tutorial] logTutorialTransition threw:", err);
  }
  notify(store);
}

function fireHook<K extends keyof TutorialHooks>(
  hooks: TutorialHooks,
  name: K,
  ...args: Parameters<NonNullable<TutorialHooks[K]>>
) {
  const fn = hooks[name] as
    | ((...a: Parameters<NonNullable<TutorialHooks[K]>>) => void)
    | undefined;
  if (typeof fn === "function") {
    try {
      fn(...args);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[tutorial] extension hook threw:", err);
    }
  }
}

function fireStepChanged(
  store: InternalStore,
  rawIndex: number,
  direction: "forward" | "backward" | "initial",
) {
  const step = store.config.steps[rawIndex]!;
  try {
    resetPerStepInstrumentation(step.id);
    logTutorialEvent("step-changed", { reason: direction });
  } catch {
    /* ignore */
  }
  fireHook(store.hooks, "onStepChanged", {
    id: store.config.id,
    version: store.config.version,
    stepIndex: rawIndex,
    stepId: step.id,
    enabledOrdinal: enabledOrdinal(store.config, rawIndex),
    enabledTotal: enabledCount(store.config),
    analyticsId: step.analyticsId,
    direction,
  });
}

// ------------------------------------------------------------
// Engine API factory
// ------------------------------------------------------------

interface InternalEngine extends TutorialEngineApi {
  advanceToLocating(): void;
  setTargetRect(rect: DOMRectReadOnly | null): void;
  openSkipConfirm(): void;
  closeSkipConfirm(): void;
  isSkipConfirmOpen(): boolean;
}

function createEngine(store: InternalStore): InternalEngine {
  return {
    getSnapshot: () => snapshotOf(store),
    subscribe(listener) {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    requestStart() {
      if (store.state !== "idle") return;
      if (persistence.hasCompleted(store.config.version)) {
        transition(store, "completed");
        return;
      }
      const startIndex = firstEnabledIndex(store.config);
      if (startIndex == null) {
        // Validator should have caught this — belt & braces.
        transition(store, "completed");
        return;
      }
      transition(store, "armed");
      store.stepIndex = startIndex;
      const startStep = store.config.steps[startIndex]!;
      fireHook(store.hooks, "onTutorialStarted", {
        id: store.config.id,
        version: store.config.version,
        startAnalyticsId: startStep.analyticsId,
      });
      fireStepChanged(store, startIndex, "initial");
      transition(store, "locating_target");
    },
    advanceToLocating() {
      transition(store, "locating_target");
    },
    setTargetRect(rect) {
      store.targetRect = rect;
      notify(store);
    },
    openSkipConfirm() {
      if (store.skipConfirmOpen) return;
      store.skipConfirmOpen = true;
      notify(store);
    },
    closeSkipConfirm() {
      if (!store.skipConfirmOpen) return;
      store.skipConfirmOpen = false;
      notify(store);
    },
    isSkipConfirmOpen() {
      return store.skipConfirmOpen;
    },
    next() {
      if (store.stepIndex == null) return;
      const nextIdx = nextEnabledIndex(store.config, store.stepIndex);
      if (nextIdx == null) {
        // No more enabled steps → natural finish.
        const finalStep = store.config.steps[store.stepIndex]!;
        persistence.markCompleted(store.config.version);
        fireHook(store.hooks, "onTutorialCompleted", {
          id: store.config.id,
          version: store.config.version,
          finalAnalyticsId: finalStep.analyticsId,
        });
        store.stepIndex = null;
        store.targetRect = null;
        transition(store, "completed");
        return;
      }
      store.stepIndex = nextIdx;
      store.targetRect = null;
      fireStepChanged(store, nextIdx, "forward");
      transition(store, "transitioning");
      queueMicrotask(() => transition(store, "locating_target"));
    },
    previous() {
      if (store.stepIndex == null) return;
      const prevIdx = previousEnabledIndex(store.config, store.stepIndex);
      if (prevIdx == null) return;
      store.stepIndex = prevIdx;
      store.targetRect = null;
      fireStepChanged(store, prevIdx, "backward");
      transition(store, "transitioning");
      queueMicrotask(() => transition(store, "locating_target"));
    },
    skip() {
      const atStepIndex = store.stepIndex;
      const atStep =
        atStepIndex != null ? store.config.steps[atStepIndex] ?? null : null;
      persistence.markCompleted(store.config.version);
      fireHook(store.hooks, "onTutorialSkipped", {
        id: store.config.id,
        version: store.config.version,
        atStepIndex,
        atAnalyticsId: atStep?.analyticsId ?? null,
      });
      store.stepIndex = null;
      store.paused = false;
      store.pauseReason = null;
      store.skipConfirmOpen = false;
      store.targetRect = null;
      transition(store, "completed");
    },
    finish() {
      // Finish is only correct if we're on the last enabled step, but
      // we accept the caller's decision (used by natural completion
      // and by tutorialDebug.finish()).
      const lastIdx = lastEnabledIndex(store.config);
      const finalStep =
        lastIdx != null ? store.config.steps[lastIdx] ?? null : null;
      persistence.markCompleted(store.config.version);
      fireHook(store.hooks, "onTutorialCompleted", {
        id: store.config.id,
        version: store.config.version,
        finalAnalyticsId: finalStep?.analyticsId ?? "",
      });
      store.stepIndex = null;
      store.targetRect = null;
      transition(store, "completed");
    },
    forceClose() {
      store.stepIndex = null;
      store.paused = false;
      store.pauseReason = null;
      store.skipConfirmOpen = false;
      store.targetRect = null;
      transition(store, "idle");
    },
    pause(reason) {
      if (store.state === "idle" || store.state === "completed") return;
      if (store.paused) return;
      store.preemptedFromShowing = store.state === "showing_step";
      store.paused = true;
      store.pauseReason = reason;
      transition(store, "paused_by_overlay");
    },
    resume() {
      if (!store.paused) return;
      store.paused = false;
      store.pauseReason = null;
      store.preemptedFromShowing = false;
      transition(store, "locating_target");
    },
    jumpToStep(rawIndex) {
      if (
        !Number.isInteger(rawIndex) ||
        rawIndex < 0 ||
        rawIndex >= store.config.steps.length
      ) {
        throw new Error(
          `[tutorial] jumpToStep: rawIndex ${rawIndex} is out of range.`,
        );
      }
      const step = store.config.steps[rawIndex]!;
      if (!isStepEnabled(step)) {
        throw new Error(
          `[tutorial] jumpToStep: step "${step.id}" (index ${rawIndex}) is disabled.`,
        );
      }
      // Reset transient runtime state; keep persistence untouched so
      // debug jumping never marks the tutorial completed.
      store.stepIndex = rawIndex;
      store.targetRect = null;
      store.skipConfirmOpen = false;
      store.paused = false;
      store.pauseReason = null;
      fireStepChanged(store, rawIndex, "initial");
      transition(store, "locating_target");
    },
  };
}

// ------------------------------------------------------------
// React integration
// ------------------------------------------------------------

interface TutorialContextValue {
  api: InternalEngine;
  config: TutorialConfig;
  snapshot: TutorialEngineSnapshot;
  currentStep: TutorialStep | null;
  targetRect: DOMRectReadOnly | null;
  skipConfirmOpen: boolean;
  handleBack: () => void;
  /** 1-based ordinal of the current step among enabled steps.
   *  Null when the tutorial is idle/completed. */
  enabledOrdinal: number | null;
  /** Total number of enabled steps (progress counter denominator). */
  enabledTotal: number;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error(
      "[tutorial] useTutorial() called outside <TutorialProvider>.",
    );
  }
  return ctx;
}

export function useTutorialSnapshot(): TutorialEngineSnapshot {
  return useTutorial().snapshot;
}

export interface TutorialProviderProps {
  children: ReactNode;
  config?: TutorialConfig;
  hooks?: TutorialHooks;
}

export function TutorialProvider({
  children,
  config,
  hooks,
}: TutorialProviderProps) {
  const effectiveConfig = config ?? getTutorialConfig(FIRST_TIME_TUTORIAL_ID);

  // Dev-only validation on first mount. Throws loudly on misconfig.
  const validatedRef = useRef(false);
  if (!validatedRef.current) {
    validateTutorialConfigInDev(effectiveConfig);
    validatedRef.current = true;
  }

  const storeRef = useRef<InternalStore | null>(null);
  if (storeRef.current == null) {
    storeRef.current = {
      config: effectiveConfig,
      state: "idle",
      stepIndex: null,
      paused: false,
      pauseReason: null,
      preemptedFromShowing: false,
      skipConfirmOpen: false,
      targetRect: null,
      listeners: new Set(),
      hooks: hooks ?? {},
    };
  } else {
    storeRef.current.hooks = hooks ?? {};
  }
  const store = storeRef.current;

  const apiRef = useRef<InternalEngine | null>(null);
  if (apiRef.current == null) {
    apiRef.current = createEngine(store);
  }
  const api = apiRef.current;

  // Monotonically increasing ownership token for the target-locator
  // task. Every locator effect run captures a `taskId` from this ref;
  // any async continuation (rAF, setTimeout, ResizeObserver callback,
  // scroll handler, watchdog, nested rAFs) must verify it still owns
  // the ref before mutating engine state. Any mismatch means a newer
  // step has taken over and the continuation must return silently.
  const activeTaskIdRef = useRef(0);

  const [snap, setSnap] = useState<TutorialEngineSnapshot>(() =>
    snapshotOf(store),
  );
  const [targetRect, setTargetRectState] = useState<DOMRectReadOnly | null>(
    null,
  );
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  useEffect(() => {
    return api.subscribe(() => {
      setSnap(snapshotOf(store));
      setTargetRectState(store.targetRect);
      setSkipConfirmOpen(store.skipConfirmOpen);
    });
  }, [api, store]);

  // First-launch choice flag: publish on mount and re-check on focus,
  // storage (cross-tab), and same-document choice-resolved event.
  useEffect(() => {
    refreshFirstLaunchChoiceFlag();
    const onSignal = () => refreshFirstLaunchChoiceFlag();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onSignal);
      window.addEventListener("storage", onSignal);
      window.addEventListener("irth:first-launch-choice-resolved", onSignal);
      return () => {
        window.removeEventListener("focus", onSignal);
        window.removeEventListener("storage", onSignal);
        window.removeEventListener("irth:first-launch-choice-resolved", onSignal);
      };
    }
    return undefined;
  }, []);

  // ------------------------------------------------------------
  // Eligibility inputs
  // ------------------------------------------------------------
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Enumerate every overlay entry so we can (a) accurately exclude the
  // tutorial engine's OWN dismisser from "external" counts, and (b)
  // report every contributor individually in diagnostics.
  const overlayEntries = useOverlayEntries();
  const totalOverlayStackSize = overlayEntries.length;
  const overlayStackSize = useMemo(
    () => overlayEntries.filter((e) => e.label !== "TutorialEngine").length,
    [overlayEntries],
  );

  const [homeStableFrames, setHomeStableFrames] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible",
  );

  useEffect(() => {
    if (pathname !== "/") {
      setHomeStableFrames(0);
      return;
    }
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      const raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setHomeStableFrames(2);
      });
      (raf1 as unknown as { _raf2?: number })._raf2 = raf2;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      const raf2 = (raf1 as unknown as { _raf2?: number })._raf2;
      if (typeof raf2 === "number") cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  useEffect(() => {
    const onVis = () =>
      setDocumentVisible(document.visibilityState === "visible");
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    return undefined;
  }, []);

  // Eligibility flag bus is module-level state. When any flag flips
  // we bump `eligibilityTick` so effects that consume eligibility
  // (auto-start below) re-run — otherwise they'd see the flag values
  // captured on the last dep change and never observe the flip.
  const [eligibilityTick, setEligibilityTick] = useState(0);
  useEffect(
    () => subscribeEligibility(() => setEligibilityTick((n) => n + 1)),
    [],
  );


  // ------------------------------------------------------------
  // Debug binding — registers this engine with the module-level
  // debug controller. Diagnostics read from live state (no
  // duplicate bookkeeping).
  // ------------------------------------------------------------
  const envRef = useRef({
    pathname,
    overlayStackSize,
    homeStableFrames,
    documentVisible,
  });
  envRef.current = {
    pathname,
    overlayStackSize,
    homeStableFrames,
    documentVisible,
  };
  useEffect(() => {
    return registerTutorialDebugBinding({
      api,
      config: effectiveConfig,
      getState: () => store.state,
      getTargetRect: () => store.targetRect,
      getEnvInputs: () => envRef.current,
    });
  }, [api, effectiveConfig, store]);

  // ------------------------------------------------------------
  // Overlay-driven pause/resume (auth dialogs, etc.)
  // ------------------------------------------------------------
  useEffect(() => {
    const s = api.getSnapshot();
    const running =
      s.state !== "idle" &&
      s.state !== "completed" &&
      s.state !== "paused_by_overlay";
    const paused = s.state === "paused_by_overlay";
    const externalCount = overlayStackSize - (skipConfirmOpen ? 1 : 0);
    if (running && externalCount > 0) {
      api.pause("overlay-open");
    } else if (paused && externalCount <= 0) {
      let cancelled = false;
      const raf1 = requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          api.resume();
        });
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
      };
    }
    return undefined;
  }, [api, overlayStackSize, skipConfirmOpen, snap.state]);

  // ------------------------------------------------------------
  // Auto-start (eligibility)
  //
  // IMPORTANT: `computeEligibility` reads from the module-level
  // eligibility flag bus in addition to the env inputs below. We
  // must include `eligibilityTick` in the dep list so this effect
  // re-runs whenever a flag flips — otherwise the effect can be
  // permanently stuck on a stale "not eligible" decision even
  // after every real predicate becomes true.
  // ------------------------------------------------------------
  useEffect(() => {
    __tutorialAutoStartTelemetry.autoStartEffectRan += 1;
    const completed = persistence.hasCompleted(effectiveConfig.version);
    const envInputs = {
      pathname,
      overlayStackSize,
      homeStableFrames,
      documentVisible,
    };
    const eligible = computeEligibility(envInputs);
    const s = api.getSnapshot();
    let result: AutoStartResult;
    if (completed) {
      result = "skipped-completed";
    } else if (!eligible) {
      result = "skipped-not-eligible";
    } else if (s.state !== "idle") {
      result = "skipped-not-idle";
    } else {
      __tutorialAutoStartTelemetry.requestStartCalled += 1;
      api.requestStart();
      const after = api.getSnapshot();
      result = after.state === "idle" ? "invoked-still-idle" : "invoked";
    }
    __tutorialAutoStartTelemetry.lastRequestStartResult = result;
    // Persist a diagnostic snapshot capturing the EXACT values used
    // by this effect execution (not a later render's view).
    try {
      writeLastStartDiagnostic({
        reason: "auto-start-effect",
        pathname,
        overlayStackSize,
        totalOverlayStackSize,
        overlayLabels: overlayEntries.map((e) => e.label),
        homeStableFrames,
        documentVisible,
        engineState: s.state,
        eligible,
        completed,
        autoStartResult: result,
      });
    } catch {
      /* ignore */
    }

  }, [
    api,
    effectiveConfig.version,
    pathname,
    overlayStackSize,
    homeStableFrames,
    documentVisible,
    snap.state,
    eligibilityTick,
  ]);



  // ------------------------------------------------------------
  // Target locator + measurement
  // ------------------------------------------------------------
  const currentStep: TutorialStep | null =
    snap.stepIndex != null
      ? effectiveConfig.steps[snap.stepIndex] ?? null
      : null;

  // ------------------------------------------------------------
  // Target locator + measurement (single atomic task)
  //
  // LIFECYCLE OWNERSHIP:
  //   This effect owns the FULL sequence:
  //     locating_target → scrolling_to_target → measuring_target
  //                     → showing_step
  //   The effect must NOT be keyed to `snap.state` — the task itself
  //   drives state through those internal phases, and re-running on
  //   every phase change would cancel the rAF settle loop and the
  //   watchdog. The task's identity is (stepIndex, targetId, route,
  //   paused). Cancellation happens only when one of those changes,
  //   when the tutorial closes (currentStep === null), or on unmount.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!currentStep) return;
    if (snap.paused) return;
    if (pathname !== currentStep.route) return;
    // Only bootstrap when the engine is in a phase our task should
    // own. If it's already showing_step (e.g. re-render), do nothing.
    const initial = store.state;
    if (
      initial !== "locating_target" &&
      initial !== "armed" &&
      initial !== "transitioning" &&
      initial !== "scrolling_to_target" &&
      initial !== "measuring_target"
    ) {
      return;
    }

    let cancelled = false;
    let taskCompleted = false;
    let observer: ResizeObserver | null = null;
    let scrollListener: (() => void) | null = null;
    let currentEl: HTMLElement | null = null;
    let cleanupScroll = () => {};
    let rafHandle: number | null = null;
    let watchdogHandle: number | null = null;

    const selector = `[data-tutorial-target="${currentStep.targetId}"]`;
    const start = performance.now();
    const stepAnalyticsId = currentStep.analyticsId;

    // Per-step watchdog owns the WHOLE task lifetime (locating →
    // scrolling → measuring). Cleared only on showing_step, on
    // skip-forward, or on cancellation.
    const STEP_WATCHDOG_MS = 5000;
    logTutorialEvent("locator-effect-started", {
      reason: `selector=${selector}`,
      watchdogStarted: true,
    });
    watchdogHandle = window.setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn(
        `[tutorial] step watchdog fired for "${stepAnalyticsId}" — state=${store.state}, hasRect=${store.targetRect != null}. Skipping forward.`,
      );
      logTutorialEvent("watchdog-fired", {
        reason: `state=${store.state}, hasRect=${store.targetRect != null}`,
        apiNextCalled: true,
        watchdogFired: true,
      });
      api.next();
    }, STEP_WATCHDOG_MS);
    const clearWatchdog = () => {
      if (watchdogHandle != null) {
        clearTimeout(watchdogHandle);
        watchdogHandle = null;
      }
    };

    const rectValid = (r: DOMRect): boolean => {
      if (r.width <= 0 || r.height <= 0) return false;
      const vh =
        (typeof window !== "undefined" && window.visualViewport?.height) ||
        window.innerHeight;
      const vw =
        (typeof window !== "undefined" && window.visualViewport?.width) ||
        window.innerWidth;
      if (r.bottom < 0 || r.top > vh) return false;
      if (r.right < 0 || r.left > vw) return false;
      return true;
    };

    const attachMeasurement = (el: HTMLElement) => {
      currentEl = el;
      const measure = () => {
        if (cancelled) return;
        const rect = el.getBoundingClientRect();
        store.targetRect = rect;
        notify(store);
      };
      measure();

      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => measure());
        observer.observe(el);
      }
      scrollListener = () => measure();
      window.addEventListener("scroll", scrollListener, {
        passive: true,
        capture: true,
      });
      window.addEventListener("resize", scrollListener, { passive: true });
      cleanupScroll = () => {
        if (scrollListener) {
          window.removeEventListener("scroll", scrollListener, {
            capture: true,
          } as unknown as EventListenerOptions);
          window.removeEventListener("resize", scrollListener);
        }
      };
      clearWatchdog();
      taskCompleted = true;
      transition(store, "showing_step");
    };

    // Scroll-settle detector: sample the target rect on every rAF and
    // require it stable within tolerance for N consecutive frames.
    // Bounded safety timeout — never depends on `scrollend` (unreliable
    // on Android WebView).
    const SETTLE_TOLERANCE_PX = 0.75;
    const SETTLE_FRAMES = 3;
    const SETTLE_TIMEOUT_MS = 2000;

    const waitForSettle = (el: HTMLElement) => {
      transition(store, "scrolling_to_target");
      const settleStart = performance.now();
      let lastTop = el.getBoundingClientRect().top;
      let stableFrames = 0;

      const tick = () => {
        if (cancelled) return;
        const rect = el.getBoundingClientRect();
        if (Math.abs(rect.top - lastTop) <= SETTLE_TOLERANCE_PX) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }
        lastTop = rect.top;
        const elapsed = performance.now() - settleStart;
        const settled = stableFrames >= SETTLE_FRAMES;
        const timedOut = elapsed >= SETTLE_TIMEOUT_MS;
        if (settled || timedOut) {
          logTutorialEvent("settle-resolved", {
            reason: settled ? "stable-frames" : "timeout",
            scrollSettled: true,
          });
          requestAnimationFrame(() => {
            if (cancelled) return;
            requestAnimationFrame(() => {
              if (cancelled) return;
              transition(store, "measuring_target");
              const finalRect = el.getBoundingClientRect();
              if (!rectValid(finalRect)) {
                logTutorialEvent("rect-invalid-after-settle", {
                  reason: `rect=${JSON.stringify({ x: finalRect.x, y: finalRect.y, w: finalRect.width, h: finalRect.height })}`,
                });
                if (
                  currentStep.skipIfTargetUnavailable ||
                  currentStep.onMissingTarget === "skip"
                ) {
                  logTutorialEvent("api-next-called", {
                    reason: "invalid-rect+skip-if-unavailable",
                    apiNextCalled: true,
                  });
                  clearWatchdog();
                  taskCompleted = true;
                  api.next();
                  return;
                }
                logTutorialEvent("rect-invalid-no-skip", {
                  reason: "attaching-anyway (no skipIfTargetUnavailable)",
                });
              }
              attachMeasurement(el);
            });
          });
          return;
        }
        rafHandle = requestAnimationFrame(tick);
      };
      rafHandle = requestAnimationFrame(tick);
    };

    const tryResolve = () => {
      if (cancelled) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        logTutorialEvent("target-resolved", {
          reason: `scroll=${currentStep.scroll ?? "none"}`,
        });
        // Normalize to locating_target before advancing (we may
        // enter from `armed` or `transitioning`).
        if (store.state !== "locating_target") {
          transition(store, "locating_target");
        }
        if (
          currentStep.scroll === "into-view" ||
          currentStep.scroll === "into-view-smooth"
        ) {
          try {
            el.scrollIntoView({
              behavior:
                currentStep.scroll === "into-view-smooth" ? "smooth" : "auto",
              block: "center",
              inline: "center",
            });
          } catch {
            /* ignore */
          }
          waitForSettle(el);
        } else {
          transition(store, "measuring_target");
          attachMeasurement(el);
        }
        return;
      }
      const elapsed = performance.now() - start;
      if (elapsed >= TUTORIAL_TARGET_RESOLUTION_WINDOW_MS) {
        if (
          currentStep.skipIfTargetUnavailable ||
          currentStep.onMissingTarget === "skip"
        ) {
          logTutorialEvent("target-unresolved-skip", {
            reason: `elapsed=${Math.round(elapsed)}ms`,
            apiNextCalled: true,
          });
          clearWatchdog();
          taskCompleted = true;
          api.next();
        } else {
          logTutorialEvent("target-unresolved-retry", {
            reason: `elapsed=${Math.round(elapsed)}ms — no skipIfTargetUnavailable`,
          });
          window.setTimeout(tryResolve, 200);
        }
        return;
      }
      rafHandle = requestAnimationFrame(tryResolve);
    };

    tryResolve();

    return () => {
      cancelled = true;
      logTutorialEvent("locator-effect-cleanup", {
        reason: taskCompleted ? "task-completed" : `aborted-state=${store.state}`,
      });
      clearWatchdog();
      if (rafHandle != null) cancelAnimationFrame(rafHandle);
      if (observer && currentEl) observer.disconnect();
      cleanupScroll();
    };
    // Intentionally NOT depending on snap.state — the task drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, currentStep, snap.paused, pathname]);

  // ------------------------------------------------------------
  // Back integration
  // ------------------------------------------------------------
  const running =
    snap.state !== "idle" &&
    snap.state !== "completed" &&
    snap.state !== "paused_by_overlay";

  const handleBack = useCallback(() => {
    const s = api.getSnapshot();
    if (s.stepIndex == null) return;
    if (api.isSkipConfirmOpen()) {
      api.closeSkipConfirm();
      return;
    }
    // First-enabled-step check (not raw index 0) — if there's no
    // previous enabled step, this is the "first" step from the
    // player's perspective and Back should trigger skip-confirm.
    const prev = previousEnabledIndex(effectiveConfig, s.stepIndex);
    if (prev == null) {
      api.openSkipConfirm();
      return;
    }
    api.previous();
  }, [api, effectiveConfig]);

  // Occupy an overlay-stack slot only while the tutorial is an active
  // blocking surface: any non-idle / non-completed state (this covers
  // running steps, paused_by_overlay, and the skip-confirm dialog).
  // When idle or completed, the tutorial owns no back-affordance and
  // must not inflate overlayStackSize (which would deadlock its own
  // eligibility predicate).
  const tutorialActive =
    snap.state !== "idle" &&
    snap.state !== "completed";
  const dismisser = useCallback(() => {
    handleBack();
  }, [handleBack]);
  useOverlayDismiss(dismisser, "TutorialEngine", tutorialActive || skipConfirmOpen);


  const enabledTotal = useMemo(
    () => enabledCount(effectiveConfig),
    [effectiveConfig],
  );
  const ordinal =
    snap.stepIndex != null
      ? enabledOrdinal(effectiveConfig, snap.stepIndex)
      : null;

  const value = useMemo<TutorialContextValue>(
    () => ({
      api,
      config: effectiveConfig,
      snapshot: snap,
      currentStep,
      targetRect,
      skipConfirmOpen,
      handleBack,
      enabledOrdinal: ordinal,
      enabledTotal,
    }),
    [
      api,
      effectiveConfig,
      snap,
      currentStep,
      targetRect,
      skipConfirmOpen,
      handleBack,
      ordinal,
      enabledTotal,
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export const FIRST_TIME_TUTORIAL = IRTH_FIRST_TIME_TUTORIAL;
