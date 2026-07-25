import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { isAndroidUltraStableMode } from "./lib/androidFreezeDiagnostics";
import { releaseUiLocks } from "./lib/atlas/atlas-recovery";

function DefaultRouteError({ reset }: { error: Error; reset: () => void }) {
  // A route can crash while a modal/overlay holds the body scroll lock, which
  // would leave the whole app unclickable behind this screen. Always release.
  useEffect(() => { releaseUiLocks(); }, []);
  return (
    <div dir="rtl" className="mx-auto max-w-md px-4 py-12 text-center">
      <h2 className="text-base font-semibold text-slate-100">تعذر تحميل هذا القسم</h2>
      <p className="mt-2 text-sm text-slate-400">حدث خطأ غير متوقع. حاول مرة أخرى.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => { releaseUiLocks(); try { reset(); } catch { window.location.reload(); } }}
          className="inline-flex min-h-10 items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
        >
          إعادة المحاولة
        </button>
        {/* Plain anchor: guarantees an escape even if the router is wedged. */}
        <a
          href="/"
          className="inline-flex min-h-10 items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 hover:border-amber-400"
        >
          العودة للرئيسية
        </a>
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

  return router;
};

