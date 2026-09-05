// @vitest-environment jsdom
//
// V17-03 regression coverage.
//
// Two confirmed structural hazards are locked in here:
//
//  1. The level-up dialog used a one-shot `closedRef` latch shared by X,
//     the backdrop and "واصل الرحلة". The first tap latched it, so if that
//     render never produced an unmount the player was permanently trapped
//     behind the celebration and had to kill the app.
//  2. `ModalPortal` captured/restored body styles per instance. Two
//     overlapping portals left `body{position:fixed}` orphaned forever.
//
// Nothing about XP, level tables, rewards or progression persistence is
// exercised or changed here — only the close path and the body lock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ModalPortal,
  __getModalPortalLockCount,
  __resetModalPortalLock,
} from "@/components/ModalPortal";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

// ---------------------------------------------------------------
// 1. Close path — source-level guarantees
// ---------------------------------------------------------------

describe("level-up dialog close path", () => {
  const src = read("src/components/LevelUpWatcher.tsx");
  const modal = src.slice(src.indexOf("function LevelUpModal"));

  it("has no one-shot close latch (closedRef removed)", () => {
    expect(src).not.toContain("closedRef.current = true");
    expect(modal).not.toMatch(/const\s+\w*closed\w*Ref\s*=\s*useRef/i);
  });

  it("does not re-introduce an equivalent single-use guard or disabled control", () => {
    // No `if (<something>Ref.current) return;` early-exit inside the modal.
    expect(modal).not.toMatch(/if\s*\(\s*\w+Ref\.current\s*\)\s*return/);
    // Close controls are never disabled after a tap.
    expect(modal).not.toMatch(/disabled=\{/);
  });

  it("routes X, backdrop and Continue through the same handleClose", () => {
    const onClicks = modal.match(/onClick=\{handleClose\}/g) ?? [];
    // backdrop + X + "واصل الرحلة"
    expect(onClicks.length).toBe(3);
  });

  it("gives hardware Back the identical close path", () => {
    expect(modal).toContain('<OverlayDismissRegistration open onClose={handleClose} label="level-up" />');
  });

  it("handleClose simply delegates to the idempotent onClose", () => {
    const fn = modal.slice(modal.indexOf("const handleClose"));
    const body = fn.slice(0, fn.indexOf("}, [onClose]);"));
    expect(body).toContain("onClose();");
    expect(body).not.toContain("return;");
  });

  it("the watcher close is naturally idempotent", () => {
    const close = src.slice(src.indexOf("const close = useCallback"));
    expect(close.slice(0, close.indexOf("}, []);"))).toContain("setCurrent(null)");
  });

  it("marks the dialog root as role=dialog with data-state=open", () => {
    expect(modal).toMatch(/role="dialog"\s+data-state="open"/);
  });

  it("never calls the crash-path releases from the normal close", () => {
    expect(src).not.toContain("releaseAllUiLocks");
    expect(src).not.toContain("neutralizeBlockingOverlays");
    expect(src).not.toContain("pointerEvents");
  });

  it("adds no watchdog / forced-unmount / auto-close mechanism", () => {
    expect(src).not.toContain("forceHidden");
    expect(src).not.toContain("setTimeout");
    expect(src).not.toContain("location.reload");
  });
});

// ---------------------------------------------------------------
// 2. Duplicate-level protection preserved
// ---------------------------------------------------------------

describe("level-up duplicate protection is preserved", () => {
  const src = read("src/components/LevelUpWatcher.tsx");

  it("advances the in-memory baseline at detection time", () => {
    expect(src).toContain("baseline.current = lvl;");
  });

  it("advances the persisted seen level at detection time", () => {
    expect(src).toContain('const SEEN_KEY = "irth.levelup.seen"');
    expect(src).toContain("localStorage.setItem(SEEN_KEY, String(lvl))");
  });

  it("ignores any level at or below the baseline (replayed profile updates)", () => {
    expect(src).toContain("if (lvl <= baseline.current) return;");
  });

  it("silently re-baselines jumps greater than +1 and already-seen levels", () => {
    expect(src).toContain("if (lvl - baseline.current > 1 || lvl <= seen)");
  });

  it("de-duplicates the queue against the open dialog and pending entries", () => {
    expect(src).toContain("if (current?.level === next.level) return q;");
    expect(src).toContain("if (q.some((p) => p.level === next.level)) return q;");
  });

  it("keeps a real queue so a second +1 while one dialog is open is not lost", () => {
    expect(src).toContain("return [...q, next];");
    expect(src).toContain("setPending((q) => q.slice(1));");
  });

  it("keys the modal per level so a queued second dialog is a fresh instance", () => {
    expect(src).toContain("key={current.level}");
  });

  it("leaves the level table and levelFor untouched", () => {
    expect(src).toContain('import { LEVELS, levelFor, type LevelInfo } from "@/lib/progression";');
  });
});

// ---------------------------------------------------------------
// 3. ModalPortal reference-counted body lock — live DOM
// ---------------------------------------------------------------

describe("ModalPortal reference-counted body lock", () => {
  let containers: HTMLElement[] = [];
  let roots: Root[] = [];

  const mountPortal = () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<ModalPortal><div data-testid="content" /></ModalPortal>);
    });
    containers.push(host);
    roots.push(root);
    return root;
  };

  const unmount = (root: Root) => {
    act(() => root.unmount());
  };

  beforeEach(() => {
    __resetModalPortalLock();
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.documentElement.style.overflow = "";
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    for (const r of roots) {
      try { act(() => r.unmount()); } catch { /* already unmounted */ }
    }
    for (const c of containers) c.remove();
    roots = [];
    containers = [];
    __resetModalPortalLock();
  });

  const locked = () =>
    document.body.style.position === "fixed" &&
    document.documentElement.style.overflow === "hidden";

  it("a single portal locks and then fully restores the original styles", () => {
    const a = mountPortal();
    expect(locked()).toBe(true);
    expect(__getModalPortalLockCount()).toBe(1);
    unmount(a);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.width).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(__getModalPortalLockCount()).toBe(0);
  });

  it("restores pre-existing body/html styles exactly, not blanket defaults", () => {
    document.body.style.position = "relative";
    document.body.style.width = "50%";
    document.documentElement.style.overflow = "auto";
    const a = mountPortal();
    expect(document.body.style.position).toBe("fixed");
    unmount(a);
    expect(document.body.style.position).toBe("relative");
    expect(document.body.style.width).toBe("50%");
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("two overlapping portals: closing A first keeps the page locked until B closes", () => {
    const a = mountPortal();
    const b = mountPortal();
    expect(__getModalPortalLockCount()).toBe(2);
    unmount(a);
    expect(locked()).toBe(true); // must NOT unlock prematurely
    unmount(b);
    expect(locked()).toBe(false);
    expect(document.body.style.position).toBe("");
  });

  it("two overlapping portals: closing B first keeps the page locked until A closes", () => {
    const a = mountPortal();
    const b = mountPortal();
    unmount(b);
    expect(locked()).toBe(true);
    unmount(a);
    expect(locked()).toBe(false);
    expect(document.body.style.position).toBe("");
  });

  it("the second portal never re-captures the already locked styles", () => {
    const a = mountPortal();
    const b = mountPortal();
    unmount(b);
    unmount(a);
    // The old per-instance implementation restored `fixed` here.
    expect(document.body.style.position).not.toBe("fixed");
    expect(document.documentElement.style.overflow).not.toBe("hidden");
  });

  it("leaves no orphaned lock after three overlapping portals in mixed order", () => {
    const a = mountPortal();
    const b = mountPortal();
    const c = mountPortal();
    expect(__getModalPortalLockCount()).toBe(3);
    unmount(b);
    unmount(a);
    expect(locked()).toBe(true);
    unmount(c);
    expect(locked()).toBe(false);
    expect(__getModalPortalLockCount()).toBe(0);
  });

  it("restores the scroll position only when the last portal closes", () => {
    const a = mountPortal();
    const b = mountPortal();
    unmount(a);
    expect(window.scrollTo).not.toHaveBeenCalled();
    unmount(b);
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("survives a StrictMode-style mount/unmount/mount cycle without leaking the counter", () => {
    const a = mountPortal();
    unmount(a);
    const b = mountPortal();
    expect(__getModalPortalLockCount()).toBe(1);
    unmount(b);
    expect(__getModalPortalLockCount()).toBe(0);
    expect(locked()).toBe(false);
  });

  it("an extra release can never drive the counter negative", () => {
    const a = mountPortal();
    unmount(a);
    __resetModalPortalLock();
    expect(__getModalPortalLockCount()).toBe(0);
    const b = mountPortal();
    expect(__getModalPortalLockCount()).toBe(1);
    unmount(b);
    expect(locked()).toBe(false);
  });

  it("never touches pointer-events, so a still-open Radix modal keeps its own lock", () => {
    document.body.style.pointerEvents = "none";
    const a = mountPortal();
    unmount(a);
    expect(document.body.style.pointerEvents).toBe("none");
    document.body.style.pointerEvents = "";
  });

  it("the page is interactive again once the last modal closes", () => {
    const a = mountPortal();
    const b = mountPortal();
    unmount(a);
    unmount(b);
    expect(document.body.style.position).toBe("");
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
  });
});
