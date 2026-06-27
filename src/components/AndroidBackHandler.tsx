import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Android hardware back behavior:
 *   /encyclopedia/figures/123  → /encyclopedia/figures
 *   /encyclopedia/figures      → /encyclopedia
 *   /encyclopedia              → /
 *   /                          → Irth exit confirmation
 *
 * We always compute a parent path from the current URL rather than relying on
 * `canGoBack` / router history, which is unreliable on Capacitor WebView when
 * the user lands on a deep route via a notification, deep link, or reload.
 */

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function parentOf(path: string): string | null {
  const clean = normalizePath(path);
  if (clean === "/" || clean === "/home") return null;

  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";

  const parent = `/${parts.slice(0, -1).join("/")}`;
  return normalizePath(parent);
}

function dispatchRouterPopState() {
  try {
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.dispatchEvent(new Event("popstate"));
  }
}

export function AndroidBackHandler() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;

    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", async () => {
          const path = normalizePath(window.location.pathname || "/");
          const parent = parentOf(path);
          console.log("[android:back] current path=", path);
          console.log("[android:back] computed parent path=", parent);
          if (!parent) {
            console.log("[android:back] action=confirm-exit");
            setConfirmOpen(true);
            return;
          }

          if (parent === path) {
            console.warn("[android:back] action=skip-same-path", { path, parent });
            return;
          }

          console.log("[android:back] action=navigate->", parent);
          try {
            await router.navigate({ to: parent });
            const afterRouterPath = normalizePath(window.location.pathname || "/");
            if (afterRouterPath === path) {
              console.warn("[android:back] router stayed on same path, using history fallback", {
                path,
                parent,
              });
              window.history.pushState(null, "", parent);
              dispatchRouterPopState();
            }
          } catch (e) {
            console.warn("[android:back] router.navigate failed, falling back", e);
            window.history.pushState(null, "", parent);
            dispatchRouterPopState();
          }
        });
        listenerHandle = handle;
        console.log("[android:back] listener registered");
      } catch (err) {
        console.error("[android:back] failed to register", err);
      }
    })();

    return () => {
      listenerHandle?.remove();
    };
  }, [router]);

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir="rtl" className="border-amber-500/30">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-amber-100">هل تريد الخروج من التطبيق؟</AlertDialogTitle>
          <AlertDialogDescription className="leading-7 text-slate-300">
            ستُحفظ آخر رحلة لك، ويمكنك العودة في أي وقت.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-slate-700">لا</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              try {
                const { App } = await import("@capacitor/app");
                App.exitApp();
              } catch { /* ignore */ }
            }}
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            نعم
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
