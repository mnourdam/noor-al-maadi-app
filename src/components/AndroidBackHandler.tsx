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

function immediateParent(path: string): string | null {
  const clean = normalizePath(path);
  if (clean === "/") return null;
  const parts = clean.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return normalizePath(`/${parts.slice(0, -1).join("/")}`);
}

/**
 * Build set of registered route path patterns from the router. Patterns may
 * include `$param` placeholders (e.g. `/encyclopedia/figures/$slug`).
 */
function getRegisteredPatterns(router: ReturnType<typeof useRouter>): string[] {
  const flat = (router as unknown as { flatRoutes?: Array<{ fullPath?: string; path?: string }> }).flatRoutes;
  if (!Array.isArray(flat)) return [];
  const set = new Set<string>();
  for (const r of flat) {
    const p = r.fullPath || r.path;
    if (typeof p === "string" && p.startsWith("/")) {
      set.add(p.replace(/\/+$/, "") || "/");
    }
  }
  return Array.from(set);
}

function patternMatches(pattern: string, pathname: string): boolean {
  const pp = pattern.split("/").filter(Boolean);
  const ap = pathname.split("/").filter(Boolean);
  // Allow splat
  const lastIsSplat = pp[pp.length - 1] === "$";
  if (!lastIsSplat && pp.length !== ap.length) return false;
  if (lastIsSplat && ap.length < pp.length - 1) return false;
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i];
    if (seg === "$") return true; // splat consumes rest
    if (seg.startsWith("$")) continue; // dynamic
    if (seg !== ap[i]) return false;
  }
  return true;
}

function isRegistered(patterns: string[], pathname: string): boolean {
  if (pathname === "/") return true;
  return patterns.some((p) => patternMatches(p, pathname));
}

/** Walk parents until we find one registered with the router, or reach "/". */
function findRegisteredParent(patterns: string[], path: string): string | null {
  let current = immediateParent(path);
  let guard = 0;
  while (current && guard++ < 20) {
    if (isRegistered(patterns, current)) return current;
    if (current === "/") return "/";
    current = immediateParent(current);
  }
  return null;
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
          const patterns = getRegisteredPatterns(router);
          const parent = findRegisteredParent(patterns, path);
          console.log("[android:back] pathname=", path, "parentPath=", parent, "patternsCount=", patterns.length);

          if (path === "/" || parent === null) {
            console.log("[android:back] method=confirm-exit");
            setConfirmOpen(true);
            return;
          }
          if (parent === path) {
            console.warn("[android:back] method=skip (parent === pathname)");
            return;
          }

          console.log("[android:back] method=router.navigate ->", parent);
          try {
            await router.navigate({ to: parent as never, replace: false });
          } catch (e) {
            console.warn("[android:back] navigate threw, fallback history.push", e);
            router.history.push(parent);
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
