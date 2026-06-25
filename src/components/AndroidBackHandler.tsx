import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * Android hardware/system back button handler.
 *
 * - If there is in-app history, go back one step.
 * - Else if not on "/", navigate to "/".
 * - Else require a second press within 2s to exit the app.
 *
 * No-op on web (web back button is browser-native).
 */
export function AndroidBackHandler() {
  const router = useRouter();

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;

    let lastBackAt = 0;
    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          const path = window.location.pathname;
          // eslint-disable-next-line no-console
          console.log("[android:back] pressed", { path, canGoBack });

          // Prefer router history; fall back to canGoBack from native.
          const histLen = router.history.length;
          if (histLen > 1) {
            console.log("[android:back] router.history.back()");
            router.history.back();
            return;
          }
          if (canGoBack) {
            console.log("[android:back] window.history.back()");
            window.history.back();
            return;
          }
          if (path !== "/" && path !== "/index.html") {
            console.log("[android:back] navigate -> /");
            void router.navigate({ to: "/" });
            return;
          }
          const now = Date.now();
          if (now - lastBackAt < 2000) {
            console.log("[android:back] exit");
            App.exitApp();
            return;
          }
          lastBackAt = now;
          toast("اضغط مرة أخرى للخروج");
        });
        listenerHandle = handle;
      } catch (err) {
        console.error("[android:back] failed to register", err);
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [router]);

  return null;
}
