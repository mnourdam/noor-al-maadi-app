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
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
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

function RootShell({ children }: { children: ReactNode }) {
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
    // Apply Android/WebView/reduced-motion perf-mode class on <html>.
    import("../lib/perf-mode").then((m) => m.applyPerfMode()).catch(() => {});

    // PR3: bootstrap campaign-ledger sync flush (online + visibility events).
    import("../lib/campaignLedger").then((m) => m.bootstrapLedgerFlush()).catch(() => {});

    // Migrate localStorage registry unlocks → Supabase user_collection (boot).
    import("../lib/registryUnlockMigration")
      .then((m) => m.migrateRegistryUnlocksToSupabase())
      .catch(() => {});
    // Retry when coming back online.
    const onOnline = () => {
      import("../lib/registryUnlockMigration")
        .then((m) => m.migrateRegistryUnlocksToSupabase())
        .catch(() => {});
    };
    window.addEventListener("online", onOnline);


    // Lock orientation to portrait on supported platforms (Android / Capacitor / installed PWA).
    // Browsers that don't allow this silently reject — that's fine.
    type LockableOrientation = ScreenOrientation & {
      lock?: (orientation: "portrait" | "landscape" | "any") => Promise<void>;
    };
    const so = (typeof screen !== "undefined" ? (screen.orientation as LockableOrientation | undefined) : undefined);
    so?.lock?.("portrait").catch(() => {});

    // Initialize FCM push notifications (Android-native only; no-op on web).
    console.log("[push] root effect reached");
    let unsub: (() => void) | undefined;
    import("../lib/pushNotifications")
      .then(async (m) => {
        await m.initPushNotifications();
        // Flush any token captured before the user was signed in.
        m.flushPendingDeviceToken().catch(() => {});
        const { supabase } = await import("../integrations/supabase/client");
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            m.flushPendingDeviceToken().catch(() => {});
            // PR3: drain any queued campaign sync ops now that we have a session.
            import("../lib/campaignLedger").then((l) => {
              void l.flushPending();
              if (event === "SIGNED_IN") void l.hydrateLedgerFromCloud();
            }).catch(() => {});
          }
        });
        unsub = () => data.subscription.unsubscribe();
      })
      .catch((err) => console.error("[push] dynamic import failed:", err));
    return () => {
      unsub?.();
    };

  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <AccountProvider>
          <Outlet />
        </AccountProvider>
      </ProfileProvider>
    </QueryClientProvider>
  );
}
