import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * In-app breadcrumb / back link.
 *
 * Always points to an explicit parent route — never to browser history —
 * so a child page reliably steps ONE level up the route hierarchy regardless
 * of how the user arrived (deep link, notification, in-app nav, etc.).
 *
 * The Android hardware back button is handled separately by
 * the Navigation Engine; do not couple the two.
 *
 * Typical hierarchy:
 *   /                           → (root, no back)
 *   /encyclopedia               → back: الرئيسية (/)
 *   /encyclopedia/type/figure   → back: الموسوعة (/encyclopedia)
 *   /encyclopedia/entity/:id    → back: الشخصيات (/encyclopedia/type/figure)
 */
type LinkProps = ComponentProps<typeof Link>;
export function BackLink({
  to,
  params,
  search,
  label,
  className,
}: {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  search?: LinkProps["search"];
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to as any}
      params={params as any}
      search={search as any}
      className={
        "inline-flex items-center gap-1 text-[11px] tracking-[0.18em] text-gold/85 transition hover:text-gold " +
        (className ?? "")
      }
      aria-label={`الرجوع إلى ${label}`}
    >
      {/* In RTL layout this chevron visually points "back" (rightwards). */}
      <ChevronRight className="size-3.5" />
      <span>{label}</span>
    </Link>
  );
}
