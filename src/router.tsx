import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { isAndroidUltraStableMode } from "./lib/androidFreezeDiagnostics";
import { releaseAllUiLocks, releaseStaleUiLocks } from "./lib/ui/ui-locks";

function DefaultRouteError({ error, reset }: { error: Error; reset: () => void }) {
  // 1. Surface the ORIGINAL exception before any generic UI hides it.
  // 2. A route can crash while a modal/overlay/cinematic layer holds the body
  //    lock or covers the screen — that is what made this screen unclickable.
  //    Release locks AND neutralize any full-screen layer above us.
  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.error("[route:fatal]", error);
      // eslint-disable-next-line no-console
      console.error(
        "[route:fatal:diagnostics]",
        JSON.stringify({
          at: new Date().toISOString(),
          route: typeof location !== "undefined" ? location.pathname + location.search : "",
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
        }),
      );
    } catch { /* never throw from the failure path */ }
    releaseAllUiLocks();
    const t = window.setTimeout(releaseAllUiLocks, 120);
    return () => window.clearTimeout(t);
  }, [error]);
  return (
    <div
      dir="rtl"
      data-irth-recovery-layer
      className="fixed inset-0 z-[2147483000] flex items-center justify-center overflow-auto bg-background px-4 py-12"
      style={{ pointerEvents: "auto" }}
    >
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-base font-semibold text-slate-100">تعذر تحميل هذا القسم</h2>
        <p className="mt-2 text-sm text-slate-400">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => { releaseAllUiLocks(); try { reset(); } catch { window.location.reload(); } }}
            className="inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
          >
            إعادة المحاولة
          </button>
          {/* Plain anchor: guarantees an escape even if the router is wedged. */}
          <a
            href="/"
            onClick={releaseAllUiLocks}
            className="inline-flex min-h-10 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 hover:border-amber-400"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </div>
  );
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
      router.subscribe("onResolved", () => releaseStaleUiLocks());
    } catch { /* subscription is a nicety, never fatal */ }
  }

  return router;
};


