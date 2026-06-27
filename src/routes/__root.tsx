import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ProfileProvider } from "../lib/profile";
import { AccountProvider } from "../lib/account";
import { FirstLaunchGate } from "../components/FirstLaunchGate";
import { Toaster } from "../components/ui/sonner";
import { AchievementWatcher } from "../components/AchievementWatcher";
import { LevelUpWatcher } from "../components/LevelUpWatcher";
import { SplashSequence } from "../components/splash/SplashSequence";
import { AndroidBackHandler } from "../components/AndroidBackHandler";
import { InAppBanner } from "../components/notifications/InAppBanner";



function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  // Surface the real error for native logs (Logcat on Android via Capacitor's
  // Console plugin) so blank-screen / error-boundary cases are diagnosable.
  // eslint-disable-next-line no-console
  console.error("[root errorComponent]", error?.message, error?.stack ?? error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const isCapacitor =
    typeof window !== "undefined" &&
    (Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) ||
      window.location.protocol === "capacitor:" ||
      window.location.hostname === "localhost");

  const goHome = () => {
    try {
      if (isCapacitor) {
        // Hard reload to the app entry — router state may itself be broken.
        window.location.replace("./index.html");
        return;
      }
      void router.navigate({ to: "/" });
    } catch {
      window.location.reload();
    }
  };

  const tryAgain = () => {
    try {
      reset();
      void router.invalidate();
    } catch {
      window.location.reload();
      return;
    }
    // Belt-and-braces: if the same error re-throws, force a full reload.
    setTimeout(() => {
      try {
        if (document.querySelector("[data-irth-error-boundary]")) {
          window.location.reload();
        }
      } catch { /* ignore */ }
    }, 300);
  };

  return (
    <div
      data-irth-error-boundary
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {error?.message ? (
          <p className="mt-3 break-words text-[11px] leading-relaxed text-muted-foreground/70">
            {error.message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={tryAgain}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "description", content: "إرث هو عالم تاريخي تفاعلي يتيح استكشاف تاريخ المسلمين عبر الشخصيات والدول والمعارك والمدن والأحداث في تجربة معرفية غامرة." },
      { name: "author", content: "Irth Historical Project" },
      { name: "application-name", content: "إرث" },
      { name: "apple-mobile-web-app-title", content: "إرث" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0b1424" },
      { property: "og:site_name", content: "إرث — Irth" },
      { property: "og:title", content: "إرث — رحلة عبر التاريخ الإسلامي" },
      { property: "og:description", content: "إرث هو عالم تاريخي تفاعلي يتيح استكشاف تاريخ المسلمين عبر الشخصيات والدول والمعارك والمدن والأحداث في تجربة معرفية غامرة." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/irth-icon.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "إرث — رحلة عبر التاريخ الإسلامي" },
      { name: "twitter:description", content: "إرث هو عالم تاريخي تفاعلي يتيح استكشاف تاريخ المسلمين عبر الشخصيات والدول والمعارك والمدن والأحداث في تجربة معرفية غامرة." },
      { name: "twitter:image", content: "/irth-icon.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/irth-icon.png" },
      { rel: "apple-touch-icon", href: "/irth-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function isAndroidCapacitorRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /android/i.test(navigator.userAgent) ||
    Boolean((window as unknown as { Capacitor?: unknown }).Capacitor) ||
    window.location.protocol === "capacitor:"
  );
}

function RootShell({ children }: { children: ReactNode }) {
  // On Android/Capacitor, rendering <html>/<body> from React freezes the
  // WebView text-focus handoff. The native index.html already provides the
  // document shell, so we render children directly.
  if (isAndroidCapacitorRuntime()) {
    return <>{children}</>;
  }
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    try { document.getElementById("irth-boot-splash")?.remove(); } catch { /* noop */ }
    // Apply Android/WebView/reduced-motion perf-mode class on <html>.
    import("../lib/perf-mode").then((m) => m.applyPerfMode()).catch(() => {});

    import("../lib/orphanUnlocksMigration").then((m) => m.migrateOrphanUnlocks()).catch(() => {});
    import("../lib/campaignLedger").then((m) => m.bootstrapLedgerFlush()).catch(() => {});
    import("../lib/offline-snapshot").then((m) => m.bootstrapOfflineSync()).catch(() => {});

    const onOnline = () => {};
    window.addEventListener("online", onOnline);

    type LockableOrientation = ScreenOrientation & {
      lock?: (orientation: "portrait" | "landscape" | "any") => Promise<void>;
    };
    const so = (typeof screen !== "undefined" ? (screen.orientation as LockableOrientation | undefined) : undefined);
    so?.lock?.("portrait").catch(() => {});

    let unsub: (() => void) | undefined;
    import("../lib/pushNotifications")
      .then(async (m) => {
        await m.initPushNotifications();
        m.flushPendingDeviceToken().catch(() => {});
        const { supabase } = await import("../integrations/supabase/client");
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            m.flushPendingDeviceToken().catch(() => {});
            import("../lib/campaignLedger").then((l) => {
              void l.flushPending();
              if (event === "SIGNED_IN") void l.hydrateLedgerFromCloud();
            }).catch(() => {});
          }
        });
        unsub = () => data.subscription.unsubscribe();
      })
      .catch((err) => console.error("[push] dynamic import failed:", err));

    let lastTouch = 0;
    const touchActive = async () => {
      const now = Date.now();
      if (now - lastTouch < 5 * 60 * 1000) return;
      lastTouch = now;
      try {
        const { touchMyLastActive } = await import("../lib/adminUsers");
        await touchMyLastActive();
      } catch { /* silent */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void touchActive(); };
    document.addEventListener("visibilitychange", onVisible);
    void touchActive();

    return () => {
      unsub?.();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <AccountProvider>
          <Outlet />
          <FirstLaunchGate />
          <AchievementWatcher />
          <LevelUpWatcher />
          <Toaster position="top-center" richColors closeButton />
          <SplashSequence />
          <AndroidBackHandler />
          <InAppBanner />
        </AccountProvider>
      </ProfileProvider>
    </QueryClientProvider>
  );
}

