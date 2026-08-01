import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Swords, Map, Library, User, BookOpen } from "lucide-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { HUD } from "./HUD";
import { FriendNotificationsPoller } from "./FriendNotificationsPoller";

import { androidMark, isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { isSectionEnabled } from "@/lib/androidQuietMode";

const tabs = [
  { to: "/", label: "الرئيسية", icon: Compass, tutorialTargetId: null },
  { to: "/campaigns", label: "الحملات", icon: Swords, tutorialTargetId: "nav-campaigns" },
  { to: "/encyclopedia", label: "الموسوعة", icon: BookOpen, tutorialTargetId: "nav-encyclopedia" },
  // Player-facing label stays "الأطلس"; route remains `/map`.
  { to: "/map", label: "الأطلس", icon: Map, tutorialTargetId: "nav-atlas" },
  { to: "/collection", label: "المتحف", icon: Library, tutorialTargetId: "nav-museum" },
  { to: "/profile", label: "حسابي", icon: User, tutorialTargetId: "nav-profile" },
] as const;

const AppShellNestingContext = createContext(false);

export function AppShell({ children }: { children: ReactNode }) {
  androidMark("render:AppShell");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const androidStable = isAndroidUltraStableMode();
  const nestedShell = useContext(AppShellNestingContext);

  useEffect(() => {
    androidMark("route.navigation.commit", { pathname });
    androidMark("commit:AppShell", { pathname });
  }, [pathname]);

  // Native-app polish: while the player shell is mounted (and we're not on an
  // admin route), mark the body so the "player scope" CSS in styles.css kicks
  // in (no text selection, no link previews, no drag ghosts), and swallow
  // right-click / long-press context menus. Admin pages keep normal browser
  // behavior — copy/paste, selection, tooltips — because the flag is never
  // set for them.
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    document.body.setAttribute("data-app-scope", "player");
    const onContextMenu = (event: Event) => {
      const target = event.target as HTMLElement | null;
      // Preserve context menu on real editable fields so paste still works.
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.body.removeAttribute("data-app-scope");
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [pathname]);

  if (androidStable && nestedShell) {
    return <>{children}</>;
  }

  return (
    <AppShellNestingContext.Provider value={true}>
      <div
        className="mx-auto flex min-h-screen w-full max-w-md md:max-w-3xl xl:max-w-5xl flex-col"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <HUD />
        {!androidStable && isSectionEnabled("friendPoller") && <FriendNotificationsPoller />}
        {/* Legacy BackNavigationGuard removed — hardware Back is owned by
            the Navigation Engine (single Capacitor listener). Web back uses
            the browser's native history; no sentinel hack required. */}
        <div className="section-flow relative z-20 flex-1">
          <div key={pathname} className="motion-page">{children}</div>
        </div>
        <nav
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl px-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="glass shadow-elegant grid grid-cols-6 items-center gap-1 rounded-2xl border border-white/10 p-1.5 md:gap-2 md:p-2">
            {tabs.map(({ to, label, icon: Icon, tutorialTargetId }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  {...(tutorialTargetId
                    ? { "data-tutorial-target": tutorialTargetId }
                    : {})}
                  className={`motion-tap flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] transition-all duration-200 ${
                    active ? "bg-gradient-gold text-primary-foreground shadow-gold motion-nav-active" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" strokeWidth={active ? 2.5 : 1.8} />
                  <span className="font-medium">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

      </div>
    </AppShellNestingContext.Provider>
  );
}

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="px-5 pt-5">
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold leading-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground/90">{subtitle}</p>}
        <div className="ornament-divider mt-2.5" />
      </div>
      {children}
    </div>
  );
}