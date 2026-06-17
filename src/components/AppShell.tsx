import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Puzzle, HelpCircle, Calendar, Map, User } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { to: "/", label: "الرئيسية", icon: BookOpen },
  { to: "/puzzles", label: "ألغاز", icon: Puzzle },
  { to: "/who-am-i", label: "من أنا؟", icon: HelpCircle },
  { to: "/on-this-day", label: "هذا اليوم", icon: Calendar },
  { to: "/journey", label: "الرحلة", icon: Map },
  { to: "/profile", label: "حسابي", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col pb-24">
      <div className="flex-1">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3 pb-3">
        <div className="glass shadow-elegant grid grid-cols-6 items-center gap-1 rounded-2xl border border-white/10 p-1.5">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[10px] transition-all ${
                  active ? "bg-gradient-gold text-primary-foreground shadow-gold" : "text-muted-foreground hover:text-foreground"
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
  );
}

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="px-5 pt-8">
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="ornament-divider mt-3" />
      </div>
      {children}
    </div>
  );
}