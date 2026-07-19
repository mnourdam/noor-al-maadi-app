// ============================================================
// Guided Tutorial — Engine (Phase 2A scaffold)
// ------------------------------------------------------------
// This file ships the state-machine and integration contracts. It
// does NOT render:
//   - the spotlight overlay
//   - the coach-mark UI
//   - any Arabic copy
//
// It also does NOT add any new Android hardware-back listener,
// window.history handlers, or page-specific back fallbacks. Back
// integration is expressed exclusively via the existing Navigation
// Engine's overlay LIFO — the tutorial registers itself as a
// single overlay dismisser while running, so the unified engine
// forwards hardware Back into `handleBack()` below.
//
// The provider is safe to mount at the root: while `idle` it does
// nothing observable.
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

import { useOverlayDismiss } from "@/lib/navigation";

import {
  IRTH_FIRST_TIME_TUTORIAL,
} from "./data";
import { FIRST_TIME_TUTORIAL_ID, getTutorialConfig } from "./registry";
import * as persistence from "./persistence";
import {
  computeEligibility,
  refreshFirstLaunchChoiceFlag,
  subscribeEligibility,
} from "./eligibility";
import type {
  TutorialEngineApi,
  TutorialEngineSnapshot,
  TutorialEngineState,
  TutorialConfig,
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
  /** Recorded so `resume` can decide whether to restore
   *  `showing_step` after an overlay pause. */
  preemptedFromShowing: boolean;
  listeners: Set<() => void>;
}

function createStore(config: TutorialConfig): InternalStore {
  return {
    config,
    state: "idle",
    stepIndex: null,
    paused: false,
    pauseReason: null,
    preemptedFromShowing: false,
    listeners: new Set(),
  };
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

function snapshot(store: InternalStore): TutorialEngineSnapshot {
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

// ------------------------------------------------------------
// Engine API factory
// ------------------------------------------------------------

function createEngine(store: InternalStore): TutorialEngineApi {
  return {
    getSnapshot: () => snapshot(store),
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
    },
    next() {
      if (store.stepIndex == null) return;
      const last = store.config.steps.length - 1;
      if (store.stepIndex >= last) {
        // Natural finish
        persistence.markCompleted(store.config.version);
        store.stepIndex = null;
        transition(store, "completed");
        return;
      }
      store.stepIndex = store.stepIndex + 1;
      transition(store, "transitioning");
    },
    previous() {
      if (store.stepIndex == null) return;
      if (store.stepIndex <= 0) return; // Step 1 back is handled by caller
      store.stepIndex = store.stepIndex - 1;
      transition(store, "transitioning");
    },
    skip() {
      persistence.markCompleted(store.config.version);
      store.stepIndex = null;
      store.paused = false;
      store.pauseReason = null;
      transition(store, "completed");
    },
    finish() {
      persistence.markCompleted(store.config.version);
      store.stepIndex = null;
      transition(store, "completed");
    },
    forceClose() {
      // No persistence write per product spec.
      store.stepIndex = null;
      store.paused = false;
      store.pauseReason = null;
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
      // The engine returns to `locating_target` so the spotlight (a
      // later phase) re-measures the current step after two stable
      // frames. If nothing was showing we still fall back to
      // `locating_target` because measurements may be stale.
      store.preemptedFromShowing = false;
      transition(store, "locating_target");
    },
  };
}

// ------------------------------------------------------------
// React integration
// ------------------------------------------------------------

interface TutorialContextValue {
  api: TutorialEngineApi;
  snapshot: TutorialEngineSnapshot;
  /** Central back-handler used by the Navigation Engine's overlay
   *  dismiss stack while the tutorial is running. Returns nothing;
   *  side-effects are the engine transitions.
   *
   *  - Step 1 : opens the skip-confirmation flow (implemented in a
   *             later phase; currently a no-op safe stub).
   *  - Step 2+: `previous()`. */
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

/** Read-only access to the current snapshot. Safe to call anywhere. */
export function useTutorialSnapshot(): TutorialEngineSnapshot {
  return useTutorial().snapshot;
}

export interface TutorialProviderProps {
  children: ReactNode;
  /** Optional override for tests. Defaults to the first-time tour. */
  config?: TutorialConfig;
}

export function TutorialProvider({ children, config }: TutorialProviderProps) {
  const effectiveConfig = config ?? getTutorialConfig(FIRST_TIME_TUTORIAL_ID);

  const storeRef = useRef<InternalStore | null>(null);
  if (storeRef.current == null) {
    storeRef.current = createStore(effectiveConfig);
  }
  const store = storeRef.current;

  const apiRef = useRef<TutorialEngineApi | null>(null);
  if (apiRef.current == null) {
    apiRef.current = createEngine(store);
  }
  const api = apiRef.current;

  const [snap, setSnap] = useState<TutorialEngineSnapshot>(() => snapshot(store));

  useEffect(() => {
    const unsub = api.subscribe(() => setSnap(snapshot(store)));
    return unsub;
  }, [api, store]);

  // Publish the first-launch-choice flag on mount and keep it fresh
  // when the tab regains focus (choice may be recorded by another
  // subsystem between renders).
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
  // Eligibility-driven start
  // ------------------------------------------------------------
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [homeStableFrames, setHomeStableFrames] = useState(0);
  const [documentVisible, setDocumentVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  // Home-stable frame counter (raf x2 after landing on `/`).
  useEffect(() => {
    if (pathname !== "/") {
      setHomeStableFrames(0);
      return;
    }
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setHomeStableFrames(2);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
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

  // Overlay stack size: the Navigation Engine owns the stack but does
  // not currently export its size. For Phase 2A we treat "0" as the
  // steady-state and rely on our own pause/resume path (below) to
  // handle registered overlays. This value is left in the eligibility
  // predicate so a future stack-size accessor can be plugged in
  // without refactoring the engine.
  const overlayStackSize = 0;

  // Re-render when any eligibility flag changes so the effect below
  // re-runs with fresh state.
  const [, forceEligibility] = useState(0);
  useEffect(
    () => subscribeEligibility(() => forceEligibility((n) => n + 1)),
    [],
  );

  useEffect(() => {
    // Auto-arm on first eligible frame. Do not redirect deep-linked
    // sessions: if pathname !== "/" the predicate returns false and
    // the engine simply waits until the user visits Home naturally.
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
      // After `armed`, promote to `locating_target`. Actual DOM
      // measurement is wired in Phase 2B; Phase 2A merely records
      // the intent so the state graph is exercised end-to-end.
      queueMicrotask(() => {
        const cur = api.getSnapshot();
        if (cur.state === "armed") {
          store.stepIndex = 0;
          transition(store, "locating_target");
        }
      });
    }
  }, [
    api,
    store,
    effectiveConfig.version,
    pathname,
    overlayStackSize,
    homeStableFrames,
    documentVisible,
  ]);

  // ------------------------------------------------------------
  // Back integration via the unified Navigation Engine
  // ------------------------------------------------------------
  //
  // While the tutorial is actively running (any state other than
  // `idle` / `completed` / `paused_by_overlay`) it registers a
  // single overlay dismisser. The Navigation Engine's LIFO forwards
  // hardware Back to the topmost dismisser, so we get correct Back
  // handling for free — WITHOUT installing our own listener.
  const running =
    snap.state !== "idle" &&
    snap.state !== "completed" &&
    snap.state !== "paused_by_overlay";

  const handleBack = useCallback(() => {
    const s = api.getSnapshot();
    if (s.stepIndex == null) return;
    if (s.stepIndex === 0) {
      // Step 1 back → skip confirmation. The confirmation UI itself
      // lands in Phase 2B; for now the safe stub is a no-op so Back
      // is absorbed (the user cannot exit the app or the tour on
      // Step 1 by mashing Back).
      return;
    }
    api.previous();
  }, [api]);

  // The overlay dismiss hook is unconditional — enable/disable is
  // expressed via a stable dismisser that no-ops when not running.
  const dismisser = useCallback(() => {
    if (!running) return;
    handleBack();
  }, [running, handleBack]);
  useOverlayDismiss(dismisser);

  const value = useMemo<TutorialContextValue>(
    () => ({ api, snapshot: snap, handleBack }),
    [api, snap, handleBack],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

// ------------------------------------------------------------
// Convenience default export for the first-time tour config
// ------------------------------------------------------------

export const FIRST_TIME_TUTORIAL = IRTH_FIRST_TIME_TUTORIAL;
