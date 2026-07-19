// ============================================================
// Guided Tutorial — Engine (Phase 2B)
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
//   - extension hooks: onTutorialStarted, onStepChanged,
//     onTutorialSkipped, onTutorialCompleted  (no default impl)
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

import { useOverlayDismiss, useOverlayStackSize } from "@/lib/navigation";

import {
  IRTH_FIRST_TIME_TUTORIAL,
  TUTORIAL_TARGET_RESOLUTION_WINDOW_MS,
} from "./data";
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
  /** Confirmation dialog for skip is open. */
  skipConfirmOpen: boolean;
  /** Measured target rect, when in `showing_step`. */
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
  store.state = next;
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

// ------------------------------------------------------------
// Engine API factory
// ------------------------------------------------------------

function createEngine(store: InternalStore): TutorialEngineApi & {
  advanceToLocating(): void;
  setTargetRect(rect: DOMRectReadOnly | null): void;
  openSkipConfirm(): void;
  closeSkipConfirm(): void;
  isSkipConfirmOpen(): boolean;
} {
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
      transition(store, "armed");
      store.stepIndex = 0;
      fireHook(store.hooks, "onTutorialStarted", {
        id: store.config.id,
        version: store.config.version,
      });
      fireHook(store.hooks, "onStepChanged", {
        id: store.config.id,
        version: store.config.version,
        stepIndex: 0,
        stepId: store.config.steps[0]!.id,
        direction: "initial",
      });
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
      const last = store.config.steps.length - 1;
      if (store.stepIndex >= last) {
        // Natural finish.
        persistence.markCompleted(store.config.version);
        fireHook(store.hooks, "onTutorialCompleted", {
          id: store.config.id,
          version: store.config.version,
        });
        store.stepIndex = null;
        store.targetRect = null;
        transition(store, "completed");
        return;
      }
      const nextIndex = store.stepIndex + 1;
      store.stepIndex = nextIndex;
      store.targetRect = null;
      fireHook(store.hooks, "onStepChanged", {
        id: store.config.id,
        version: store.config.version,
        stepIndex: nextIndex,
        stepId: store.config.steps[nextIndex]!.id,
        direction: "forward",
      });
      transition(store, "transitioning");
      // Micro-task hop lets consumers render an interstitial before
      // we re-enter target-location.
      queueMicrotask(() => transition(store, "locating_target"));
    },
    previous() {
      if (store.stepIndex == null) return;
      if (store.stepIndex <= 0) return;
      const prevIndex = store.stepIndex - 1;
      store.stepIndex = prevIndex;
      store.targetRect = null;
      fireHook(store.hooks, "onStepChanged", {
        id: store.config.id,
        version: store.config.version,
        stepIndex: prevIndex,
        stepId: store.config.steps[prevIndex]!.id,
        direction: "backward",
      });
      transition(store, "transitioning");
      queueMicrotask(() => transition(store, "locating_target"));
    },
    skip() {
      const atStepIndex = store.stepIndex;
      persistence.markCompleted(store.config.version);
      fireHook(store.hooks, "onTutorialSkipped", {
        id: store.config.id,
        version: store.config.version,
        atStepIndex,
      });
      store.stepIndex = null;
      store.paused = false;
      store.pauseReason = null;
      store.skipConfirmOpen = false;
      store.targetRect = null;
      transition(store, "completed");
    },
    finish() {
      persistence.markCompleted(store.config.version);
      fireHook(store.hooks, "onTutorialCompleted", {
        id: store.config.id,
        version: store.config.version,
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
  };
}

// ------------------------------------------------------------
// React integration
// ------------------------------------------------------------

interface TutorialContextValue {
  api: ReturnType<typeof createEngine>;
  config: TutorialConfig;
  snapshot: TutorialEngineSnapshot;
  currentStep: TutorialStep | null;
  targetRect: DOMRectReadOnly | null;
  skipConfirmOpen: boolean;
  handleBack: () => void;
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

  const apiRef = useRef<ReturnType<typeof createEngine> | null>(null);
  if (apiRef.current == null) {
    apiRef.current = createEngine(store);
  }
  const api = apiRef.current;

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

  // First-launch choice flag: publish on mount and re-check on focus.
  useEffect(() => {
    refreshFirstLaunchChoiceFlag();
    const onFocus = () => refreshFirstLaunchChoiceFlag();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
      window.addEventListener("storage", onFocus);
      return () => {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("storage", onFocus);
      };
    }
    return undefined;
  }, []);

  // ------------------------------------------------------------
  // Eligibility inputs
  // ------------------------------------------------------------
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overlayStackSize = useOverlayStackSize();
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

  const [, forceEligibility] = useState(0);
  useEffect(
    () => subscribeEligibility(() => forceEligibility((n) => n + 1)),
    [],
  );

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
    // Overlays include our own skip-confirm dialog; ignore self.
    const externalCount = overlayStackSize - (skipConfirmOpen ? 1 : 0);
    if (running && externalCount > 0) {
      api.pause("overlay-open");
    } else if (paused && externalCount <= 0) {
      // Resume after two stable frames.
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
  // ------------------------------------------------------------
  useEffect(() => {
    if (persistence.hasCompleted(effectiveConfig.version)) return;
    const eligible = computeEligibility({
      pathname,
      overlayStackSize,
      homeStableFrames,
      documentVisible,
    });
    const s = api.getSnapshot();
    if (eligible && s.state === "idle") {
      api.requestStart();
    }
  }, [
    api,
    effectiveConfig.version,
    pathname,
    overlayStackSize,
    homeStableFrames,
    documentVisible,
    snap.state,
  ]);

  // ------------------------------------------------------------
  // Target locator + measurement
  // ------------------------------------------------------------
  const currentStep: TutorialStep | null =
    snap.stepIndex != null ? effectiveConfig.steps[snap.stepIndex] ?? null : null;

  useEffect(() => {
    if (!currentStep) return;
    if (snap.state !== "locating_target") return;
    if (snap.paused) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let scrollListener: (() => void) | null = null;
    let currentEl: HTMLElement | null = null;
    let cleanupScroll = () => {};

    const selector = `[data-tutorial-target="${currentStep.targetId}"]`;
    const start = performance.now();

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
      window.addEventListener("scroll", scrollListener, { passive: true, capture: true });
      window.addEventListener("resize", scrollListener, { passive: true });
      cleanupScroll = () => {
        if (scrollListener) {
          window.removeEventListener("scroll", scrollListener, {
            capture: true,
          } as unknown as EventListenerOptions);
          window.removeEventListener("resize", scrollListener);
        }
      };
      transition(store, "showing_step");
    };

    const tryResolve = () => {
      if (cancelled) return;
      const el = document.querySelector(selector) as HTMLElement | null;
      if (el) {
        if (currentStep.scroll === "into-view" ||
            currentStep.scroll === "into-view-smooth") {
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
          transition(store, "scrolling_to_target");
          // Two rAF barrier so the browser commits the scroll layout.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (cancelled) return;
              transition(store, "measuring_target");
              attachMeasurement(el);
            });
          });
        } else {
          transition(store, "measuring_target");
          attachMeasurement(el);
        }
        return;
      }
      const elapsed = performance.now() - start;
      if (elapsed >= TUTORIAL_TARGET_RESOLUTION_WINDOW_MS) {
        // Window elapsed.
        if (currentStep.skipIfTargetUnavailable ||
            currentStep.onMissingTarget === "skip") {
          // Silently advance.
          api.next();
        } else {
          // Wait indefinitely — keep polling at reduced frequency.
          window.setTimeout(tryResolve, 200);
        }
        return;
      }
      requestAnimationFrame(tryResolve);
    };

    tryResolve();

    return () => {
      cancelled = true;
      if (observer && currentEl) observer.disconnect();
      cleanupScroll();
    };
  }, [api, store, currentStep, snap.state, snap.paused]);

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
    if (s.stepIndex === 0) {
      api.openSkipConfirm();
      return;
    }
    api.previous();
  }, [api]);

  const dismisser = useCallback(() => {
    if (!running && !skipConfirmOpen) return;
    handleBack();
  }, [running, skipConfirmOpen, handleBack]);
  useOverlayDismiss(dismisser);

  const value = useMemo<TutorialContextValue>(
    () => ({
      api,
      config: effectiveConfig,
      snapshot: snap,
      currentStep,
      targetRect,
      skipConfirmOpen,
      handleBack,
    }),
    [
      api,
      effectiveConfig,
      snap,
      currentStep,
      targetRect,
      skipConfirmOpen,
      handleBack,
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export const FIRST_TIME_TUTORIAL = IRTH_FIRST_TIME_TUTORIAL;
