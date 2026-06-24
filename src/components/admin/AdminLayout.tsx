// ============================================================
// AdminLayout — unified shell for every /admin page
// ------------------------------------------------------------
// Wraps an admin page body with a consistent header, breadcrumb,
// back affordance, and page-content padding. Intentionally does
// NOT redesign visuals — same dark-slate / amber palette already
// used across admin pages.
//
// Usage:
//
//   export const Route = createFileRoute("/admin/users")({
//     component: () => (
//       <AdminGate>
//         <AdminLayout
//           title="إدارة المستخدمين"
//           subtitle="بحث وفلاتر وعمليات إدارية"
//           breadcrumbs={[{ label: "المستخدمون" }]}
//         >
//           <UsersPage />
//         </AdminLayout>
//       </AdminGate>
//     ),
//   });
//
// Existing admin pages keep their inline content; the layout
// supplies the chrome. Migration is incremental — pages that
// haven't adopted the layout yet continue to render as before.
// ============================================================

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export interface AdminBreadcrumb {
  label: string;
  to?: string;
}

export interface AdminLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: AdminBreadcrumb[];
  /** Optional action slot rendered on the trailing edge of the header. */
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminLayout({ title, subtitle, breadcrumbs, actions, children }: AdminLayoutProps) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-amber-500/20 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            لوحة الإدارة
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-amber-100">{title}</h1>
              {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="ms-auto flex items-center gap-2">{actions}</div>}
        </div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="breadcrumb" className="mx-auto max-w-6xl px-4 pb-2">
            <ol className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
              <li>
                <Link to="/admin" className="hover:text-amber-200">الإدارة</Link>
              </li>
              {breadcrumbs.map((b, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="text-slate-600">/</span>
                  {b.to ? (
                    <Link to={b.to as "/"} className="hover:text-amber-200">{b.label}</Link>
                  ) : (
                    <span className="text-amber-200">{b.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
