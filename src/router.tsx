import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isAndroidUltraStableMode } from "./lib/androidFreezeDiagnostics";

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
  });

  return router;
};
