// ============================================================
// Global UI-lock release
// ------------------------------------------------------------
// Any full-screen layer (modal portal, cinematic opening gate,
// tutorial spotlight, Atlas stage, splash) can leave behind one
// of three things when it is unmounted by a route change or a
// render crash:
//
//   1. a body/html scroll lock (`position:fixed`, `overflow:hidden`)
//   2. an inert / aria-hidden branch
//   3. a `fixed inset-0` element that still eats pointer events
//
// (3) is what makes a route-error screen visible but unclickable.
// This module is the single place that undoes all three. It is
// deliberately dumb, synchronous and safe to call repeatedly.
// ============================================================

const LOCK_ATTRS = [
  "data-scroll-locked",
  "data-radix-scroll-lock",
  "data-irth-scroll-locked",
];

/** Resets body/html scroll + pointer locks. Restores the locked scroll offset. */
export function releaseScrollLocks(): void {
  if (typeof document === "undefined") return;
  try {
    const body = document.body;
    const html = document.documentElement;
    const lockedTop = body.style.top;
    for (const el of [body, html]) {
      el.style.position = "";
      el.style.top = "";
      el.style.width = "";
      el.style.overflow = "";
      el.style.overflowY = "";
      el.style.pointerEvents = "";
      el.style.touchAction = "";
      for (const attr of LOCK_ATTRS) el.removeAttribute(attr);
    }
    const y = Math.abs(parseInt(lockedTop || "0", 10));
    if (Number.isFinite(y) && y > 0) window.scrollTo(0, y);
  } catch {
    /* never throw from a recovery path */
  }
}

/** Clears `inert` / `aria-hidden` left on the app tree by a modal. */
export function releaseInertBranches(): void {
  if (typeof document === "undefined") return;
  try {
    document
      .querySelectorAll<HTMLElement>("body > [aria-hidden='true'], body > [inert]")
      .forEach((el) => {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("inert");
      });
  } catch {
    /* ignore */
  }
}

/** True when a real, still-mounted modal/dialog is on screen. */
export function hasVisibleModalLayer(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return Boolean(
      document.querySelector(
        "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [data-irth-cinematic-opening], [data-irth-tutorial-overlay]",
      ),
    );
  } catch {
    return false;
  }
}

/**
 * Neutralizes every full-screen `fixed`/`absolute` layer that is still
 * mounted above the recovery screen. Used ONLY on the crash path: the layer
 * is not removed (React still owns it) — it is made click-through and
 * hidden so the error screen underneath is reachable.
 *
 * ⚠️ Never call this on a success path. Some routes ARE a legitimate
 * full-screen fixed surface (the Atlas is `fixed inset-0 z-40`), and this
 * function cannot tell them apart from a stuck overlay — it would hide the
 * route itself, producing a blank screen with no error.
 *
 * Elements that opt out with `data-irth-recovery-layer` (the error screen
 * itself) are never touched.
 */
export function neutralizeBlockingOverlays(): void {
  if (typeof document === "undefined") return;
  try {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      if (el.hasAttribute("data-irth-recovery-layer")) return;
      if (el.closest("[data-irth-recovery-layer]")) return;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return;
      if (cs.pointerEvents === "none") return;
      const r = el.getBoundingClientRect();
      // Only genuinely screen-covering layers.
      if (r.width < vw * 0.9 || r.height < vh * 0.9) return;
      el.style.pointerEvents = "none";
      el.style.visibility = "hidden";
      el.setAttribute("data-irth-neutralized", "");
    });
  } catch {
    /* ignore */
  }
}

/**
 * Undoes `neutralizeBlockingOverlays`. Must run whenever the app returns to a
 * healthy interactive surface, otherwise a layer hidden during a previous
 * crash stays invisible for the rest of the session.
 */
export function restoreNeutralizedOverlays(): void {
  if (typeof document === "undefined") return;
  try {
    document
      .querySelectorAll<HTMLElement>("[data-irth-neutralized]")
      .forEach((el) => {
        el.style.pointerEvents = "";
        el.style.visibility = "";
        el.removeAttribute("data-irth-neutralized");
      });
  } catch {
    /* ignore */
  }
}

/**
 * Success-path release. Undoes ownerless scroll/inert locks and restores any
 * layer a previous crash hid — but never hides a mounted surface.
 */
export function releaseSurfaceLocks(): void {
  releaseScrollLocks();
  releaseInertBranches();
  restoreNeutralizedOverlays();
}

/** Full release used by crash/recovery screens ONLY. */
export function releaseAllUiLocks(): void {
  releaseScrollLocks();
  releaseInertBranches();
  neutralizeBlockingOverlays();
}

/**
 * Release used on every successful navigation: undoes locks that no longer
 * have an owner, but never disturbs a modal that is legitimately open.
 */
export function releaseStaleUiLocks(): void {
  if (hasVisibleModalLayer()) return;
  releaseScrollLocks();
  releaseInertBranches();
}

