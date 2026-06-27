import { useEffect, useState } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";

const ROUTER_MIN_QUERY = "__irth_router_min";

export function isRouterMinPath(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(ROUTER_MIN_QUERY) === "1";
  } catch {
    return false;
  }
}

function RootRender() {
  return <Outlet />;
}

function MinPage() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("IRTH_ROUTER_MIN_MOUNTED", { path: window.location.pathname });
  }, []);
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8, color: "#1d4ed8" }}>ROUTER MIN READY</h1>
      <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 16 }}>
        TanStack Router with a hand-built tree (root + 1 leaf). No routeTree.gen.
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{ padding: "10px 16px", marginBottom: 16, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600 }}
      >
        Counter: {count}
      </button>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain input</label>
        <input
          type="text"
          placeholder="Type here…"
          style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain textarea</label>
        <textarea
          rows={4}
          placeholder="Type here…"
          style={{ width: "100%", padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 16 }}
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

export function RouterMinTest() {
  return <RouterProvider router={router} />;
}
