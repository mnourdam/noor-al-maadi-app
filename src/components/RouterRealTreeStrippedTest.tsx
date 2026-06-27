// ============================================================
// RouterRealTreeStrippedTest
// ------------------------------------------------------------
// Loads the REAL generated routeTree, then walks every route and
// strips loader / beforeLoad / preload / validateSearch /
// pendingComponent / errorComponent / notFoundComponent / onEnter /
// onLeave / staticData / context BEFORE handing it to createRouter.
//
// Route structure (ids / paths / parent links / children) is left
// untouched. Components are left intact (they're only mounted when
// the matching route is active).
//
// If inputs WORK here -> bug is in one of the stripped options
// (loader / beforeLoad / preload / etc.) on some registered route.
// If inputs STILL FREEZE -> bug is in route tree size/structure or
// in router internals consuming the real registration.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "../routeTree.gen";

const QUERY_FLAG = "__irth_router_real_stripped";
const TEST_PATH = "/debug/react-bare-input-min";

export function isRouterRealTreeStrippedPath(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(QUERY_FLAG) === "1";
  } catch {
    return false;
  }
}

const STRIP_KEYS = [
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

function stripRoute(route: any, count: { n: number }): void {
  if (!route || typeof route !== "object") return;
  const opts = route.options;
  if (opts && typeof opts === "object") {
    for (const k of STRIP_KEYS) {
      if (k in opts) {
        try { delete opts[k]; } catch { /* ignore */ }
      }
    }
    count.n++;
  }
  const children = route.children;
  if (Array.isArray(children)) {
    for (const c of children) stripRoute(c, count);
  } else if (children && typeof children === "object") {
    for (const k of Object.keys(children)) stripRoute(children[k], count);
  }
}

export function RouterRealTreeStrippedTest() {
  const [mounted, setMounted] = useState(false);

  const router = useMemo(() => {
    const count = { n: 0 };
    stripRoute(routeTree as any, count);
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_REAL_STRIPPED_PREP", { stripped: count.n });
    const queryClient = new QueryClient();
    return createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: [TEST_PATH] }),
      scrollRestoration: false,
      defaultPreload: false,
      defaultPreloadStaleTime: 0,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_REAL_STRIPPED_MOUNTED", { initial: TEST_PATH });
  }, []);

  return (
    <QueryClientProvider client={(router.options.context as any).queryClient}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: 6, background: "#0f172a", color: "#bbf7d0", fontSize: 11, zIndex: 99999, fontFamily: "system-ui" }}>
        ROUTER REAL TREE STRIPPED {mounted ? "· mounted" : ""}
      </div>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
