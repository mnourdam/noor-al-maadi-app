// ============================================================
// LinkWithOrigin — <Link> that stashes a navigation origin
// ------------------------------------------------------------
// Drop-in replacement for @tanstack/react-router's <Link>. On click
// it registers the caller's `origin` in the Navigation Engine so that
// pressing Back from the destination returns to that origin instead
// of the structural parent declared in the route registry.
//
// Preserves all native <Link> behaviors: href for cmd-click / long-
// press / preloading / accessibility. The origin stash is a no-op if
// the click is modified (new tab, download, etc.) or default-prevented.
// ============================================================

import { Link } from "@tanstack/react-router";
import type { ComponentProps, MouseEvent } from "react";
import { useStashOrigin } from "./engine";
import type { NavigationOrigin } from "./types";

type BaseLinkProps = ComponentProps<typeof Link>;

function substituteParams(
  pattern: string,
  params: Record<string, string> | undefined,
): string {
  if (!params) return pattern;
  return pattern
    .split("/")
    .map((seg) => (seg.startsWith("$") ? (params[seg.slice(1)] ?? seg) : seg))
    .join("/");
}

export type LinkWithOriginProps = BaseLinkProps & {
  /** Origin to record on click; consumed on the next Back press. */
  origin: NavigationOrigin;
};

export function LinkWithOrigin(props: LinkWithOriginProps) {
  const { origin, onClick, to, params } = props;
  const stash = useStashOrigin();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    (onClick as ((e: MouseEvent<HTMLAnchorElement>) => void) | undefined)?.(e);
    if (e.defaultPrevented) return;
    // Modified clicks (new tab, download, middle-click) never trigger
    // Back within this window — do not stash.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if ((e as unknown as { button?: number }).button) return;
    const path = substituteParams(
      String(to ?? ""),
      params as Record<string, string> | undefined,
    );
    stash(path, origin);
  };

  // Cast to `any` at the boundary: TanStack's <Link> uses a heavily
  // overloaded typed-route generic that resists composition through
  // a wrapper. We preserve every prop verbatim.
  const forwarded = { ...props } as Record<string, unknown>;
  delete forwarded.origin;
  forwarded.onClick = handleClick;
  return <Link {...(forwarded as ComponentProps<typeof Link>)} />;
}
