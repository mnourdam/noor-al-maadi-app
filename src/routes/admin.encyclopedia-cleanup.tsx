// Admin Encyclopedia Cleanup — layout shell.
// Holds the AdminGate, the sub-navigation bar, and an <Outlet /> for
// the workshop index and its productivity sub-routes (review, redirects,
// integrity, import-preview).
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BookOpenCheck, GitCompareArrows, Network, ScanSearch, Shield, Workflow,
} from "lucide-react";
import { AdminGate } from "@/lib/admin-guard";

export const Route = createFileRoute("/admin/encyclopedia-cleanup")({
  head: () => ({
    meta: [
      { title: "ورشة الموسوعة — إرث" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AdminGate>
      <CleanupLayout />
    </AdminGate>
  ),
});

const TABS = [
  { to: "/admin/encyclopedia-cleanup", label: "الورشة", icon: BookOpenCheck, exact: true },
  { to: "/admin/encyclopedia-cleanup/review", label: "مراجعة جماعية", icon: GitCompareArrows },
  { to: "/admin/encyclopedia-cleanup/redirects", label: "التحويلات", icon: Workflow },
  { to: "/admin/encyclopedia-cleanup/integrity", label: "العلاقات", icon: Network },
  { to: "/admin/encyclopedia-cleanup/import-preview", label: "معاينة استيراد", icon: ScanSearch },
] as const;

function CleanupLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="border-b border-amber-500/20 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-amber-400" />
            <span className="text-sm font-bold text-amber-100">ورشة الموسوعة</span>
          </div>
          <nav className="flex flex-wrap items-center gap-1.5">
            {TABS.map((t) => {
              const active = t.exact
                ? pathname === t.to || pathname === t.to + "/"
                : pathname.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                      : "border-slate-700/60 bg-slate-900/40 text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <t.icon className="size-3.5" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
