// ============================================================
// Navigation Engine — Step 1 scaffold
// ------------------------------------------------------------
// This is the scaffold only. It:
//   - mounts a single React context provider
//   - runs the registry validator at boot (dev throws, prod warns)
//   - exposes the public API: useBack, useOverlayDismiss,
//     useNavigationOrigin, navigateWithOrigin
//
// It does NOT yet:
//   - take over the Android hardware-back listener
//   - (done) engine owns single hardware listener + exit dialog
//   - replace in-page back buttons
//
// Those are Steps 3–7 of the migration. Step 1 ships the engine
// so later steps can wire routes to it incrementally without
// changing behavior yet.
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
import { useRouter, useRouterState } from "@tanstack/react-router";

import type { NavigationOrigin, RouteId } from "./types";
import { NAVIGATION_REGISTRY, resolveDeclaration } from "./registry";
import {
  formatValidationReport,
  validateNavigationRegistry,
} from "./validate";
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


// -----------------------------
// Overlay dismiss stack
// -----------------------------

type OverlayDismisser = () => void;

export interface OverlayEntry {
  readonly label: string;
}

interface OverlayStack {
  push(fn: OverlayDismisser, label: string): () => void;
  popAndRun(): boolean;
  size(): number;
  entries(): readonly OverlayEntry[];
  subscribe(l: () => void): () => void;
}

interface InternalEntry {
  fn: OverlayDismisser;
  label: string;
}

function createOverlayStack(): OverlayStack {
  const stack: InternalEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch {
        /* ignore */
      }
    }
  };
  return {
    push(fn, label) {
      const entry: InternalEntry = { fn, label };
      stack.push(entry);
      emit();
      return () => {
        const idx = stack.lastIndexOf(entry);
        if (idx >= 0) {
          stack.splice(idx, 1);
          emit();
        }
      };
    },
    popAndRun() {
      const entry = stack.pop();
      if (!entry) return false;
      try {
        entry.fn();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[navigation] overlay dismisser threw:", err);
      }
      emit();
      return true;
    },
    size() {
      return stack.length;
    },
    entries() {
      return stack.map((e) => ({ label: e.label }));
    },
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}


// -----------------------------
// Origin registry (Priority 3)
// -----------------------------
// Keyed by the destination pathname; single-use.

interface OriginStore {
  set(destinationPath: string, origin: NavigationOrigin): void;
  take(destinationPath: string): NavigationOrigin | null;
}

function createOriginStore(): OriginStore {
  const map = new Map<string, NavigationOrigin>();
  return {
    set(dest, origin) {
      map.set(dest, origin);
    },
    take(dest) {
      const v = map.get(dest);
      if (v) map.delete(dest);
      return v ?? null;
    },
  };
}

// -----------------------------
// Cold-start signal (Priority 4)
// -----------------------------

interface ColdStartSignal {
  isColdStart(): boolean;
  consume(): void;
}

function createColdStartSignal(): ColdStartSignal {
  let cold = true;
  return {
    isColdStart: () => cold,
    consume: () => {
      cold = false;
    },
  };
}

// -----------------------------
// Context
// -----------------------------

interface NavigationEngine {
  overlays: OverlayStack;
  origins: OriginStore;
  coldStart: ColdStartSignal;
}

const NavigationEngineContext = createContext<NavigationEngine | null>(null);

function useEngine(): NavigationEngine {
  const engine = useContext(NavigationEngineContext);
  if (!engine) {
    throw new Error(
      "[navigation] useBack/useOverlayDismiss called outside <NavigationProvider>.",
    );
  }
  return engine;
}

// -----------------------------
// Provider
// -----------------------------

export interface NavigationProviderProps {
  children: ReactNode;
  /**
   * Optional list of route ids known to the router. When provided, the
   * validator will additionally check for unregistered / extra routes.
   * Callers pass `router.flatRoutes.map(r => r.id)` from `useRouter()`.
   */
  knownRouteIds?: readonly RouteId[];
}

export function NavigationProvider({
  children,
  knownRouteIds,
}: NavigationProviderProps) {
  const engine = useMemo<NavigationEngine>(
    () => ({
      overlays: createOverlayStack(),
      origins: createOriginStore(),
      coldStart: createColdStartSignal(),
    }),
    [],
  );

  // Runtime source of truth for cross-check: the router itself.
  // When the caller passes an explicit list we respect it; otherwise
  // we read `router.flatRoutes` — never a hand-maintained copy.
  const router = useRouter();
  const routerRouteIds = useMemo<readonly RouteId[] | undefined>(() => {
    if (knownRouteIds) return knownRouteIds;
    try {
      const flat = (router as unknown as {
        flatRoutes?: ReadonlyArray<{ id?: string; fullPath?: string }>;
      }).flatRoutes;
      if (!flat) return undefined;
      const ids: string[] = [];
      for (const r of flat) {
        const id = r.fullPath ?? r.id;
        if (id) ids.push(id);
      }
      return ids;
    } catch {
      return undefined;
    }
  }, [router, knownRouteIds]);

  // Validate on mount. Dev = throw so the developer notices immediately.
  // Prod = one structured diagnostic; do not crash normal users.
  useEffect(() => {
    const report = validateNavigationRegistry({ knownRouteIds: routerRouteIds });
    if (!report.ok) {
      const msg = formatValidationReport(report);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error(msg);
        throw new Error(
          "Navigation registry validation failed. See console for details.",
        );
      } else if (!prodLogged) {
        prodLogged = true;
        // eslint-disable-next-line no-console
        console.error("[navigation:registry-mismatch]", {
          issues: report.issues,
        });
      }
    }
  }, [routerRouteIds]);

  return (
    <NavigationEngineContext.Provider value={engine}>
      <ColdStartWatcher />
      <HardwareBackListener />
      <ExitConfirmDialog />
      {children}
    </NavigationEngineContext.Provider>
  );
}


// Prod-side one-shot log guard; validator must not spam.
let prodLogged = false;

/**
 * Flips the cold-start flag on the first in-app navigation so that
 * Priority 4 (deep-link fallback) is only used for the entry route.
 */
function ColdStartWatcher() {
  const engine = useEngine();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) engine.coldStart.consume();
  }, [pathname, engine]);
  return null;
}

// -----------------------------
// Public hooks
// -----------------------------

/**
 * Registers a dismisser while an overlay is open. On Back, the topmost
 * dismisser fires and routing is skipped. Automatically unregisters on
 * unmount.
 *
 * `label` is optional metadata (component name / overlay id) — reserved
 * for diagnostics tooling.
 *
 * `enabled` (default `true`) gates whether the dismisser is actually on
 * the stack. Callers that mount permanently (e.g. cinematic / tutorial
 * root providers) should pass `false` when the surface is inactive so
 * that `overlayStackSize` accurately reflects only real blocking
 * overlays. Toggling `enabled` transparently pushes / pops the entry;
 * hook ordering stays stable because the hook itself is always called.
 */
export function useOverlayDismiss(
  dismiss: OverlayDismisser,
  label?: string,
  enabled: boolean = true,
): void {
  const engine = useEngine();
  useEffect(() => {
    if (!enabled) return;
    return engine.overlays.push(dismiss, label ?? "unlabeled");
    // dismiss is captured by reference; callers wrap in useCallback if needed
  }, [engine, dismiss, label, enabled]);
}

/**
 * Reactive list of labels currently on the overlay stack. Order is
 * bottom → top. Useful for diagnostics and for consumers that need to
 * exclude their own entry (e.g. the tutorial engine must not count its
 * own dismisser as an "external" overlay).
 */
export function useOverlayEntries(): readonly OverlayEntry[] {
  const engine = useEngine();
  const [entries, setEntries] = useState<readonly OverlayEntry[]>(() =>
    engine.overlays.entries(),
  );
  useEffect(() => {
    setEntries(engine.overlays.entries());
    return engine.overlays.subscribe(() =>
      setEntries(engine.overlays.entries()),
    );
  }, [engine]);
  return entries;
}




/**
 * Reactive count of overlays currently registered on the LIFO stack.
 * Consumers (e.g. the tutorial engine's eligibility predicate) use
 * this to defer while any dialog / sheet / drawer / other overlay is
 * open. Updates on push / popAndRun / unregister.
 */
export function useOverlayStackSize(): number {
  const engine = useEngine();
  const [size, setSize] = useState<number>(() => engine.overlays.size());
  useEffect(() => {
    setSize(engine.overlays.size());
    return engine.overlays.subscribe(() => setSize(engine.overlays.size()));
  }, [engine]);
  return size;
}

/**
 * Reads / writes the navigation origin for the current route.
 * The engine consumes an origin exactly once, on the first Back.
 */
export function useNavigationOrigin() {
  const engine = useEngine();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useMemo(
    () => ({
      /** Peek without consuming. */
      peek: () => {
        const v = engine.origins.take(pathname);
        if (v) engine.origins.set(pathname, v);
        return v;
      },
      /** Manually stash an origin for the current pathname. */
      set: (origin: NavigationOrigin) => engine.origins.set(pathname, origin),
      /** Consume (used internally by useBack). */
      take: () => engine.origins.take(pathname),
    }),
    [engine, pathname],
  );
}

/**
 * Returns a setter that stashes an origin for an arbitrary destination
 * pathname (not just the current one). Used by `<LinkWithOrigin>` to
 * record where the user came from before the router commits the
 * navigation.
 */
export function useStashOrigin() {
  const engine = useEngine();
  return useCallback(
    (destinationPath: string, origin: NavigationOrigin) => {
      engine.origins.set(destinationPath, origin);
    },
    [engine],
  );
}

/**
 * Returns a `(destinationPath) => void` that captures the CURRENT route
 * (id + params + search) as the origin for `destinationPath`. Used by
 * shared card components (EncyclopediaCard, campaign/investigation
 * cards) so callers get contextual Back automatically without threading
 * an explicit `origin` prop through every list page.
 */
export function useStashCurrentAsOrigin() {
  const engine = useEngine();
  const router = useRouter();
  return useCallback(
    (destinationPath: string) => {
      try {
        const matches = router.state.matches;
        if (!matches || matches.length === 0) return;
        const last = matches[matches.length - 1] as {
          routeId?: string;
          id?: string;
          params?: Record<string, string>;
          search?: Record<string, unknown>;
        };
        const routeId = (last.routeId ?? last.id ?? "") as RouteId;
        if (!routeId || !resolveDeclaration(routeId)) return;
        engine.origins.set(destinationPath, {
          route: routeId,
          params: last.params,
          search: last.search,
        });
      } catch {
        /* ignore */
      }
    },
    [engine, router],
  );
}


/**
 * The ONLY sanctioned way to trigger Back from UI. Runs the resolution
 * algorithm documented in the architecture proposal (§2):
 *   1. overlay dismiss
 *   2. navigation origin (if supported by current route)
 *   3. parent route (from registry, params substituted)
 *   4. fallback route (cold-start deep link)
 *   5. root -> exit confirmation (delegated; scaffold only logs)
 */
export function useBack(): () => void {
  const engine = useEngine();
  const router = useRouter();
  const location = useRouterState({ select: (s) => s.location });

  return useCallback(() => {
    // Priority 1 — overlays
    if (engine.overlays.popAndRun()) return;

    const pathname = location.pathname;
    const routeId = matchRouteId(router, pathname);
    const decl = routeId ? resolveDeclaration(routeId) : null;

    if (!decl) {
      // eslint-disable-next-line no-console
      console.warn(
        `[navigation] No registry entry for "${pathname}" (routeId="${routeId ?? "?"}"). Falling back to "/".`,
      );
      void router.navigate({ to: "/", replace: true });
      return;
    }

    // Back-policy overrides (registry-declared, not scattered if-statements).
    const policy = decl.backPolicy ?? "normal";
    if (policy === "non_navigable") {
      // Off-screen / embed route — Back is intentionally ignored.
      return;
    }
    if (policy === "blocked_while_pending") {
      // Page owns navigation until its in-flight flow resolves.
      return;
    }
    if (policy === "force_target" && decl.backPolicyTarget) {
      void router.navigate({ to: decl.backPolicyTarget, replace: true } as never);
      return;
    }

    // Priority 5 — root triggers exit-confirm (wired in a later step).
    if (decl.isRoot) {
      dispatchExitConfirm();
      return;
    }

    const supportsOrigin = decl.supportsOriginOverride ?? decl.kind === "player";

    // Priority 3 — navigation origin (player routes only, by default)
    if (supportsOrigin) {
      const origin = engine.origins.take(pathname);
      if (origin) {
        void router.navigate({
          to: origin.route,
          params: origin.params,
          search: origin.search,
          replace: true,
        } as never);
        return;
      }
    }

    // Admin subtree: prefer real in-app history when it exists so that
    // deep drill-downs (list → detail → editor) unwind naturally, and
    // only fall back to the declared admin parent on cold starts.
    if (decl.kind === "admin" && !decl.isRoot) {
      if (!engine.coldStart.isColdStart()) {
        try {
          router.history.back();
          return;
        } catch {
          /* fall through to declared parent */
        }
      }
    }

    // Priority 2 — declared parent
    const parentId = decl.parentRoute;
    if (parentId) {
      const params = extractParamsForTarget(parentId, location.pathname, router);
      // Priority 4 folds into 2 here: parent is the same as fallback unless
      // the route explicitly declared a different one AND we are on a
      // cold-start deep link with no origin.
      const target =
        engine.coldStart.isColdStart() && decl.fallbackRoute
          ? decl.fallbackRoute
          : parentId;
      void router.navigate({ to: target, params, replace: true } as never);
      return;
    }

    // Safety net (validator should prevent reaching here)
    void router.navigate({ to: decl.kind === "admin" ? "/admin" : "/", replace: true });
  }, [engine, router, location]);
}

/**
 * Records a navigation origin and navigates to `to`. On the next Back
 * press from `to`, the engine returns to `origin` instead of the
 * declared parent.
 */
export function navigateWithOrigin(args: {
  router: ReturnType<typeof useRouter>;
  origin: NavigationOrigin;
  to: RouteId;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  engine: NavigationEngine;
}): Promise<void> {
  const { router, origin, to, params, search, engine } = args;
  // Approximate the destination pathname by substituting params into `to`.
  const destPath = substituteParams(to, params);
  engine.origins.set(destPath, origin);
  return router.navigate({ to, params, search } as never) as Promise<void>;
}

/**
 * Hook variant that captures the current router/engine and returns a
 * ready-to-use function.
 */
export function useNavigateWithOrigin() {
  const engine = useEngine();
  const router = useRouter();
  return useCallback(
    (args: {
      origin: NavigationOrigin;
      to: RouteId;
      params?: Record<string, string>;
      search?: Record<string, unknown>;
    }) => navigateWithOrigin({ router, engine, ...args }),
    [engine, router],
  );
}

// -----------------------------
// Exit-confirm signal + dialog
// -----------------------------
// The engine is the sole owner of exit confirmation. `useBack` fires the
// signal when Priority 5 (root exit) is reached; a single internal
// dialog subscribes and, on confirm, calls Capacitor `App.exitApp()`.
const EXIT_CONFIRM_EVENT = "irth:navigation:exit-confirm";

function dispatchExitConfirm() {
  try {
    window.dispatchEvent(new CustomEvent(EXIT_CONFIRM_EVENT));
  } catch {
    /* SSR / non-DOM */
  }
}

function ExitConfirmDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onSignal = () => setOpen(true);
    window.addEventListener(EXIT_CONFIRM_EVENT, onSignal);
    return () => window.removeEventListener(EXIT_CONFIRM_EVENT, onSignal);
  }, []);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent dir="rtl" className="border-amber-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-100">
            هل تريد الخروج من التطبيق؟
          </AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            ستُحفظ آخر رحلة لك، ويمكنك العودة في أي وقت.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => setOpen(false)}
            className="border-slate-700"
          >
            لا
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                const { App } = await import("@capacitor/app");
                App.exitApp();
              } catch {
                /* ignore */
              }
            }}
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            نعم
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The sole Capacitor `App.backButton` listener in the application.
 * Forwards every hardware Back press to the engine's `useBack()`.
 */
function HardwareBackListener() {
  const back = useBack();
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      .Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("backButton", () => back());
        if (cancelled) h.remove();
        else handle = h;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[navigation] failed to register hardware back listener", err);
      }
    })();
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [back]);
  return null;
}


// -----------------------------
// Helpers
// -----------------------------

/**
 * Best-effort mapping of a pathname to a registry route id.
 *
 * Preference order:
 *   1. `router.state.matches` — TanStack knows the exact route id.
 *   2. Registry-based pattern match on the pathname.
 *
 * The router-based path is authoritative when available.
 */
function matchRouteId(
  router: ReturnType<typeof useRouter>,
  pathname: string,
): RouteId | null {
  try {
    const matches = router.state.matches;
    if (matches && matches.length > 0) {
      // Deepest match wins.
      const last = matches[matches.length - 1];
      const id = (last as { routeId?: string; id?: string }).routeId
        ?? (last as { id?: string }).id
        ?? null;
      if (id && resolveDeclaration(id)) return id;
    }
  } catch {
    /* fall through */
  }
  return matchIdFromPathname(pathname);
}

function matchIdFromPathname(pathname: string): RouteId | null {
  // Walk the registry once; longer patterns win.
  let best: { id: RouteId; score: number } | null = null;
  for (const decl of iterAllDeclarations()) {
    const score = scorePatternMatch(decl.id, pathname);
    if (score === -1) continue;
    if (!best || score > best.score) best = { id: decl.id, score };
  }
  return best?.id ?? null;
}

function scorePatternMatch(pattern: string, pathname: string): number {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  if (p.length !== s.length && !(pattern === "/" && pathname === "/")) return -1;
  if (pattern === "/") return pathname === "/" ? 0 : -1;
  let score = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith("$")) continue;
    if (p[i] !== s[i]) return -1;
    score += 1;
  }
  return score;
}

function extractParamsForTarget(
  targetPattern: string,
  currentPathname: string,
  router: ReturnType<typeof useRouter>,
): Record<string, string> | undefined {
  // Try router first — it has typed params for the current match.
  try {
    const matches = router.state.matches;
    if (matches && matches.length > 0) {
      const merged: Record<string, string> = {};
      for (const m of matches) {
        const params = (m as { params?: Record<string, string> }).params;
        if (params) Object.assign(merged, params);
      }
      // Only keep params the target actually needs.
      const need = extractParamNames(targetPattern);
      if (need.length === 0) return undefined;
      const out: Record<string, string> = {};
      for (const key of need) {
        if (merged[key] != null) out[key] = String(merged[key]);
      }
      if (Object.keys(out).length === need.length) return out;
    }
  } catch {
    /* fall through */
  }
  // Fallback: try to lift them from the current pathname.
  return liftParamsFromPathname(targetPattern, currentPathname);
}

function extractParamNames(pattern: string): string[] {
  return pattern
    .split("/")
    .filter((seg) => seg.startsWith("$"))
    .map((seg) => seg.slice(1));
}

function liftParamsFromPathname(
  targetPattern: string,
  currentPathname: string,
): Record<string, string> | undefined {
  // Only works when the current pathname is a descendant of the target.
  const t = targetPattern.split("/").filter(Boolean);
  const c = currentPathname.split("/").filter(Boolean);
  if (t.length > c.length) return undefined;
  const out: Record<string, string> = {};
  for (let i = 0; i < t.length; i++) {
    const seg = t[i];
    if (seg.startsWith("$")) out[seg.slice(1)] = c[i];
    else if (seg !== c[i]) return undefined;
  }
  return Object.keys(out).length ? out : undefined;
}

function substituteParams(
  pattern: string,
  params: Record<string, string> | undefined,
): string {
  if (!params) return pattern;
  return pattern
    .split("/")
    .map((seg) => (seg.startsWith("$") ? (params[seg.slice(1)] ?? seg) : seg))
    .join("/");
}

function* iterAllDeclarations() {
  for (const decl of NAVIGATION_REGISTRY) yield decl;
}
