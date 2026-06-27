import { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
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

/**
 * Android hardware back behavior:
 *   /encyclopedia/figures/123  → /encyclopedia/figures
 *   /encyclopedia/figures      → /encyclopedia
 *   /encyclopedia              → /
 *   /                          → Irth exit confirmation
 *
 * We always compute a parent path from the current URL rather than relying on
 * `canGoBack` / router history, which is unreliable on Capacitor WebView when
 * the user lands on a deep route via a notification, deep link, or reload.
 */

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const withoutIndex = withLeadingSlash === "/index.html" ? "/" : withLeadingSlash;
  return withoutIndex.replace(/\/+$/, "") || "/";
}

/**
 * Build set of registered route path patterns from the router. Patterns may
 * include `$param` placeholders (e.g. `/encyclopedia/figures/$slug`).
 */
function getRegisteredPatterns(router: ReturnType<typeof useRouter>): string[] {
  const routerAny = router as unknown as {
    flatRoutes?: Array<Record<string, unknown>>;
    routesById?: Record<string, Record<string, unknown>>;
    routesByPath?: Record<string, Record<string, unknown>>;
    routeTree?: Record<string, unknown>;
  };
  const set = new Set<string>();

  const addPath = (path: unknown) => {
    if (typeof path === "string" && path.startsWith("/")) {
      set.add(normalizePath(path));
    }
  };

  const visitRoute = (route: Record<string, unknown> | undefined) => {
    if (!route) return;
    addPath(route.fullPath);
    addPath(route.id);
    addPath(route.path);

    const children = route.children;
    if (Array.isArray(children)) {
      for (const child of children) visitRoute(child as Record<string, unknown>);
    } else if (children && typeof children === "object") {
      for (const child of Object.values(children)) visitRoute(child as Record<string, unknown>);
    }
  };

  routerAny.flatRoutes?.forEach((route) => visitRoute(route));
  Object.keys(routerAny.routesByPath ?? {}).forEach(addPath);
  Object.values(routerAny.routesByPath ?? {}).forEach((route) => visitRoute(route));
  Object.values(routerAny.routesById ?? {}).forEach((route) => visitRoute(route));
  visitRoute(routerAny.routeTree);

  // Keep Android back safe even if TanStack internals change shape in the
  // bundled WebView runtime. These are real app route patterns from src/routes.
  [
    "/",
    "/adventure",
    "/campaigns",
    "/campaigns/imported/$id",
    "/collection",
    "/encyclopedia",
    "/encyclopedia/entity/$id",
    "/encyclopedia/path/$id",
    "/encyclopedia/state/$id",
    "/encyclopedia/type/$type",
    "/games/$mode/$slug",
    "/investigations",
    "/profile",
  ].forEach(addPath);

  return Array.from(set);
}

function getRouterPathname(router: ReturnType<typeof useRouter>): string {
  const location = (router as unknown as { state?: { location?: { pathname?: string; href?: string } } }).state?.location;
  const pathname = normalizePath(location?.pathname || "/");
  if (pathname !== "/") return pathname;

  const hrefPath = location?.href?.split(/[?#]/)[0];
  return hrefPath ? normalizePath(hrefPath) : pathname;
}

function getWindowRoutePathname(): string {
  const pathname = normalizePath(window.location.pathname || "/");
  if (pathname !== "/") return pathname;

  // Defensive: some Android/WebView launches can keep the real app route in
  // the hash while pathname remains `/`. Use it only as a route source when it
  // clearly contains an absolute app path.
  const hashPath = window.location.hash.startsWith("#/") ? window.location.hash.slice(1) : "";
  return hashPath ? normalizePath(hashPath) : pathname;
}

function getMatchedRouteIds(router: ReturnType<typeof useRouter>): string[] {
  const matches = (router as unknown as { state?: { matches?: Array<{ routeId?: string; id?: string }> } }).state?.matches;
  if (!Array.isArray(matches)) return [];
  return matches.map((match) => String(match.routeId ?? match.id ?? "")).filter(Boolean);
}

function getDeepestMatchedPathname(router: ReturnType<typeof useRouter>): string {
  const matches = (router as unknown as {
    state?: { matches?: Array<{ pathname?: string; routeId?: string; id?: string }> };
  }).state?.matches;
  const deepest = Array.isArray(matches) ? matches[matches.length - 1] : undefined;
  const pathname = deepest?.pathname;
  const normalizedPathname = pathname ? normalizePath(pathname) : "/";

  const routeId = deepest?.routeId ?? deepest?.id;
  if (normalizedPathname !== "/") return normalizedPathname;
  return typeof routeId === "string" && routeId.startsWith("/") ? normalizePath(routeId) : "/";
}

function pickCurrentPath(windowPath: string, routerPath: string, matchedPath: string): string {
  if (windowPath !== "/") return windowPath;
  if (routerPath !== "/") return routerPath;
  if (matchedPath !== "/") return matchedPath;
  return "/";
}

function isRootPath(pathname: string): boolean {
  const clean = normalizePath(pathname);
  return clean === "/";
}

function getCandidateParents(pathname: string): string[] {
  const clean = normalizePath(pathname);
  if (isRootPath(clean)) return [];

  const parts = clean.split("/").filter(Boolean);
  const candidates: string[] = [];
  for (let length = parts.length - 1; length >= 0; length -= 1) {
    candidates.push(length === 0 ? "/" : normalizePath(`/${parts.slice(0, length).join("/")}`));
  }

  return Array.from(new Set(candidates));
}

function resolveParent(patterns: string[], pathname: string): {
  candidateParents: string[];
  registeredMatches: string[];
  selectedParent: string | null;
} {
  const clean = normalizePath(pathname);
  if (isRootPath(clean)) {
    return { candidateParents: [], registeredMatches: [], selectedParent: null };
  }

  // Segment parents first: /a/b/c → /a/b → /a → /
  // Only after building the full list do we verify against registered routes.
  const candidateParents = getCandidateParents(clean);
  const registeredMatches = candidateParents.filter((candidate) => isRegistered(patterns, candidate));

  return {
    candidateParents,
    registeredMatches,
    selectedParent: registeredMatches[0] ?? candidateParents[candidateParents.length - 1] ?? "/",
  };
}

function closeExitDialog(setConfirmOpen: (open: boolean) => void) {
  setConfirmOpen(false);
}

function logBackDecision(details: {
  currentPath: string;
  actualWindowPathname: string;
  routerPathname: string;
  normalizedPathname: string;
  matchedRouteIds: string[];
  candidateParents: string[];
  registeredMatches: string[];
  computedParentRoute: string | null;
  selectedParent: string | null;
  isRootRoute: boolean;
}) {
  console.log("[android:back] decision", details);
}

function assertCleanRegisteredParent(patterns: string[], parent: string): boolean {
  const cleanParent = normalizePath(parent);
  return cleanParent === parent && isRegistered(patterns, cleanParent);
}

async function pushRegisteredParent(router: ReturnType<typeof useRouter>, patterns: string[], parent: string) {
  if (!assertCleanRegisteredParent(patterns, parent)) {
    console.warn("[android:back] blocked unregistered parent", { parent });
    return;
  }

  console.log("[android:back] pushRegisteredParent=", parent);
  router.history.push(parent);
}

function patternMatches(pattern: string, pathname: string): boolean {
  const pp = pattern.split("/").filter(Boolean);
  const ap = pathname.split("/").filter(Boolean);
  // Allow splat
  const lastIsSplat = pp[pp.length - 1] === "$";
  if (!lastIsSplat && pp.length !== ap.length) return false;
  if (lastIsSplat && ap.length < pp.length - 1) return false;
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i];
    if (seg === "$") return true; // splat consumes rest
    if (seg.startsWith("$")) continue; // dynamic
    if (seg !== ap[i]) return false;
  }
  return true;
}

function isRegistered(patterns: string[], pathname: string): boolean {
  if (pathname === "/") return true;
  return patterns.some((p) => patternMatches(p, pathname));
}

export function AndroidBackHandler() {
  const router = useRouter();
  const latestRouterPathname = useRouterState({ select: (state) => normalizePath(state.location.pathname || "/") });
  const latestRouterPathnameRef = useRef(latestRouterPathname);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    latestRouterPathnameRef.current = latestRouterPathname;
  }, [latestRouterPathname]);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;

    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", async () => {
          const actualWindowPathname = window.location.pathname || "/";
          const windowRoutePathname = getWindowRoutePathname();
          const routerPathname = getRouterPathname(router);
          const latestObservedRouterPathname = latestRouterPathnameRef.current;
          const effectiveRouterPathname = latestObservedRouterPathname !== "/" ? latestObservedRouterPathname : routerPathname;
          const matchedPathname = getDeepestMatchedPathname(router);
          const path = pickCurrentPath(windowRoutePathname, effectiveRouterPathname, matchedPathname);
          const matchedRouteIds = getMatchedRouteIds(router);
          const patterns = getRegisteredPatterns(router);
          const parentResolution = resolveParent(patterns, path);
          const parent = parentResolution.selectedParent;
          const isRootRoute = isRootPath(path);

          logBackDecision({
            currentPath: path,
            actualWindowPathname,
            routerPathname,
            normalizedPathname: path,
            matchedRouteIds,
            candidateParents: parentResolution.candidateParents,
            registeredMatches: parentResolution.registeredMatches,
            computedParentRoute: parent,
            selectedParent: parent,
            isRootRoute,
          });

          if (isRootRoute) {
            console.log("[android:back] method=confirm-exit");
            setConfirmOpen(true);
            return;
          }

          if (!parent) {
            console.warn("[android:back] method=skip (no parent for non-root path)");
            return;
          }

          if (normalizePath(parent) === path) {
            console.warn("[android:back] method=skip (parent === normalizedPathname)");
            return;
          }

          try {
            await pushRegisteredParent(router, patterns, parent);
          } catch (e) {
            console.warn("[android:back] navigation failed", { parent, error: e });
          }
        });
        listenerHandle = handle;
        console.log("[android:back] listener registered");
      } catch (err) {
        console.error("[android:back] failed to register", err);
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [router]);

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir="rtl" className="border-amber-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-100">هل تريد الخروج من التطبيق؟</AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            ستُحفظ آخر رحلة لك، ويمكنك العودة في أي وقت.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => closeExitDialog(setConfirmOpen)} className="border-slate-700">لا</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                const { App } = await import("@capacitor/app");
                App.exitApp();
              } catch { /* ignore */ }
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
