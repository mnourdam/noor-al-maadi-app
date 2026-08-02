// ============================================================
// Campaign Intro — long-press acceptance tests
// ------------------------------------------------------------
// Covers the "hold anywhere to pause" contract:
//   * a hold over artwork, over narrative text, or on the final
//     ("كشف") scene all pause identically — the interaction surface
//     sits above every scene layer, so the hit target never depends
//     on what is painted underneath;
//   * releasing resumes from the exact same remaining time;
//   * a long press never degrades into a tap (no scene change);
//   * text selection / callout / context menu are disabled on Android,
//     iOS and the web via the rendered markup contract.
// ============================================================
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IntroPlaybackMachine,
  FADE_IN_MS,
  FADE_OUT_MS,
  LONG_PRESS_THRESHOLD_MS,
} from "@/lib/campaigns/intro/interaction";

const WIDTH = 400;
const DWELL = 5000;

function harness(opts: { total?: number; initialIndex?: number } = {}) {
  let now = 0;
  let seq = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let completed = 0;
  const machine = new IntroPlaybackMachine({
    total: opts.total ?? 3,
    initialIndex: opts.initialIndex ?? 0,
    dwellMsFor: () => DWELL,
    onComplete: () => {
      completed += 1;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const id = seq++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
  });
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, t] of timers) {
        if (t.at <= target && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId == null) break;
      const t = timers.get(nextId)!;
      timers.delete(nextId);
      now = t.at;
      t.fn();
    }
    now = target;
  };
  machine.start();
  return { machine, advance, completed: () => completed };
}

/** Every press point is the same gesture: the surface covers the screen. */
const PRESS_POINTS: Array<[string, number]> = [
  ["artwork (top/right area)", WIDTH * 0.85],
  ["narrative text box (centre)", WIDTH * 0.5],
  ["overlay/scrim (left area)", WIDTH * 0.12],
];

describe("long press pauses anywhere on the scene", () => {
  for (const [label, x] of PRESS_POINTS) {
    it(`pauses when held over ${label}`, () => {
      const h = harness();
      h.advance(1200);
      h.machine.pointerDown(x);
      expect(h.machine.getSnapshot().paused).toBe(true);
      const frozen = h.machine.getRemainingMs();
      h.advance(10_000);
      // timer, progress bar and auto-advance are all frozen
      expect(h.machine.getRemainingMs()).toBe(frozen);
      expect(h.machine.getSnapshot().index).toBe(0);
      expect(h.machine.getSnapshot().transitioning).toBe(false);
    });
  }

  it("pauses on the final reveal (كشف) scene and never ends while held", () => {
    const h = harness({ total: 3, initialIndex: 2 });
    h.advance(500);
    h.machine.pointerDown(WIDTH * 0.5);
    h.advance(60_000);
    expect(h.machine.getSnapshot().paused).toBe(true);
    expect(h.completed()).toBe(0); // intro did NOT finish under the finger
    expect(h.machine.getRemainingMs()).toBe(DWELL - 500);
  });

  it("resumes from the same moment on release (final scene included)", () => {
    const h = harness({ total: 3, initialIndex: 2 });
    h.advance(1500);
    h.machine.pointerDown(WIDTH * 0.5);
    h.advance(9000);
    const g = h.machine.pointerUp(WIDTH * 0.5, WIDTH);
    expect(g?.kind).toBe("hold");
    expect(h.machine.getSnapshot().state).toBe("playing");
    expect(h.machine.getRemainingMs()).toBe(DWELL - 1500);
    h.advance(DWELL - 1500 + 1);
    expect(h.completed()).toBe(1);
  });

  it("a long press never becomes a tap (no next/previous)", () => {
    const h = harness();
    h.machine.pointerDown(WIDTH * 0.1); // left half = "next" zone
    h.advance(LONG_PRESS_THRESHOLD_MS + 400);
    const g = h.machine.pointerUp(WIDTH * 0.1, WIDTH);
    expect(g?.kind).toBe("hold");
    expect(h.machine.getSnapshot().index).toBe(0);
    expect(h.machine.getSnapshot().transitioning).toBe(false);
  });

  it("a cancelled press (system gesture) resumes instead of sticking paused", () => {
    const h = harness();
    h.advance(800);
    h.machine.pointerDown(WIDTH * 0.5);
    h.machine.pointerCancel();
    expect(h.machine.getSnapshot().state).toBe("playing");
    expect(h.machine.getRemainingMs()).toBe(DWELL - 800);
  });

  it("short taps still navigate after the fix", () => {
    const h = harness();
    h.machine.pointerDown(WIDTH * 0.1);
    h.advance(80);
    expect(h.machine.pointerUp(WIDTH * 0.1, WIDTH)?.kind).toBe("tap");
    h.advance(FADE_OUT_MS + FADE_IN_MS + 1);
    expect(h.machine.getSnapshot().index).toBe(1);
  });
});

describe("no text selection / copy menu (Android, iOS, web)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/campaigns/CampaignIntroPlayer.tsx"),
    "utf8",
  );

  it("disables selection with both the standard and WebKit properties", () => {
    expect(src).toContain("userSelect: \"none\"");
    expect(src).toContain("WebkitUserSelect: \"none\"");
    // iOS long-press callout ("Copy / Select All") sheet
    expect(src).toContain("WebkitTouchCallout: \"none\"");
    // Android tap flash
    expect(src).toContain("WebkitTapHighlightColor");
  });

  it("suppresses the context menu and native drag on the root and the surface", () => {
    const contextMenuHandlers = src.match(/onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/g) ?? [];
    expect(contextMenuHandlers.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("onDragStart={(e) => e.preventDefault()}");
  });

  it("keeps the interaction surface above the scene, which is inert to pointers", () => {
    const surfaceIdx = src.indexOf("intro-interaction-surface");
    const fadeIdx = src.indexOf("intro-fade-layer");
    expect(fadeIdx).toBeGreaterThan(-1);
    expect(surfaceIdx).toBeGreaterThan(fadeIdx); // painted after ⇒ on top
    expect(src).toContain("pointer-events-none absolute inset-0 select-none"); // scene layer
    expect(src).toContain("absolute inset-0 z-20 touch-none select-none"); // surface
  });
});
