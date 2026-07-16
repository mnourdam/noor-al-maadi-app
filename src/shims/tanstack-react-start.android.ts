// Android SPA builds must not import TanStack Start's server-aware client
// runtime. Recent Start client-core versions eagerly import
// @tanstack/start-storage-context, which imports node:async_hooks and crashes
// inside Capacitor WebView before React mounts.
//
// This shim intentionally implements only the browser-safe API surface used by
// the Android bundle: createMiddleware for the auth bearer middleware,
// createStart for src/start compatibility if it is ever reached, createServerFn
// enough for route modules to evaluate, and useServerFn for admin UI wrappers.
// It is not an AsyncLocalStorage polyfill and it does not emulate server
// execution inside the WebView.

import { isRedirect, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

type AnyFn = (...args: any[]) => any;
type MiddlewareOptions = Record<string, any>;

export function createMiddleware(options?: MiddlewareOptions, inherited?: MiddlewareOptions) {
  const resolvedOptions = {
    type: "request",
    ...(inherited ?? options ?? {}),
  };

  return {
    options: resolvedOptions,
    middleware(middleware: unknown) {
      return createMiddleware(undefined, { ...resolvedOptions, middleware });
    },
    inputValidator(inputValidator: unknown) {
      return createMiddleware(undefined, { ...resolvedOptions, inputValidator });
    },
    client(client: AnyFn) {
      return createMiddleware(undefined, { ...resolvedOptions, client });
    },
    server(server: AnyFn) {
      return createMiddleware(undefined, { ...resolvedOptions, server });
    },
  };
}

export function createStart(getOptions: AnyFn) {
  return {
    getOptions,
    createMiddleware,
  };
}

export function createServerFn(options?: MiddlewareOptions, inherited?: MiddlewareOptions) {
  const resolvedOptions = { ...(inherited ?? options ?? {}) };

  const builder = {
    options: resolvedOptions,
    middleware(middleware: unknown[]) {
      return createServerFn(undefined, {
        ...resolvedOptions,
        middleware: [...(resolvedOptions.middleware ?? []), ...(middleware ?? [])],
      });
    },
    inputValidator(inputValidator: unknown) {
      return createServerFn(undefined, { ...resolvedOptions, inputValidator });
    },
    handler() {
      return Object.assign(
        async () => {
          throw new Error("Server functions are not available inside the Android WebView.");
        },
        { method: resolvedOptions.method ?? "GET" },
      );
    },
  };

  return Object.assign(() => createServerFn(undefined, resolvedOptions), builder);
}

export function useServerFn<T extends AnyFn>(serverFn: T): T {
  const router = useRouter();
  return useCallback(async (...args: Parameters<T>) => {
    try {
      return await serverFn(...args);
    } catch (err) {
      if (isRedirect(err)) {
        err.options._fromLocation = router.stores.location.get();
        return router.navigate(router.resolveRedirect(err).options) as ReturnType<T>;
      }
      throw err;
    }
  }, [router, serverFn]) as T;
}
