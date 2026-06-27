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
          console.log("[android:back] pathname=", path, "parentPath=", parent);
          if (!parent) {
            console.log("[android:back] method=confirm-exit (no parent)");
            setConfirmOpen(true);
            return;
          }

          if (parent === path) {
            console.warn("[android:back] method=skip (parent === pathname)", { path });
            return;
          }

          // Use router.history.push — works with raw URLs, unlike
          // router.navigate({to}) which expects route templates ($params).
          try {
            console.log("[android:back] method=router.history.push ->", parent);
            router.history.push(parent);
            setTimeout(() => {
              const after = normalizePath(window.location.pathname || "/");
              if (after === path) {
                console.warn("[android:back] method=popstate-fallback (history.push no-op) ->", parent);
                window.history.pushState(null, "", parent);
                dispatchRouterPopState();
              } else {
                console.log("[android:back] navigated. now=", after);
              }
            }, 50);
          } catch (e) {
            console.warn("[android:back] method=popstate-fallback (history.push threw)", e);
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
