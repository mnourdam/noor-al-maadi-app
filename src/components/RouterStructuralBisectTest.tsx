// ============================================================
// RouterStructuralBisectTest
// ------------------------------------------------------------
// Android-only diagnostic: imports the REAL generated route tree,
// then mutates only its `children` structure before createRouter.
//
// This is intentionally different from the previous import bisect:
// it registers subsets of the actual generated route objects/branches.
// Use query params:
//   /index.html?__irth_router_struct=1&branch=__root__&half=a
//   /index.html?__irth_router_struct=1&branch=__root__&half=b
//   /index.html?__irth_router_struct=1&branch=/admin/games&from=0&to=2
//
// The bare input route is always included so every subset lands on the
// same minimal input/textarea page. Inputs are not modified.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "../routeTree.gen";

const QUERY_FLAG = "__irth_router_struct";
const TEST_PATH = "/debug/react-bare-input-min";

type AnyRoute = {
  id?: string;
  path?: string;
  fullPath?: string;
  children?: AnyRoute[];
  options?: Record<string, unknown>;
};

type RouteInfo = {
  route: AnyRoute;
  parent: AnyRoute | null;
  children: AnyRoute[];
  index: number;
};

type BisectSummary = {
  branch: string;
  childCount: number;
  from: number;
  to: number;
  selected: Array<{ index: number; id: string; fullPath: string; path: string }>;
  routeCount: number;
};

const STRUCTURAL_STRIP_KEYS = [
  "loader",
  "beforeLoad",
  "preload",
  "preloadStaleTime",
  "preloadGcTime",
  "loaderDeps",
  "validateSearch",
  "search",
  "pendingComponent",
  "errorComponent",
  "notFoundComponent",
  "onEnter",
  "onStay",
  "onLeave",
  "onCatch",
  "staticData",
  "head",
  "scripts",
  "context",
  "shouldReload",
  "gcTime",
  "staleTime",
] as const;

export function isRouterStructuralBisectPath(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(QUERY_FLAG) === "1";
  } catch {
    return false;
  }
}

function RootOutletOnly() {
  return <Outlet />;
}

function routeId(route: AnyRoute): string {
  return String(route.id ?? "");
}

function routeFullPath(route: AnyRoute): string {
  return String(route.fullPath ?? route.id ?? "");
}

function routePath(route: AnyRoute): string {
  return String(route.path ?? "");
}

function describeRoute(route: AnyRoute, index = -1) {
  return {
    index,
    id: routeId(route),
    fullPath: routeFullPath(route),
    path: routePath(route),
  };
}

function snapshotRoutes(root: AnyRoute) {
  const infos = new Map<AnyRoute, RouteInfo>();
  const byKey = new Map<string, AnyRoute>();

  const visit = (route: AnyRoute, parent: AnyRoute | null, index: number) => {
    const children = Array.isArray(route.children) ? [...route.children] : [];
    infos.set(route, { route, parent, children, index });

    const keys = [routeId(route), routeFullPath(route), routePath(route)].filter(Boolean);
    for (const key of keys) byKey.set(key, route);
    if (routeId(route) === "__root__") byKey.set("__root__", route);

    children.forEach((child, childIndex) => visit(child, route, childIndex));
  };

  visit(root, null, -1);
  return { infos, byKey };
}

function restoreFullSubtree(route: AnyRoute, infos: Map<AnyRoute, RouteInfo>) {
  const info = infos.get(route);
  if (!info) return;
  route.children = [...info.children];
  for (const child of info.children) restoreFullSubtree(child, infos);
}

function clearAllChildren(infos: Map<AnyRoute, RouteInfo>) {
  for (const info of infos.values()) {
    info.route.children = [];
  }
}

function stripRouteOptions(root: AnyRoute, target: AnyRoute) {
  const preservedTargetComponent = target.options?.component;
  const stack = [root];
  const seen = new Set<AnyRoute>();

  while (stack.length) {
    const route = stack.pop();
    if (!route || seen.has(route)) continue;
    seen.add(route);

    const opts = route.options;
    if (opts && typeof opts === "object") {
      for (const key of STRUCTURAL_STRIP_KEYS) {
        if (key in opts) {
          try { delete opts[key]; } catch { /* ignore */ }
        }
      }

      // Keep this a structural registration test: no root providers/AppShell,
      // no unrelated route components. The target bare-input component remains
      // the same existing route component.
      if (route === root) {
        opts.component = RootOutletOnly;
      } else if (route === target && preservedTargetComponent) {
        opts.component = preservedTargetComponent;
      } else {
        try { delete opts.component; } catch { /* ignore */ }
      }
    }

    for (const child of Array.isArray(route.children) ? route.children : []) {
      stack.push(child);
    }
  }
}

function computeRange(total: number, params: URLSearchParams) {
  const half = params.get("half");
  const mid = Math.ceil(total / 2);
  const rawFrom = params.get("from");
  const rawTo = params.get("to");

  let from = Number.isFinite(Number(rawFrom)) && rawFrom !== null ? Number(rawFrom) : 0;
  let to = Number.isFinite(Number(rawTo)) && rawTo !== null ? Number(rawTo) : total;

  if (half === "a") {
    from = 0;
    to = mid;
  } else if (half === "b") {
    from = mid;
    to = total;
  }

  from = Math.max(0, Math.min(total, Math.trunc(from)));
  to = Math.max(from, Math.min(total, Math.trunc(to)));
  return { from, to };
}

function getAncestry(route: AnyRoute, infos: Map<AnyRoute, RouteInfo>) {
  const out: AnyRoute[] = [];
  let current: AnyRoute | null = route;
  while (current) {
    out.unshift(current);
    current = infos.get(current)?.parent ?? null;
  }
  return out;
}

function applyStructuralSubset(root: AnyRoute): BisectSummary {
  const params = new URLSearchParams(window.location.search);
  const branchKey = params.get("branch") || "__root__";
  const { infos, byKey } = snapshotRoutes(root);

  const target = byKey.get(TEST_PATH);
  const branch = byKey.get(branchKey) ?? root;
  if (!target) throw new Error(`Structural bisect target route missing: ${TEST_PATH}`);

  stripRouteOptions(root, target);

  const branchInfo = infos.get(branch);
  const branchChildren = branchInfo?.children ?? [];
  const { from, to } = computeRange(branchChildren.length, params);
  const selectedChildren = branchChildren.slice(from, to);

  // Emit every child index for Logcat-driven bisection. This lets the next
  // run use branch=<id>&from=<n>&to=<m> without any in-app UI controls.
  branchChildren.forEach((child, index) => {
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_STRUCT_CHILD", {
      branch: branchKey,
      ...describeRoute(child, index),
    });
  });

  clearAllChildren(infos);

  const attachUnique = (parent: AnyRoute, children: AnyRoute[]) => {
    const unique: AnyRoute[] = [];
    for (const child of children) {
      if (child && !unique.includes(child)) unique.push(child);
    }
    parent.children = unique;
  };

  if (branch === root) {
    attachUnique(root, [...selectedChildren, target]);
    for (const child of root.children ?? []) restoreFullSubtree(child, infos);
  } else {
    const ancestry = getAncestry(branch, infos);
    const rootChild = ancestry[1];
    attachUnique(root, [rootChild, target].filter(Boolean));

    for (let i = 1; i < ancestry.length - 1; i++) {
      attachUnique(ancestry[i], [ancestry[i + 1]]);
    }

    attachUnique(branch, selectedChildren);
    for (const child of selectedChildren) restoreFullSubtree(child, infos);
    restoreFullSubtree(target, infos);
  }

  const selected = selectedChildren.map((child) => describeRoute(child, infos.get(child)?.index ?? -1));

  // eslint-disable-next-line no-console
  console.log("IRTH_ROUTER_STRUCT_BISECT_PREP", {
    branch: branchKey,
    branchResolved: describeRoute(branch),
    childCount: branchChildren.length,
    from,
    to,
    selected,
    alwaysIncludedTarget: describeRoute(target),
  });

  return {
    branch: branchKey,
    childCount: branchChildren.length,
    from,
    to,
    selected,
    routeCount: infos.size,
  };
}

export function RouterStructuralBisectTest() {
  const [mounted, setMounted] = useState(false);

  const { router, queryClient, summary } = useMemo(() => {
    const summary = applyStructuralSubset(routeTree as AnyRoute);
    const queryClient = new QueryClient();
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: [TEST_PATH] }),
      scrollRestoration: false,
      defaultPreload: false,
      defaultPreloadStaleTime: 0,
    });
    summary.routeCount = Object.keys((router as unknown as { routesById?: Record<string, unknown> }).routesById ?? {}).length;
    return { router, queryClient, summary };
  }, []);

  useEffect(() => {
    setMounted(true);
    (window as unknown as { __IRTH_ROUTE_STRUCT_BISECT__?: BisectSummary }).__IRTH_ROUTE_STRUCT_BISECT__ = summary;
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_STRUCT_BISECT_MOUNTED", summary);
  }, [summary]);

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: 6, background: "#111827", color: "#fef3c7", fontSize: 11, zIndex: 99999, fontFamily: "system-ui" }}>
        ROUTER STRUCTURE BISECT {mounted ? "· mounted" : ""} · {summary.branch} [{summary.from}, {summary.to}) / {summary.childCount} · routes {summary.routeCount}
      </div>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}