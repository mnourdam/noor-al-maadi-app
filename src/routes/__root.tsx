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
import { useStoryUnlockInvalidation } from "@/lib/stories/unlock-invalidation";
import { StoryUnlockCelebration } from "@/components/stories/StoryUnlockCelebration";
import { FatalRecoveryScreen } from "@/components/FatalRecoveryScreen";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ProfileProvider } from "../lib/profile";
import { AccountProvider } from "../lib/account";
import { FirstLaunchGate } from "../components/FirstLaunchGate";
import { CinematicOpening } from "../components/cinematic/CinematicOpening";
import { Toaster } from "../components/ui/sonner";
import { ContentUpdateBanner } from "../components/ContentUpdateBanner";
import { AudioInitializer } from "../components/AudioInitializer";
import { AchievementWatcher } from "../components/AchievementWatcher";
import { AchievementEngineBoot } from "../lib/achievements/v2/driver";
import { InvestigationLegacyBackfill } from "../components/InvestigationLegacyBackfill";
import { LevelUpWatcher } from "../components/LevelUpWatcher";
import { SplashSequence } from "../components/splash/SplashSequence";
// AndroidBackHandler was folded into NavigationProvider; the engine owns
// the sole Capacitor `App.backButton` listener and the exit dialog.

import { InAppBanner } from "../components/notifications/InAppBanner";
import { DailyChallengeReminderScheduler } from "../components/DailyChallengeReminderScheduler";
import { GoogleAuthResultDialog } from "../components/GoogleAuthResultDialog";
import { IrthAuthDialog } from "../components/IrthAuthDialog";
import { RecoveryModeGuard } from "../components/RecoveryModeGuard";
import { NavigationProvider } from "../lib/navigation";
import {
  TutorialProvider,
  TutorialFlagPublishers,
  TutorialOverlay,
} from "../lib/tutorial";



function NotFoundComponent() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">٤٠٤</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          هذه الصفحة غير متاحة أو ربما تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return <FatalRecoveryScreen error={error} reset={reset} boundary="tanstack_root_error_component" />;
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
      // Fonts are bundled locally via @fontsource in src/styles.css.
      // Do NOT add remote Google Fonts links here — the app must work
      // fully offline on fresh install / airplane mode.
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

  // Story unlock state is server-computed and cached; drop it whenever a
  // progression signal that can flip a lock fires. Without this, reading
  // the gating Encyclopedia entity left the Story card "مقفلة" until the
  // app was restarted.
  useStoryUnlockInvalidation(queryClient);



  useEffect(() => {
    try { document.getElementById("irth-boot-splash")?.remove(); } catch { /* noop */ }
    import("@/lib/boot/startup-timeline").then((m) => m.recordStartupMark("react-mounted")).catch(() => {});

    // Apply Android/WebView/reduced-motion perf-mode class on <html>.
    import("../lib/perf-mode").then((m) => m.applyPerfMode()).catch(() => {});

    // Global resilience: never let unhandled promise rejections or window
    // errors bubble up to a raw screen. Log technical detail; swallow UI.
    const onRejection = (ev: PromiseRejectionEvent) => {
      try {
        // eslint-disable-next-line no-console
        console.error("[unhandledrejection]", ev.reason);
        reportLovableError(
          ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason ?? "unknown")),
          { boundary: "window_unhandledrejection" }
        );
      } catch { /* noop */ }
      // Prevent default Capacitor/WebView surfacing.
      ev.preventDefault?.();
    };
    const onWindowError = (ev: ErrorEvent) => {
      try {
        // eslint-disable-next-line no-console
        console.error("[window.onerror]", ev.message, ev.error);
        if (ev.error instanceof Error) {
          reportLovableError(ev.error, { boundary: "window_onerror" });
        }
      } catch { /* noop */ }
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onWindowError);


    import("../lib/orphanUnlocksMigration").then((m) => m.migrateOrphanUnlocks()).catch(() => {});
    import("../lib/campaignLedger").then((m) => m.bootstrapLedgerFlush()).catch(() => {});
    import("../lib/importedCampaignProgress")
      .then((m) => m.hydrateLegacyProgressFromCloud())
      .catch(() => {})
      .finally(() => {
        // Reconciliation runs AFTER cloud hydration so its cloud snapshot
        // sees any freshly-merged rows. Deterministic + idempotent — safe
        // to fire on every boot; no-op after the first successful pass.
        import("../lib/campaignReconciliation")
          .then((m) => m.reconcileLegacyCampaignProgress())
          .catch(() => {});
      });
    // The bundled snapshot is several megabytes: fetching + parsing + writing
    // it to IndexedDB on the same tick as first paint stalls low-end Android
    // WebViews. Defer to idle (with a hard timeout so it always runs) so the
    // first screen paints first. Offline content availability is unchanged —
    // routes already await `ensureLocalSnapshotLoaded()` when they need rows.
    const startOfflineSync = async () => {
      // Phase 2: Priority Bootstrap
      try {
        const { getBaselineContent, seedBaselineToPersistentStore } = await import("../lib/offline-baseline-resolver");
        // 1. Load bundled baseline into memory immediately (fast parse)
        await getBaselineContent();
        // 2. Start IndexedDB seeding in background (non-blocking)
        void seedBaselineToPersistentStore();
      } catch (e) {
        console.warn("[offline-sync] baseline bootstrap failed:", e);
      }

      import("../lib/offline-snapshot").then((m) => m.bootstrapOfflineSync()).catch(() => {});
      // The Encyclopedia is the most-visited surface in the app. Build its
      // shared index in the background now (it shares the same singleton
      // snapshot load) so the first tap on "الموسوعة" renders from a warm
      // cache instead of starting the work after the tap.
      import("../lib/encyclopedia/index-store")
        .then((m) => m.prefetchEncyclopediaIndex(queryClient))
        .catch(() => {});
      // Campaign opening stories are dynamic content: the bundled snapshot
      // is only a seed. This lightweight delta sync picks up intros published
      // after the APK was built, without a new release.
      import("../lib/campaigns/intro/content-sync")
        .then((m) => m.startCampaignIntroContentSync())
        .catch(() => {});
    };


    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    const idleHandle = idle
      ? idle(startOfflineSync, { timeout: 5000 })
      : window.setTimeout(startOfflineSync, 2000);


    const onOnline = () => {
      // Reconcile when network returns: flush queued progress/rewards and
      // refresh the offline snapshot so cached content stays current.
      import("../lib/campaignLedger").then((l) => l.flushPending()).catch(() => {});
      import("../lib/offline-snapshot").then((m) => m.bootstrapOfflineSync()).catch(() => {});
    };
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
            if (event === "SIGNED_IN") {
              // Campaign intro history: restore-only mirror. Never gates
              // playback — the local record stays the display authority.
              import("../lib/campaigns/intro/sync")
                .then((m) => m.hydrateCampaignIntrosFromServer())
                .catch(() => {});
              import("../lib/importedCampaignProgress")
                .then((m) => m.hydrateLegacyProgressFromCloud())
                .catch(() => {})
                .finally(() => {
                  import("../lib/campaignReconciliation")
                    .then((m) => m.reconcileLegacyCampaignProgress())
                    .catch(() => {});
                });
            }

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

    // ---------- Warm-resume heartbeat ----------
    // Persist a "last active" timestamp so a quick background→foreground hop
    // (even one that destroys the WebView) is treated as a resume, not a
    // cold launch. SplashSequence reads this key to skip the cinematic
    // opening within a 30-minute window.
    const WARM_KEY = "irth.lastActive.v1";
    const beat = () => { try { localStorage.setItem(WARM_KEY, String(Date.now())); } catch { /* */ } };
    beat();
    const beatInterval = window.setInterval(beat, 15_000);
    const onAnyVis = () => beat();
    document.addEventListener("visibilitychange", onAnyVis);
    window.addEventListener("pagehide", beat);
    window.addEventListener("blur", beat);

    // Capacitor App lifecycle: refresh light things on resume; do NOT rebuild
    // the UI or re-run bootstrap. Heavy modules already loaded stay loaded.
    let removeAppStateSub: (() => void) | undefined;
    try {
      const cap = (window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { App?: { addListener?: (e: string, cb: (s: { isActive: boolean }) => void) => Promise<{ remove: () => void }> } } };
      }).Capacitor;
      if (cap?.isNativePlatform?.() && cap.Plugins?.App?.addListener) {
        void cap.Plugins.App.addListener("appStateChange", (state) => {
          if (state.isActive) {
            // Resumed — just freshen the heartbeat and light caches.
            beat();
            import("../lib/campaignLedger").then((l) => l.flushPending()).catch(() => {});
          } else {
            beat();
          }
        }).then((sub) => { removeAppStateSub = sub.remove; });
      }
    } catch { /* ignore */ }

    return () => {
      unsub?.();
      if (idle) {
        (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
      window.removeEventListener("online", onOnline);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onWindowError);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onAnyVis);
      window.removeEventListener("pagehide", beat);
      window.removeEventListener("blur", beat);
      window.clearInterval(beatInterval);
      removeAppStateSub?.();
    };
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <AccountProvider>
          <NavigationProvider>
            <TutorialProvider>
              <Outlet />
              {/* Ambience owner lives at the root so full-screen surfaces
                  (campaign intro, cinematic opening) can never orphan the
                  audio layer and let a previous era's track keep playing. */}
              <AudioInitializer />
              <CinematicOpening />
              <FirstLaunchGate />
              <AchievementEngineBoot />
              <AchievementWatcher />
              <InvestigationLegacyBackfill />
              <LevelUpWatcher />
              <StoryUnlockCelebration />
              <ContentUpdateBanner />
              <Toaster position="top-center" richColors closeButton />
              <SplashSequence />
              {/* Hardware Back + exit dialog now owned by <NavigationProvider>. */}
              <InAppBanner />
              <DailyChallengeReminderScheduler />
              <GoogleAuthResultDialog />
              <IrthAuthDialog />
              <RecoveryModeGuard />
              <TutorialFlagPublishers />
              <TutorialOverlay />
            </TutorialProvider>
          </NavigationProvider>
        </AccountProvider>
      </ProfileProvider>
    </QueryClientProvider>
  );
}


