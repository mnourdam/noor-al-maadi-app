import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isAndroidUltraStableMode } from "./lib/androidFreezeDiagnostics";
import { releaseStaleUiLocks } from "./lib/ui/ui-locks";
import { FatalRecoveryScreen } from "./components/FatalRecoveryScreen";
import { noteResolvedRoute } from "./lib/diagnostics/crash-report";

function DefaultRouteError({ error, reset }: { error: Error; reset: () => void }) {
  return <FatalRecoveryScreen error={error} reset={reset} boundary="tanstack_default_error_component" />;
}


function DefaultRouteNotFound() {
  return (
    <div dir="rtl" className="mx-auto max-w-md px-4 py-12 text-center">
      <h2 className="text-base font-semibold text-slate-100">هذا المحتوى غير متاح</h2>
      <p className="mt-2 text-sm text-slate-400">ربما تم نقله أو إزالته.</p>
      <div className="mt-5">
        <Link
          to="/"
          className="inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const androidStable = isAndroidUltraStableMode();
  const queryClient = new QueryClient({
    defaultOptions: androidStable
      ? {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            retry: false,
            staleTime: 5 * 60 * 1000,
          },
        }
      : undefined,
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: !androidStable,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultRouteError,
    defaultNotFoundComponent: DefaultRouteNotFound,
  });

  // Every committed navigation drops ownerless scroll/pointer locks. A modal
  // that is legitimately open is left untouched (see releaseStaleUiLocks), so
  // this can never fight a real overlay — it only cleans up after one that was
  // unmounted mid-transition (the "Home is unclickable" class of bug).
  if (typeof window !== "undefined") {
    try {
      router.subscribe("onResolved", () => {
        releaseStaleUiLocks();
        try { noteResolvedRoute(location.pathname + location.search); } catch { /* ignore */ }
      });
    } catch { /* subscription is a nicety, never fatal */ }
  }

  return router;
};


