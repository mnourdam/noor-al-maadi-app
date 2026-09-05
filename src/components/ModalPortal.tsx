import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into document.body and locks background scroll while open.
 * Ensures dialogs are always centered on the viewport regardless of ancestor
 * `transform` / `filter` / `perspective` containing blocks. Restores the
 * previous scroll position on close.
 *
 * The body/html lock is REFERENCE COUNTED at module scope.
 *
 * Why: the previous per-instance implementation captured `body.style.*` at
 * mount and blindly restored it at unmount. With two overlapping portals
 * (e.g. the level-up dialog + the story-unlock celebration, or a picker
 * opened over a dialog) the second instance captured the ALREADY LOCKED
 * styles, so whichever portal unmounted last "restored" `position: fixed`
 * permanently — an orphaned body lock that only an app restart cleared.
 *
 * Invariants:
 *  - the FIRST portal captures the original page styles and applies the lock
 *  - later portals only increment the counter; they never re-capture
 *  - closing one portal while another is still open does NOT unlock
 *  - only the LAST portal restores the original styles + scroll position
 *  - unmount order is irrelevant
 *
 * Nothing global is destroyed here: only the exact properties this module
 * set are reverted, and `pointer-events` is never touched, so a legitimate
 * Radix modal that is still open keeps its own lock intact.
 */

interface CapturedStyles {
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  htmlOverflow: string;
  scrollY: number;
}

let lockCount = 0;
let captured: CapturedStyles | null = null;

function acquireBodyLock(): void {
  if (typeof document === "undefined") return;
  lockCount += 1;
  // Already locked by an earlier portal — do not re-capture or re-apply.
  if (lockCount > 1) return;

  const { body, documentElement: html } = document;
  const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
  captured = {
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
    htmlOverflow: html.style.overflow,
    scrollY,
  };

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  html.style.overflow = "hidden";
}

function releaseBodyLock(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  // Another portal is still open — keep the page locked.
  if (lockCount > 0) return;

  const snapshot = captured;
  captured = null;
  if (!snapshot) return;

  const { body, documentElement: html } = document;
  body.style.position = snapshot.bodyPosition;
  body.style.top = snapshot.bodyTop;
  body.style.width = snapshot.bodyWidth;
  html.style.overflow = snapshot.htmlOverflow;
  if (typeof window !== "undefined") window.scrollTo(0, snapshot.scrollY);
}

/** Test-only introspection: how many portals currently hold the body lock. */
export function __getModalPortalLockCount(): number {
  return lockCount;
}

/** Test-only reset so one suite cannot leak lock state into the next. */
export function __resetModalPortalLock(): void {
  lockCount = 0;
  captured = null;
}

export function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    acquireBodyLock();
    return releaseBodyLock;
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
