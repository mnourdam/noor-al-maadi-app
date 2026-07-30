// ============================================================
// Campaign Intro — interaction acceptance tests
// Hold-to-pause, RTL tap zones, swipe direction, fade gating.
// ============================================================
import { describe, it, expect } from "bun:test";
import {
  IntroPlaybackMachine,
  classifyGesture,
  swipeDirection,
  tapZone,
  FADE_IN_MS,
  FADE_OUT_MS,
  LONG_PRESS_THRESHOLD_MS,
  SWIPE_THRESHOLD_PX,
} from "@/lib/campaigns/intro/interaction";

const WIDTH = 400;
const DWELL = 1000;

/** Deterministic clock + timer queue. */
function harness(opts: { total?: number; reducedMotion?: boolean } = {}) {
  let now = 0;
  let seq = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let completed = 0;
  const machine = new IntroPlaybackMachine({
    total: opts.total ?? 3,
    reducedMotion: opts.reducedMotion,
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
  /** Run a full fade (out + in) so playback resumes. */
  const settle = () => advance(FADE_OUT_MS + FADE_IN_MS + 1);
  machine.start();
  return { machine, advance, settle, completed: () => completed, now: () => now };
}

describe("gesture classification", () => {
  it("maps RTL tap zones: right = previous, left = next", () => {
    expect(tapZone(WIDTH * 0.9, WIDTH)).toBe("previous");
    expect(tapZone(WIDTH * 0.1, WIDTH)).toBe("next");
  });

  it("maps swipe direction literally (→ next, ← previous)", () => {
    expect(swipeDirection(SWIPE_THRESHOLD_PX + 1)).toBe("next");
    expect(swipeDirection(-(SWIPE_THRESHOLD_PX + 1))).toBe("previous");
    expect(swipeDirection(SWIPE_THRESHOLD_PX)).toBeNull();
  });

  it("never reports a swipe as a tap", () => {
    const g = classifyGesture({ deltaX: 120, durationMs: 50, clientX: 10, width: WIDTH });
    expect(g.kind).toBe("swipe");
    expect(g.direction).toBe("next");
  });

  it("classifies a long, stationary press as a hold", () => {
    const g = classifyGesture({
      deltaX: 2,
      durationMs: LONG_PRESS_THRESHOLD_MS + 10,
      clientX: 10,
      width: WIDTH,
    });
    expect(g.kind).toBe("hold");
  });
});

describe("hold to pause", () => {
  it("1. long press stops progress and does not change scene", () => {
    const h = harness();
    h.advance(300);
    h.machine.pointerDown(200);
    expect(h.machine.getSnapshot().state).toBe("paused");
    const remaining = h.machine.getRemainingMs();
    h.advance(5000);
    expect(h.machine.getSnapshot().index).toBe(0);
    expect(h.machine.getRemainingMs()).toBe(remaining);
  });

  it("2. release after a hold resumes from the same position", () => {
    const h = harness();
    h.advance(400);
    h.machine.pointerDown(200);
    h.advance(2000);
    const g = h.machine.pointerUp(200, WIDTH);
    expect(g?.kind).toBe("hold");
    expect(h.machine.getSnapshot().state).toBe("playing");
    expect(h.machine.getRemainingMs()).toBe(DWELL - 400);
    expect(h.machine.getSnapshot().index).toBe(0);
    // and it still auto-advances afterwards
    h.advance(DWELL - 400);
    h.settle();
    expect(h.machine.getSnapshot().index).toBe(1);
  });

  it("13. pointercancel never leaves the player paused", () => {
    const h = harness();
    h.machine.pointerDown(200);
    expect(h.machine.getSnapshot().paused).toBe(true);
    h.machine.pointerCancel();
    expect(h.machine.getSnapshot().state).toBe("playing");
    h.advance(DWELL);
    h.settle();
    expect(h.machine.getSnapshot().index).toBe(1);
  });
});

describe("tap navigation (RTL)", () => {
  const tap = (h: ReturnType<typeof harness>, x: number) => {
    h.machine.pointerDown(x);
    h.advance(60);
    h.machine.pointerUp(x, WIDTH);
    h.settle();
  };

  it("3. tapping the right half goes back one scene", () => {
    const h = harness();
    tap(h, 20); // forward first
    expect(h.machine.getSnapshot().index).toBe(1);
    tap(h, 380);
    expect(h.machine.getSnapshot().index).toBe(0);
  });

  it("4. tapping the left half advances one scene", () => {
    const h = harness();
    tap(h, 20);
    expect(h.machine.getSnapshot().index).toBe(1);
  });

  it("12. first scene clamps back, last scene completes", () => {
    const h = harness({ total: 2 });
    tap(h, 380); // back on first scene
    expect(h.machine.getSnapshot().index).toBe(0);
    expect(h.completed()).toBe(0);
    tap(h, 20);
    expect(h.machine.getSnapshot().index).toBe(1);
    tap(h, 20); // past the end
    expect(h.completed()).toBe(1);
  });
});

describe("swipe navigation", () => {
  const swipe = (h: ReturnType<typeof harness>, from: number, to: number) => {
    h.machine.pointerDown(from);
    h.advance(80);
    h.machine.pointerMove(to);
    h.machine.pointerUp(to, WIDTH);
    h.settle();
  };

  it("5. swiping left → right advances", () => {
    const h = harness();
    swipe(h, 50, 250);
    expect(h.machine.getSnapshot().index).toBe(1);
  });

  it("6. swiping right → left goes back", () => {
    const h = harness();
    swipe(h, 50, 250);
    swipe(h, 300, 100);
    expect(h.machine.getSnapshot().index).toBe(0);
  });

  it("7. a swipe never also triggers a tap", () => {
    const h = harness();
    // Swipe ends on the RIGHT half; a tap there would go back.
    swipe(h, 100, 380);
    expect(h.machine.getSnapshot().index).toBe(1);
  });

  it("12b. swiping forward on the last scene completes", () => {
    const h = harness({ total: 2 });
    swipe(h, 50, 250);
    swipe(h, 50, 250);
    expect(h.completed()).toBe(1);
  });
});

describe("fade transitions", () => {
  it("8. fade runs on both automatic and manual navigation", () => {
    const auto = harness();
    auto.advance(DWELL);
    expect(auto.machine.getSnapshot().transitioning).toBe(true);
    expect(auto.machine.getSnapshot().opacity).toBe(0);
    auto.settle();
    expect(auto.machine.getSnapshot().state).toBe("playing");

    const manual = harness();
    manual.machine.pointerDown(20);
    manual.advance(50);
    manual.machine.pointerUp(20, WIDTH);
    expect(manual.machine.getSnapshot().transitioning).toBe(true);
    manual.settle();
    expect(manual.machine.getSnapshot().opacity).toBe(1);
  });

  it("scene data swaps only after fade-out, timer starts after fade-in", () => {
    const h = harness();
    h.advance(DWELL);
    expect(h.machine.getSnapshot().index).toBe(0); // still the old frame
    h.advance(FADE_OUT_MS);
    expect(h.machine.getSnapshot().index).toBe(1);
    expect(h.machine.getSnapshot().opacity).toBe(1);
    expect(h.machine.getSnapshot().state).toBe("transitioning");
    h.advance(FADE_IN_MS);
    expect(h.machine.getSnapshot().state).toBe("playing");
  });

  it("9. the dwell timer stays frozen for the whole fade", () => {
    const h = harness();
    h.advance(DWELL);
    const during = h.machine.getRemainingMs();
    h.advance(FADE_OUT_MS);
    expect(h.machine.getRemainingMs()).toBe(during);
    h.settle();
    expect(h.machine.getRemainingMs()).toBe(DWELL);
  });

  it("10. two transitions can never run at once", () => {
    const h = harness();
    h.machine.pointerDown(20);
    h.advance(50);
    h.machine.pointerUp(20, WIDTH);
    // repeated input mid-transition is ignored
    h.machine.pointerDown(20);
    h.machine.pointerUp(20, WIDTH);
    expect(h.machine.go("next")).toBe(false);
    h.settle();
    expect(h.machine.getSnapshot().index).toBe(1);
  });

  it("14. reduced motion keeps navigation working", () => {
    const h = harness({ reducedMotion: true });
    h.machine.pointerDown(20);
    h.advance(50);
    h.machine.pointerUp(20, WIDTH);
    h.advance(5);
    expect(h.machine.getSnapshot().index).toBe(1);
    expect(h.machine.getSnapshot().state).toBe("playing");
  });
});

describe("11. controls are not tap targets", () => {
  it("the player only navigates from pointer events it received", () => {
    // Skip/close buttons stop propagation, so the machine never sees a
    // pointerdown: pointerUp on an unarmed machine is a no-op.
    const h = harness();
    expect(h.machine.pointerUp(20, WIDTH)).toBeNull();
    expect(h.machine.getSnapshot().index).toBe(0);
    expect(h.machine.getSnapshot().state).toBe("playing");
  });
});
