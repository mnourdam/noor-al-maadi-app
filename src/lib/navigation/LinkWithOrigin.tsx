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
import { useNavigationOrigin } from "./engine";
import type { NavigationOrigin } from "./types";

type BaseLinkProps = ComponentProps<typeof Link>;

// Approximate the destination pathname the same way the engine does
// when navigateWithOrigin() is called imperatively: substitute $params.
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
  const { origin, onClick, to, params, ...rest } = props;
  const stash = useStashOrigin();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e as never);
    if (e.defaultPrevented) return;
    // Ignore cmd/ctrl/shift/middle-click — they open a new tab and
    // never invoke Back within this window.
    if (
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey ||
      (e as unknown as { button?: number }).button
    ) {
      return;
    }
    const path = substituteParams(
      String(to ?? ""),
      params as Record<string, string> | undefined,
    );
    stash(path, origin);
  };

  return (
    <Link
      to={to as never}
      params={params as never}
      onClick={handleClick as never}
      {...(rest as never)}
    />
  );
}

/**
 * Low-level helper for cases where a <Link> is not appropriate
 * (list rows, imperative flows). Returns a function `(destPath, origin)`
 * that stashes the origin for the destination pathname.
 */
export function useStashOrigin() {
  const origins = useNavigationOrigin();
  return (destPath: string, origin: NavigationOrigin) => {
    // useNavigationOrigin is scoped to the CURRENT pathname; we need
    // to write into the destination's slot. Grab the engine directly.
    // The public API exposes .set() keyed on the current path — so we
    // temporarily reassign by leveraging engine internals via a fresh
    // hook call is not possible; instead, dispatch a window event that
    // the engine listens for. Simpler: expose a dedicated setter on
    // useNavigationOrigin. We route through it via a small shim.
    (origins as unknown as {
      __setForPath?: (dest: string, o: NavigationOrigin) => void;
    }).__setForPath?.(destPath, origin);
  };
}
