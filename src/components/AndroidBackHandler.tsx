import { useEffect, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
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
 * Android hardware back behavior (history-first):
 *
 *   Priority 1: replay router navigation history (router.history.back()).
 *   Priority 2: only on a cold-start / deep-link with no in-app history,
 *               compute a parent route from the URL hierarchy.
 *   Priority 3: at "/" show exit dialog; elsewhere fall back to "/".
 *
 * The "internal navigation depth" counter tracks pathname changes that
 * happened inside this app session. It starts at 0 on mount, so the entry
 * route (cold start / deep link) does NOT count as in-app history.
 */

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] || "/";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  const withoutIndex = withLeadingSlash === "/index.html" ? "/" : withLeadingSlash;
  return withoutIndex.replace(/\/+$/, "") || "/";
}

function isRootPath(pathname: string): boolean {
  return normalizePath(pathname) === "/";
}

function getCandidateParents(pathname: string): string[] {
  const clean = normalizePath(pathname);
  if (isRootPath(clean)) return [];
  const parts = clean.split("/").filter(Boolean);
  const candidates: string[] = [];
  for (let length = parts.length - 1; length >= 0; length -= 1) {
    candidates.push(length === 0 ? "/" : normalizePath(`/${parts.slice(0, length).join("/")}`));
  }
  return Array.from(new Set(candidates));
}

export function AndroidBackHandler() {
  const router = useRouter();
  const currentPathname = useRouterState({ select: (s) => normalizePath(s.location.pathname || "/") });
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Tracks how many in-app navigations have occurred since mount.
  // 0 means we are still on the entry route — no usable in-app history.
  const internalDepthRef = useRef(0);
  const lastPathnameRef = useRef(currentPathname);
  // True when the next pathname change is the result of our own back press,
  // so the depth counter decrements instead of incrementing.
  const popInFlightRef = useRef(false);

  useEffect(() => {
    if (currentPathname === lastPathnameRef.current) return;
    lastPathnameRef.current = currentPathname;
    if (popInFlightRef.current) {
      popInFlightRef.current = false;
      internalDepthRef.current = Math.max(0, internalDepthRef.current - 1);
    } else {
      internalDepthRef.current += 1;
    }
    // Encyclopedia breadcrumb — remember the last "listing" we visited so a
    // cold-start back press from an entity page can land on Figures/Cities/etc.
    try {
      if (currentPathname === "/encyclopedia" || currentPathname.startsWith("/encyclopedia/type/")) {
        sessionStorage.setItem("irth.encyclopedia.parent", currentPathname);
      }
    } catch { /* ignore */ }
  }, [currentPathname]);

  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (!cap || cap.getPlatform?.() !== "android") return;

    let listenerHandle: { remove: () => void } | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", () => {
          const path = lastPathnameRef.current;
          const depth = internalDepthRef.current;

          // Priority 1: in-app history → replay previous screen.
          if (depth > 0) {
            console.log("[android:back] history-back", { path, depth });
            popInFlightRef.current = true;
            // Safety: if the pathname effect never fires (same-route nav,
            // intercepted pop) clear the flag after a short window so the
            // next press doesn't decrement spuriously.
            setTimeout(() => { popInFlightRef.current = false; }, 800);
            try {
              router.history.back();
              return;
            } catch (e) {
              console.warn("[android:back] router.history.back failed, falling back", e);
              popInFlightRef.current = false;
            }
          }

          // Priority 2: cold-start / deep link → URL hierarchy fallback.
          if (!isRootPath(path)) {
            // Encyclopedia-specific: from an entity page, prefer the last
            // visited type listing (Figures/Cities/etc.) over the bare
            // /encyclopedia/entity parent — that path is not a real page.
            if (path.startsWith("/encyclopedia/entity/") || path.startsWith("/encyclopedia/state/")) {
              let parent = "/encyclopedia";
              try {
                const remembered = sessionStorage.getItem("irth.encyclopedia.parent");
                if (remembered && remembered !== path) parent = remembered;
              } catch { /* ignore */ }
              console.log("[android:back] encyclopedia-fallback", { path, parent });
              try { router.history.push(parent); return; }
              catch (e) { console.warn("[android:back] enc fallback failed", e); }
            }

            const parents = getCandidateParents(path);
            const parent = parents[0] ?? "/";
            console.log("[android:back] url-hierarchy-fallback", { path, parent });
            try {
              router.history.push(parent);
              return;
            } catch (e) {
              console.warn("[android:back] fallback push failed", { parent, error: e });
            }
          }

          // Priority 3: at root → exit dialog.
          console.log("[android:back] confirm-exit", { path });
          setConfirmOpen(true);
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
          <AlertDialogCancel onClick={() => setConfirmOpen(false)} className="border-slate-700">لا</AlertDialogCancel>
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
