// ============================================================
// RouterBisectTest
// ------------------------------------------------------------
// Goal: identify which route module (or its top-level imports)
// breaks Android text focus once routeTree.gen.ts evaluates it.
//
// Strategy:
//   * Build the same minimal TanStack Router as RouterMinTest
//     (root + 1 leaf with counter + input + textarea).
//   * BEFORE mounting, dynamically import a configurable slice of
//     `src/routes/*.tsx` modules so their top-level code runs.
//   * Slice is controlled by query params:
//       ?__irth_router_bisect=1&from=0&to=44     -> first half
//       ?__irth_router_bisect=1&from=45&to=89    -> second half
//       ?__irth_router_bisect=1&only=campaigns.tsx,profile.tsx
//   * Each loaded module is logged to console so Logcat shows the
//     exact bisection range and any failing import.
// ============================================================

import { useEffect, useState } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

const BISECT_QUERY = "__irth_router_bisect";

// Lazy glob — modules are NOT evaluated at import time. We trigger
// evaluation explicitly inside loadBisectModules().
const routeModules = import.meta.glob("/src/routes/*.tsx");

export function isRouterBisectPath(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(BISECT_QUERY) === "1";
  } catch {
    return false;
  }
}

function parseRange(): { from: number; to: number; only: string[] | null } {
  const sp = new URLSearchParams(window.location.search);
  const from = Number.parseInt(sp.get("from") ?? "0", 10);
  const toRaw = sp.get("to");
  const total = Object.keys(routeModules).length;
  const to = toRaw == null ? total - 1 : Number.parseInt(toRaw, 10);
  const only = sp.get("only");
  return {
    from: Number.isFinite(from) ? from : 0,
    to: Number.isFinite(to) ? to : total - 1,
    only: only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null,
  };
}

export async function loadBisectModules(): Promise<void> {
  const entries = Object.entries(routeModules).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  // Log the full sorted index <-> filename mapping so Logcat can resolve
  // any from/to range back to a real file.
  // eslint-disable-next-line no-console
  console.log(
    "IRTH_ROUTER_BISECT_INDEX",
    entries.map(([p], i) => `${i}:${p.split("/").pop()}`).join(","),
  );
  const { from, to, only } = parseRange();
  let selected: typeof entries;
  if (only && only.length > 0) {
    const set = new Set(only);
    selected = entries.filter(([p]) => {
      const name = p.split("/").pop() ?? "";
      return set.has(name);
    });
  } else {
    selected = entries.slice(from, to + 1);
  }
  // eslint-disable-next-line no-console
  console.log("IRTH_ROUTER_BISECT_START", {
    total: entries.length,
    from,
    to,
    only,
    count: selected.length,
    files: selected.map(([p]) => p.split("/").pop()),
  });
  for (const [path, loader] of selected) {
    const name = path.split("/").pop() ?? path;
    const t0 = performance.now();
    try {
      await loader();
      // eslint-disable-next-line no-console
      console.log(
        "IRTH_ROUTER_BISECT_LOADED",
        name,
        Math.round(performance.now() - t0),
        "ms",
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("IRTH_ROUTER_BISECT_FAIL", name, (e as Error)?.message);
    }
  }
  // eslint-disable-next-line no-console
  console.log("IRTH_ROUTER_BISECT_DONE", { count: selected.length });
}

function RootRender() {
  return <Outlet />;
}

function MinPage() {
  const [count, setCount] = useState(0);
  const { from, to, only } = parseRange();
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_BISECT_MOUNTED", {
      path: window.location.pathname,
      from,
      to,
      only,
    });
  }, [from, to, only]);
  const label = only && only.length > 0 ? `only=${only.join(",")}` : `[${from}..${to}]`;
  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#111",
        background: "#fff",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4, color: "#7c2d12" }}>
        ROUTER BISECT READY
      </h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
        Loaded route modules: <b>{label}</b>. Tree is still root + 1 leaf.
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{
          padding: "10px 16px",
          marginBottom: 16,
          background: "#7c2d12",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontWeight: 600,
        }}
      >
        Counter: {count}
      </button>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
          Plain input
        </label>
        <input
          type="text"
          placeholder="Type here…"
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 16,
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
          Plain textarea
        </label>
        <textarea
          rows={4}
          placeholder="Type here…"
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #ccc",
            borderRadius: 6,
            fontSize: 16,
          }}
        />
      </div>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootRender });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: MinPage,
});
const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  scrollRestoration: false,
  defaultPreloadStaleTime: 0,
});

export function RouterBisectTest() {
  return <RouterProvider router={router} />;
}
