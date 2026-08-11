// ============================================================
// Campaign Intro — playback interaction machine
// ------------------------------------------------------------
// Pure, framework-free state machine that owns the three states
// the intro player can be in:
//
//   playing       — the dwell timer runs, the progress bar fills
//   paused        — finger is down; timer + progress frozen
//   transitioning — a fade-out/fade-in is running; input ignored
//
// The machine never touches the DOM. The React player feeds it
// pointer events and renders whatever `getSnapshot()` reports.
// Completion / skip semantics live in the player and are NOT
// changed here — the machine only reports "advance past the end".
// ============================================================

/** A press shorter than this is a tap; longer is a hold. */
export const LONG_PRESS_THRESHOLD_MS = 200;
/** Horizontal travel required before a gesture counts as a swipe. */
export const SWIPE_THRESHOLD_PX = 50;
/** Current scene fades out over this long. */
export const FADE_OUT_MS = 180;
/** New scene fades in over this long. */
export const FADE_IN_MS = 280;
/** Reduced-motion fade budget (kept non-zero so state order holds). */
export const REDUCED_FADE_MS = 1;

export type IntroPlaybackState = "playing" | "paused" | "transitioning";
export type IntroDirection = "next" | "previous";

/** Which half of the screen was tapped, in RTL terms. */
export function tapZone(clientX: number, width: number): IntroDirection {
  // RTL reading order: right half goes BACK, left half goes FORWARD.
  return clientX >= width / 2 ? "previous" : "next";
}

/** Swipe direction mapping (deltaX > 0 ⇒ next, < 0 ⇒ previous). */
export function swipeDirection(deltaX: number): IntroDirection | null {
  if (deltaX > SWIPE_THRESHOLD_PX) return "next";
  if (deltaX < -SWIPE_THRESHOLD_PX) return "previous";
  return null;
}

export interface IntroGesture {
  kind: "swipe" | "tap" | "hold";
  direction?: IntroDirection;
}

/** Decide what a completed pointer interaction was. */
export function classifyGesture(input: {
  deltaX: number;
  durationMs: number;
  clientX: number;
  width: number;
}): IntroGesture {
  const swipe = swipeDirection(input.deltaX);
  if (swipe) return { kind: "swipe", direction: swipe };
  if (input.durationMs >= LONG_PRESS_THRESHOLD_MS) return { kind: "hold" };
  return { kind: "tap", direction: tapZone(input.clientX, input.width) };
}

export interface IntroSnapshot {
  state: IntroPlaybackState;
  /** Index of the scene whose DATA should be rendered. */
  index: number;
  /** 0 → fully hidden, 1 → fully visible. Drives the fade layer. */
  opacity: number;
  paused: boolean;
  transitioning: boolean;
}

export interface IntroMachineOptions {
  total: number;
  dwellMsFor: (index: number) => number;
  /** Fired once when advancing past the final scene. */
  onComplete: () => void;
  onChange?: (snapshot: IntroSnapshot) => void;
  reducedMotion?: boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
  initialIndex?: number;
}

export class IntroPlaybackMachine {
  private opts: Required<
    Pick<IntroMachineOptions, "now" | "setTimer" | "clearTimer" | "reducedMotion">
  > &
    IntroMachineOptions;

  private state: IntroPlaybackState = "playing";
  private index: number;
  private opacity = 1;

  /** Dwell bookkeeping. */
  private remainingMs = 0;
  private startedAt = 0;
  private timer: number | null = null;

  /** Pointer bookkeeping. */
  private pointerActive = false;
  private downAt = 0;
  private downX = 0;
  private swipeArmed = false;

  private destroyed = false;
  private completed = false;

  constructor(options: IntroMachineOptions) {
    this.opts = {
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimer: (id) => clearTimeout(id),
      reducedMotion: false,
      ...options,
    };
    this.index = options.initialIndex ?? 0;
  }

  // ---- public API ------------------------------------------------

  start(): void {
    this.remainingMs = this.opts.dwellMsFor(this.index);
    this.enterPlaying();
  }

  getSnapshot(): IntroSnapshot {
    return {
      state: this.state,
      index: this.index,
      opacity: this.opacity,
      paused: this.state === "paused",
      transitioning: this.state === "transitioning",
    };
  }

  /** Remaining dwell right now (frozen while paused/transitioning). */
  getRemainingMs(): number {
    if (this.state !== "playing") return this.remainingMs;
    return Math.max(0, this.remainingMs - (this.opts.now() - this.startedAt));
  }

  pointerDown(x: number): void {
    if (this.destroyed || this.state === "transitioning") return;
    this.pointerActive = true;
    this.swipeArmed = false;
    this.downAt = this.opts.now();
    this.downX = x;
    this.state = "paused";
    this.emit();
  }

  pointerMove(x: number): void {
    if (!this.pointerActive) return;
    if (Math.abs(x - this.downX) > SWIPE_THRESHOLD_PX) this.swipeArmed = true;
  }

  /** Returns the gesture that was performed, for diagnostics/tests. */
  pointerUp(x: number, width: number): IntroGesture | null {
    if (!this.pointerActive) return null;
    this.pointerActive = false;
    const gesture = classifyGesture({
      deltaX: x - this.downX,
      durationMs: this.opts.now() - this.downAt,
      clientX: x,
      width,
    });
    if (gesture.kind === "hold") {
      this.resume();
      this.emit(); // ensure React sees the state change
      return gesture;
    }
    // A swipe never also counts as a tap: classifyGesture returns one.
    this.go(gesture.direction!);
    return gesture;
  }

  /** Cancellation must never leave the player stuck in `paused`. */
  pointerCancel(): void {
    if (!this.pointerActive) return;
    this.pointerActive = false;
    this.swipeArmed = false;
    this.resume();
    this.emit();
  }

  /** Programmatic navigation (auto-advance, keyboard, debug). */
  go(direction: IntroDirection): boolean {
    if (this.destroyed || this.state === "transitioning") return false;
    const target = direction === "next" ? this.index + 1 : this.index - 1;
    if (target < 0) {
      // First scene: tapping/swiping back is a no-op, playback resumes.
      this.resume();
      return false;
    }
    if (target >= this.opts.total) {
      this.clearTimer();
      if (!this.completed) {
        this.completed = true;
        this.opts.onComplete();
      }
      return false;
    }
    this.beginTransition(target);
    return true;
  }

  /** External hold (e.g. while a scene card is being exported). */
  pauseExternal(): void {
    this.pause();
  }

  /** Release an external hold; a no-op unless currently paused. */
  resumeExternal(): void {
    this.resume();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimer();
  }


  // ---- internals -------------------------------------------------

  private clearTimer(): void {
    if (this.timer != null) {
      this.opts.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    this.opts.onChange?.(this.getSnapshot());
  }

  private enterPlaying(): void {
    if (this.destroyed) return;
    this.state = "playing";
    this.opacity = 1;
    this.startedAt = this.opts.now();
    this.clearTimer();
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      this.go("next");
    }, Math.max(0, this.remainingMs));
    this.emit();
  }

  private pause(): void {
    if (this.state !== "playing") return;
    this.remainingMs = this.getRemainingMs();
    this.clearTimer();
    this.state = "paused";
    this.emit();
  }

  private resume(): void {
    if (this.state !== "paused") return;
    this.enterPlaying();
  }

  private fadeOutMs(): number {
    return this.opts.reducedMotion ? REDUCED_FADE_MS : FADE_OUT_MS;
  }

  private fadeInMs(): number {
    return this.opts.reducedMotion ? REDUCED_FADE_MS : FADE_IN_MS;
  }

  private beginTransition(target: number): void {
    this.clearTimer();
    this.state = "transitioning";
    this.opacity = 0; // fade the current scene out
    this.emit();

    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      if (this.destroyed) return;
      // Swap scene data only once the old frame is fully hidden.
      this.index = target;
      this.opacity = 1; // fade the new scene in
      this.emit();
      this.timer = this.opts.setTimer(() => {
        this.timer = null;
        if (this.destroyed) return;
        // The dwell timer starts only after fade-in completes.
        this.remainingMs = this.opts.dwellMsFor(this.index);
        this.enterPlaying();
      }, this.fadeInMs());
    }, this.fadeOutMs());
  }
}
