import { useEffect } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

/**
 * Route-aware back-button behavior for mobile (Android web / Capacitor):
 *
 *  - On a nested detail page (e.g. /encyclopedia/entity/$id,
 *    /play/campaign/$id/chapter/$ch, /city/$id, /figure/$id, /battle/$id,
 *    /story/$id, /investigation/$id, /u/$username, /compare/$id),
 *    pressing back goes to its logical parent page instead of walking
 *    the entire historical navigation chain.
 *
 *  - On a main tab (/campaigns, /encyclopedia, /map, /collection,
 *    /profile, /notifications, /friends, etc.), back returns to /
 *    (Adventure home).
 *
 *  - On / (home), back asks: "هل تريد الخروج من إرث؟"
 *
 * Desktop browser behavior is preserved — the back handler only intercepts
 * when there is no sensible default (already at home) or when the next
 * history entry would dump the user into a deeply nested chapter chain.
 */

const MAIN_TABS = new Set([
  "/campaigns",
  "/encyclopedia",
  "/map",
  "/collection",
  "/profile",
  "/notifications",
  "/friends",
  "/seasons",
  "/timeline",
  "/referrals",
  "/about",
  "/security",
  "/privacy",
  "/terms",
  "/history-calendar",
  "/on-this-day",
  "/investigations",
  "/content-audit",
]);

/** Best-effort: map a deep route to its logical parent. Returns null when
 *  no override is needed (the browser back should run normally). */
function logicalParent(pathname: string): string | null {
  // /play/campaign/:id/chapter/:ch -> /play/campaign/:id
  let m = pathname.match(/^\/play\/campaign\/([^/]+)\/chapter\/[^/]+/);
  if (m) return `/play/campaign/${m[1]}`;
  // /play/campaign/:id -> /campaigns
  m = pathname.match(/^\/play\/campaign\/[^/]+\/?$/);
  if (m) return "/campaigns";
  // any other /play/* -> /campaigns
  if (pathname.startsWith("/play/")) return "/campaigns";
  // /campaigns/:era -> /campaigns
  m = pathname.match(/^\/campaigns\/[^/]+/);
  if (m) return "/campaigns";
  // /encyclopedia/entity/:id, /encyclopedia/state/:id, /encyclopedia/type/:t -> /encyclopedia
  if (/^\/encyclopedia\/(entity|state|type)\//.test(pathname)) return "/encyclopedia";
  // /city/:id, /figure/:id, /battle/:id, /story/:id, /investigation/:id
  if (/^\/(city|figure|battle|story|investigation)\/[^/]+/.test(pathname)) return "/encyclopedia";
  // /u/:username, /compare/:id -> /friends
  if (/^\/(u|compare)\/[^/]+/.test(pathname)) return "/friends";
  // /share-card -> /profile
  if (pathname.startsWith("/share-card")) return "/profile";
  return null;
}

const SENTINEL_STATE = { irth_back_sentinel: true } as const;

export function BackNavigationGuard() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Push a sentinel state so the first back press fires popstate against us
    // instead of leaving the app (or whatever was before it in history).
    try {
      if (!(history.state && (history.state as { irth_back_sentinel?: boolean }).irth_back_sentinel)) {
        history.pushState(SENTINEL_STATE, "");
      }
    } catch { /* ignore */ }

    function onPop() {
      const current = window.location.pathname;

      // Home: prompt to exit, otherwise re-arm sentinel and stay.
      if (current === "/" || current === "") {
        const ok = window.confirm("هل تريد الخروج من إرث؟");
        if (ok) {
          // Let the user actually leave: pop once more (out of our sentinel
          // chain) by going back. On Capacitor this triggers App.exitApp().
          window.removeEventListener("popstate", onPop);
          history.back();
          return;
        }
        // Stay — re-push sentinel so the next back press lands here too.
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }

      // Nested detail page: route to its logical parent.
      const parent = logicalParent(current);
      if (parent && parent !== current) {
        router.navigate({ to: parent as never });
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }

      // Main tab: return to Adventure home.
      if (MAIN_TABS.has(current)) {
        router.navigate({ to: "/" });
        try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
        return;
      }

      // Anything else: re-arm sentinel and let the browser default proceed
      // on the next press by removing our listener for one tick.
      try { history.pushState(SENTINEL_STATE, ""); } catch { /* ignore */ }
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Re-evaluate sentinel each route change so we always have one buffer.
  }, [router, pathname]);

  return null;
}