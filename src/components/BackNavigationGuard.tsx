import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

/**
 * Safe back-button behavior across web + Capacitor APK.
 *
 *  - On "/" (Adventure home): confirm "هل تريد الخروج من إرث؟".
 *      • Capacitor → App.exitApp() on confirm.
 *      • Web preview → never force-exit; stay on home.
 *  - On any other main bottom tab → navigate to "/" (Adventure home).
 *  - On any other route → previous logical screen (router.history.back if
 *      available, otherwise navigate to "/").
 *
 *  On Capacitor we hook the native `App.backButton` event because the
 *  native back press doesn't always fire `popstate` — without this the
 *  WebView can exit the app from deep routes.
 */

const MAIN_TABS = new Set([
  "/",
  "/campaigns",
  "/encyclopedia",
  "/map",
  "/collection",
  "/profile",
]);

const SENTINEL_STATE = { irth_back_sentinel: true } as const;

type CapacitorApp = {
  exitApp?: () => void;
  addListener?: (
    event: "backButton",
    cb: (data: { canGoBack: boolean }) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

function getCapacitor(): { isNative: boolean; App?: CapacitorApp } {
  if (typeof window === "undefined") return { isNative: false };
  const cap = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: { App?: CapacitorApp };
    };
  }).Capacitor;
  return { isNative: !!cap?.isNativePlatform?.(), App: cap?.Plugins?.App };
}

function confirmExit(): boolean {
  return window.confirm("هل تريد الخروج من إرث؟");
}

export function BackNavigationGuard() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // ---- Capacitor native back button (APK) -------------------------------
  useEffect(() => {
    const { isNative, App } = getCapacitor();
    if (!isNative || !App?.addListener) return;
    let remove: (() => void) | undefined;

    const handler = ({ canGoBack }: { canGoBack: boolean }) => {
      const current = window.location.pathname || "/";
      if (current === "/" || current === "") {
        if (confirmExit()) App.exitApp?.();
        return;
      }
      if (MAIN_TABS.has(current)) {
        router.navigate({ to: "/" });
        return;
      }
      if (canGoBack) {
        router.history.back();
        return;
      }
      router.navigate({ to: "/" });
    };

    const sub = App.addListener("backButton", handler);
    Promise.resolve(sub).then((s) => { remove = s.remove; });
    return () => { remove?.(); };
  }, [router]);

  // ---- Web / PWA popstate sentinel on main tabs only --------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getCapacitor().isNative) return; // handled by backButton listener
    if (!MAIN_TABS.has(pathname)) return; // detail routes use native back

    try {
      const st = history.state as { irth_back_sentinel?: boolean } | null;
      if (!st || !st.irth_back_sentinel) {
        history.pushState(SENTINEL_STATE, "");
      }
    } catch { /* ignore */ }

    function onPop() {
      const current = window.location.pathname;
      if (current === "/" || current === "") {
        confirmExit(); // web cannot force-exit; stay on home
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }
      if (MAIN_TABS.has(current)) {
        router.navigate({ to: "/" });
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
      }
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router, pathname]);

  return null;
}