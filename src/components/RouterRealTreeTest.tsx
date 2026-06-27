// ============================================================
// RouterRealTreeTest
// ------------------------------------------------------------
// Uses the REAL generated routeTree (src/routeTree.gen.ts) +
// createRouter, but navigates directly to `/debug/react-bare-input-min`
// which already bypasses all providers in __root.tsx on Android.
//
// Purpose: separate "importing route modules" (proven OK by the
// bisect harness) from "constructing & running the real route tree
// inside TanStack Router". If THIS freezes, the bug lives in the
// route tree construction / registration path (route ids, parent
// links, static options, preloads), not in module side effects.
// ============================================================

import { useEffect, useState } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "../routeTree.gen";

const QUERY_FLAG = "__irth_router_real";
const TEST_PATH = "/debug/react-bare-input-min";

export function isRouterRealTreePath(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(QUERY_FLAG) === "1";
  } catch {
    return false;
  }
}

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  history: createMemoryHistory({ initialEntries: [TEST_PATH] }),
  scrollRestoration: false,
  defaultPreloadStaleTime: 0,
});

export function RouterRealTreeTest() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_REAL_TREE_MOUNTED", {
      initial: TEST_PATH,
      routeCount: Object.keys((router as unknown as { routesById?: Record<string, unknown> }).routesById ?? {}).length,
    });
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: 6, background: "#0f172a", color: "#fde68a", fontSize: 11, zIndex: 99999, fontFamily: "system-ui" }}>
        ROUTER REAL TREE TEST {mounted ? "· mounted" : ""}
      </div>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
