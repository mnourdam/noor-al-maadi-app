import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Compact in-app breadcrumb trail. RTL-friendly, no horizontal scroll.
 *
 * - Last item is the current page (plain text, non-tappable).
 * - Earlier items are tappable links to their respective parents.
 * - On narrow screens the trail collapses automatically: only the last two
 *   items are shown (parent › current). Wider viewports reveal the full trail.
 *
 * Does NOT replace the hardware back button or `BackLink` — this is purely
 * a wayfinding aid that makes the player's location in the hierarchy
 * obvious at a glance.
 */
type LinkProps = ComponentProps<typeof Link>;

export type Crumb = {
  label: string;
  to?: LinkProps["to"];
  params?: LinkProps["params"];
  search?: LinkProps["search"];
};

export function Breadcrumbs({
  items,
  onBack,
  className,
}: {
  items: Crumb[];
  onBack?: () => void;
  className?: string;
}) {
  if (!items.length) return null;
  const lastIdx = items.length - 1;

  return (
    <nav
      aria-label="مسار التنقل"
      dir="rtl"
      className={
        "min-w-0 max-w-full text-[11px] tracking-[0.14em] " + (className ?? "")
      }
    >
      <ol className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-hidden">
        {items.map((item, i) => {
          const isLast = i === lastIdx;
          // On mobile: only show parent (lastIdx - 1) and current (lastIdx).
          // Earlier crumbs are hidden until sm.
          const hideOnMobile = i < lastIdx - 1;
          const sepHideOnMobile = i <= lastIdx - 2; // hide the separator that *precedes* a hidden item, plus the one between hidden tail
          return (
            <Fragment key={`${i}-${item.label}`}>
              {i > 0 && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-hidden="true"
                  className={
                    "group flex shrink-0 items-center justify-center p-1 -m-1 transition-transform active:scale-90 " +
                    (sepHideOnMobile ? "hidden sm:inline-flex" : "")
                  }
                >
                  <ChevronLeft
                    className="size-3 text-gold/40 group-hover:text-gold/70"
                  />
                </button>
              )}
              <li
                className={
                  "min-w-0 " + (hideOnMobile ? "hidden sm:inline-flex" : "inline-flex")
                }
              >
                {isLast || !item.to ? (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className="block max-w-[60vw] truncate text-gold/95"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to as any}
                    params={item.params as any}
                    search={item.search as any}
                    className="block max-w-[40vw] truncate text-gold/65 transition hover:text-gold sm:max-w-[28ch]"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
