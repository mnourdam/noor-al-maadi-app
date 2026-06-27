// ============================================================
// RouterRootObjectIsolationTest
// ------------------------------------------------------------
// Android-only diagnostic after structural A/B both froze.
//
// Modes:
//   real-root-bare:
//     Use the REAL generated root route object, but attach ONLY the
//     generated /debug/react-bare-input-min child.
//
//   min-root-real-child:
//     Use the same hand-built minimal root pattern that already works,
//     add a hand-built input leaf, then attach ONE real generated root
//     child branch by index/id/path.
//
// This isolates the common generated root/shared route-object setup from
// the full route tree size and from A/B branch splitting.
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

import { routeTree } from "../routeTree.gen";

const QUERY_FLAG = "__irth_router_root_iso";
const TEST_PATH = "/debug/react-bare-input-min";
const MIN_INPUT_PATH = "/__irth-root-object-input";

type AnyRoute = {
  id?: string;
  path?: string;
  fullPath?: string;
  children?: AnyRoute[];
  options?: Record<string, unknown>;
  parentRoute?: AnyRoute;
  init?: (opts: { originalIndex: number }) => void;
  _addFileChildren?: (children: AnyRoute[] | Record<string, AnyRoute>) => AnyRoute;
};

type IsolationMode = "real-root-bare" | "min-root-real-child" | "clean-root-real-children";

type IsolationSummary = {
  mode: IsolationMode;
  selectedChildIndex: number | null;
  selectedChild: RouteDescriptor | null;
  generatedRoot: RouteDescriptor;
  minimalRoot?: RouteDescriptor;
  generatedRootOriginalChildCount: number;
  registeredRouteCount: number;
};

type RouteDescriptor = {
  id: string;
  path: string;
  fullPath: string;
  optionKeys: string[];
  childCount: number;
  constructorName: string;
  isRoot: boolean;
};

export function isRouterRootObjectIsolationPath(): boolean {
  try {
    return new URLSearchParams(window.location.search).get(QUERY_FLAG) === "1";
  } catch {
    return false;
  }
}

function RootOutletOnly() {
  return <Outlet />;
}

function describeRoute(route: AnyRoute): RouteDescriptor {
  return {
    id: String(route.id ?? ""),
    path: String(route.path ?? ""),
    fullPath: String(route.fullPath ?? ""),
    optionKeys: Object.keys(route.options ?? {}).sort(),
    childCount: Array.isArray(route.children) ? route.children.length : 0,
    constructorName: route.constructor?.name ?? "unknown",
    isRoot: Boolean((route as unknown as { isRoot?: boolean }).isRoot),
  };
}

function listRoutes(root: AnyRoute) {
  const out: AnyRoute[] = [];
  const seen = new Set<AnyRoute>();
  const visit = (route: AnyRoute) => {
    if (!route || seen.has(route)) return;
    seen.add(route);
    out.push(route);
    for (const child of Array.isArray(route.children) ? route.children : []) {
      visit(child);
    }
  };
  visit(root);
  return out;
}

function findRoute(root: AnyRoute, key: string) {
  return listRoutes(root).find((route) => route.id === key || route.fullPath === key || route.path === key) ?? null;
}

function selectRootChild(children: AnyRoute[], params: URLSearchParams) {
  const byKey = params.get("childId") || params.get("childPath");
  if (byKey) {
    const match = children.find((child) => child.id === byKey || child.fullPath === byKey || child.path === byKey);
    if (match) return { child: match, index: children.indexOf(match) };
  }

  const rawIndex = params.get("child");
  const index = rawIndex === null ? 0 : Math.max(0, Math.min(children.length - 1, Math.trunc(Number(rawIndex) || 0)));
  return { child: children[index] ?? null, index: children[index] ? index : -1 };
}

function logRootChildren(children: AnyRoute[]) {
  children.forEach((child, index) => {
    // eslint-disable-next-line no-console
    console.log("IRTH_ROOT_ISO_CHILD", { index, ...describeRoute(child) });
  });
}

function prepareRealRootBare(root: AnyRoute, originalChildren: AnyRoute[]) {
  const target = findRoute(root, TEST_PATH);
  if (!target) throw new Error(`Root isolation target route missing: ${TEST_PATH}`);

  if (root.options) root.options.component = RootOutletOnly;
  root.children = [target];
  target.children = [];

  // eslint-disable-next-line no-console
  console.log("IRTH_ROOT_ISO_REAL_ROOT_BARE_PREP", {
    root: describeRoute(root),
    originalRootChildren: originalChildren.length,
    attached: describeRoute(target),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [TEST_PATH] }),
    scrollRestoration: false,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
  });

  return {
    router,
    initialPath: TEST_PATH,
    selectedChild: target,
    selectedChildIndex: originalChildren.indexOf(target),
    minimalRoot: null,
  };
}

function MinInputPage() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("IRTH_ROOT_ISO_MIN_INPUT_MOUNTED");
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8, color: "#7c2d12" }}>ROOT OBJECT ISOLATION READY</h1>
      <p style={{ fontSize: 12, opacity: 0.65, marginBottom: 16 }}>
        Hand-built minimal root and input leaf, with one generated route child attached.
      </p>
      <button
        type="button"
        onClick={() => setCount((c) => c + 1)}
        style={{ padding: "10px 16px", marginBottom: 16, background: "#7c2d12", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700 }}
      >
        Counter: {count}
      </button>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain input</label>
        <input type="text" placeholder="Type here…" style={{ width: "100%", padding: 10, border: "1px solid #bbb", borderRadius: 6, fontSize: 16 }} />
      </div>
      <div>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Plain textarea</label>
        <textarea rows={4} placeholder="Type here…" style={{ width: "100%", padding: 10, border: "1px solid #bbb", borderRadius: 6, fontSize: 16 }} />
      </div>
    </div>
  );
}

function prepareMinRootRealChild(originalChildren: AnyRoute[], params: URLSearchParams) {
  const rootRoute = createRootRoute({ component: RootOutletOnly });
  const inputRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: MIN_INPUT_PATH,
    component: MinInputPage,
  });

  const { child, index } = selectRootChild(originalChildren, params);
  const children = child ? [inputRoute, child as never] : [inputRoute];
  const routeTreeForTest = rootRoute.addChildren(children);

  // eslint-disable-next-line no-console
  console.log("IRTH_ROOT_ISO_MIN_ROOT_REAL_CHILD_PREP", {
    minimalRoot: describeRoute(rootRoute as unknown as AnyRoute),
    generatedRoot: describeRoute(routeTree as unknown as AnyRoute),
    selectedChildIndex: index,
    selectedChild: child ? describeRoute(child) : null,
  });

  const router = createRouter({
    routeTree: routeTreeForTest,
    history: createMemoryHistory({ initialEntries: [MIN_INPUT_PATH] }),
    scrollRestoration: false,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
  });

  return {
    router,
    initialPath: MIN_INPUT_PATH,
    selectedChild: child,
    selectedChildIndex: index,
    minimalRoot: rootRoute as unknown as AnyRoute,
  };
}

function CleanShell({ children }: { children: ReactNode }) {
  // Minimal shell: no <HeadContent />, no <Scripts />, no remote font link,
  // no html/body wrapper styles, no providers. Just renders children.
  return <>{children}</>;
}

type CleanPiece =
  | "none"
  | "headContent"
  | "scripts"
  | "head"
  | "rootShell"
  | "boundaries"
  | "fonts"
  | "rs1" | "rs2" | "rs3" | "rs4" | "rs5" | "rs6" | "rs7" | "rs8"
  | "rs2-html-only"
  | "rs2-html-lang-only"
  | "rs2-html-dir-only"
  | "rs2-body-only"
  | "rs2-body-class-only"
  | "rs2-html-body-data-only";

function OriginalRootShell({ children }: { children: ReactNode }) {
  // Mirrors the real __root.tsx RootShell exactly.
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// ---- RootShell internal bisect pieces ----
function RS1_Fragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
function RS2_HtmlBody({ children }: { children: ReactNode }) {
  return <html><body>{children}</body></html>;
}
function RS2Delta_HtmlOnly({ children }: { children: ReactNode }) {
  return <html>{children}</html>;
}
function RS2Delta_HtmlLangOnly({ children }: { children: ReactNode }) {
  return <html lang="ar">{children}</html>;
}
function RS2Delta_HtmlDirOnly({ children }: { children: ReactNode }) {
  return <html dir="rtl">{children}</html>;
}
function RS2Delta_BodyOnly({ children }: { children: ReactNode }) {
  return <body>{children}</body>;
}
function RS2Delta_BodyClassOnly({ children }: { children: ReactNode }) {
  return <body className="irth-rs2-body-class-only">{children}</body>;
}
function RS2Delta_HtmlBodyDataOnly({ children }: { children: ReactNode }) {
  return <html data-irth-rs2-html-only="1"><body data-irth-rs2-body-only="1">{children}</body></html>;
}
function RS3_Lang({ children }: { children: ReactNode }) {
  return <html lang="ar"><body>{children}</body></html>;
}
function RS4_Dir({ children }: { children: ReactNode }) {
  return <html dir="rtl"><body>{children}</body></html>;
}
function RS5_LangDir({ children }: { children: ReactNode }) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
function RS6_EmptyHead({ children }: { children: ReactNode }) {
  return <html lang="ar" dir="rtl"><head /><body>{children}</body></html>;
}
function RS7_HeadContent({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>{children}</body>
    </html>
  );
}
function RS8_Full({ children }: { children: ReactNode }) {
  return <OriginalRootShell>{children}</OriginalRootShell>;
}

function HeadContentShell({ children }: { children: ReactNode }) {
  return (
    <>
      <HeadContent />
      {children}
    </>
  );
}

function ScriptsShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Scripts />
    </>
  );
}

const ORIGINAL_HEAD = () => ({
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title: "إرث — رحلة عبر التاريخ الإسلامي" },
    { name: "description", content: "إرث هو عالم تاريخي تفاعلي." },
    { name: "theme-color", content: "#0b1424" },
    { property: "og:title", content: "إرث" },
    { property: "og:image", content: "/irth-icon.png" },
  ],
  links: [
    { rel: "icon", type: "image/png", href: "/irth-icon.png" },
    { rel: "manifest", href: "/manifest.webmanifest" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap",
    },
  ],
});

const FONTS_ONLY_HEAD = () => ({
  meta: [],
  links: [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap",
    },
  ],
});

function OriginalNotFound() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>404</h1>
      <p>Page not found</p>
    </div>
  );
}

function OriginalError({ error }: { error: Error }) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui", color: "#b91c1c" }}>
      <h1>This page didn't load</h1>
      <p style={{ fontSize: 12 }}>{error?.message}</p>
    </div>
  );
}

function prepareCleanRootRealChildren(root: AnyRoute, originalChildren: AnyRoute[], params: URLSearchParams) {
  const piece = (params.get("piece") as CleanPiece) || "none";

  if (root.options) {
    root.options.component = RootOutletOnly;

    // Defaults: clean shell, empty head, simple boundaries.
    root.options.shellComponent = CleanShell;
    root.options.head = () => ({ meta: [], links: [], scripts: [] });
    root.options.notFoundComponent = () => <div style={{ padding: 24 }}>not found</div>;
    root.options.errorComponent = ({ error }: { error: Error }) => (
      <div style={{ padding: 24, color: "#b91c1c", fontFamily: "system-ui" }}>
        <h1 style={{ fontWeight: 700 }}>clean-root error</h1>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{error?.stack ?? error?.message}</pre>
      </div>
    );

    // Selectively restore ONE piece.
    switch (piece) {
      case "headContent":
        root.options.shellComponent = HeadContentShell;
        break;
      case "scripts":
        root.options.shellComponent = ScriptsShell;
        break;
      case "head":
        root.options.shellComponent = HeadContentShell;
        root.options.head = ORIGINAL_HEAD;
        break;
      case "rootShell":
        root.options.shellComponent = OriginalRootShell;
        break;
      case "boundaries":
        root.options.notFoundComponent = OriginalNotFound;
        root.options.errorComponent = OriginalError;
        break;
      case "fonts":
        root.options.shellComponent = HeadContentShell;
        root.options.head = FONTS_ONLY_HEAD;
        break;
      case "rs1": root.options.shellComponent = RS1_Fragment; break;
      case "rs2": root.options.shellComponent = RS2_HtmlBody; break;
      case "rs2-html-only": root.options.shellComponent = RS2Delta_HtmlOnly; break;
      case "rs2-html-lang-only": root.options.shellComponent = RS2Delta_HtmlLangOnly; break;
      case "rs2-html-dir-only": root.options.shellComponent = RS2Delta_HtmlDirOnly; break;
      case "rs2-body-only": root.options.shellComponent = RS2Delta_BodyOnly; break;
      case "rs2-body-class-only": root.options.shellComponent = RS2Delta_BodyClassOnly; break;
      case "rs2-html-body-data-only": root.options.shellComponent = RS2Delta_HtmlBodyDataOnly; break;
      case "rs3": root.options.shellComponent = RS3_Lang; break;
      case "rs4": root.options.shellComponent = RS4_Dir; break;
      case "rs5": root.options.shellComponent = RS5_LangDir; break;
      case "rs6": root.options.shellComponent = RS6_EmptyHead; break;
      case "rs7": root.options.shellComponent = RS7_HeadContent; break;
      case "rs8": root.options.shellComponent = RS8_Full; break;
      case "none":
      default:
        break;
    }

    delete (root.options as Record<string, unknown>).loader;
    delete (root.options as Record<string, unknown>).beforeLoad;
    delete (root.options as Record<string, unknown>).onEnter;
    delete (root.options as Record<string, unknown>).onLeave;
    delete (root.options as Record<string, unknown>).onStay;
  }

  // eslint-disable-next-line no-console
  console.log("IRTH_ROOT_ISO_CLEAN_ROOT_REAL_CHILDREN_PREP", {
    root: describeRoute(root),
    childCount: originalChildren.length,
    piece,
  });

  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [TEST_PATH] }),
    scrollRestoration: false,
    defaultPreload: false,
    defaultPreloadStaleTime: 0,
  });

  return {
    router,
    initialPath: TEST_PATH,
    selectedChild: null,
    selectedChildIndex: -1,
    minimalRoot: null,
  };
}



export function RouterRootObjectIsolationTest() {
  const [mounted, setMounted] = useState(false);

  const { router, summary } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const rawMode = params.get("mode");
    const mode: IsolationMode =
      rawMode === "min-root-real-child" ? "min-root-real-child"
      : rawMode === "clean-root-real-children" ? "clean-root-real-children"
      : "real-root-bare";
    const generatedRoot = routeTree as unknown as AnyRoute;
    const originalChildren = Array.isArray(generatedRoot.children) ? [...generatedRoot.children] : [];

    logRootChildren(originalChildren);

    const prepared = mode === "min-root-real-child"
      ? prepareMinRootRealChild(originalChildren, params)
      : mode === "clean-root-real-children"
        ? prepareCleanRootRealChildren(generatedRoot, originalChildren, params)
        : prepareRealRootBare(generatedRoot, originalChildren);

    const registeredRouteCount = Object.keys((prepared.router as unknown as { routesById?: Record<string, unknown> }).routesById ?? {}).length;
    const summary: IsolationSummary = {
      mode,
      selectedChildIndex: prepared.selectedChildIndex >= 0 ? prepared.selectedChildIndex : null,
      selectedChild: prepared.selectedChild ? describeRoute(prepared.selectedChild) : null,
      generatedRoot: describeRoute(generatedRoot),
      minimalRoot: prepared.minimalRoot ? describeRoute(prepared.minimalRoot) : undefined,
      generatedRootOriginalChildCount: originalChildren.length,
      registeredRouteCount,
    };

    // eslint-disable-next-line no-console
    console.log("IRTH_ROOT_ISO_READY", summary);
    return { router: prepared.router, summary };
  }, []);

  useEffect(() => {
    setMounted(true);
    (window as unknown as { __IRTH_ROOT_OBJECT_ISOLATION__?: IsolationSummary }).__IRTH_ROOT_OBJECT_ISOLATION__ = summary;
    // eslint-disable-next-line no-console
    console.log("IRTH_ROOT_OBJECT_ISOLATION_MOUNTED", summary);
  }, [summary]);

  return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: 6, background: "#111827", color: "#fef3c7", fontSize: 11, zIndex: 99999, fontFamily: "system-ui" }}>
        ROOT OBJECT ISO {mounted ? "· mounted" : ""} · {summary.mode} · routes {summary.registeredRouteCount}
      </div>
      <RouterProvider router={router} />
    </>
  );
}