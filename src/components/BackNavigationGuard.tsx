import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

/**
 * Minimal, safe back-button behavior:
 *
 *  - On a main bottom tab (/campaigns, /encyclopedia, /map, /collection,
 *    /profile), pressing back returns to "/" (Adventure home).
 *  - On "/" (home), pressing back asks: "هل تريد الخروج من إرث؟"
 *    On Capacitor (APK/PWA) confirming triggers App.exitApp(); on the web
 *    preview we cannot force a tab to close, so we stay on home.
 *  - On every other route (campaign chapters, encyclopedia entities, public
 *    profiles, investigations, auth, settings, about/privacy/terms/security,
 *    etc.) we do NOT install any listener — the browser/router handles back
 *    naturally.
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

export function BackNavigationGuard() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Only intercept on main bottom-tab routes. Every other route keeps
    // normal browser/router back behavior.
    if (!MAIN_TABS.has(pathname)) return;

    // Push a sentinel state so the next back press fires popstate against us
    // instead of leaving the app.
    try {
      const st = history.state as { irth_back_sentinel?: boolean } | null;
      if (!st || !st.irth_back_sentinel) {
        history.pushState(SENTINEL_STATE, "");
      }
    } catch { /* ignore */ }

    function onPop() {
      const current = window.location.pathname;

      // Home: ask to exit. On Capacitor, confirming exits the native app.
      // In web preview we cannot force-close a tab, so we re-arm and stay.
      if (current === "/" || current === "") {
        const ok = window.confirm("هل تريد الخروج من إرث؟");
        if (ok) {
          const cap = (window as unknown as {
            Capacitor?: {
              isNativePlatform?: () => boolean;
              Plugins?: { App?: { exitApp?: () => void } };
            };
          }).Capacitor;
          if (cap?.isNativePlatform?.() && cap.Plugins?.App?.exitApp) {
            try { cap.Plugins.App.exitApp(); return; } catch { /* fallthrough */ }
          }
          // Web preview: cannot exit, stay on home.
        }
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }

      // Other main tab: go home.
      if (MAIN_TABS.has(current)) {
        router.navigate({ to: "/" });
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }

      // Defensive: not a main tab (shouldn't reach here since we gated the
      // effect on pathname). Do nothing and let the browser proceed.
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [router, pathname]);

  return null;
}