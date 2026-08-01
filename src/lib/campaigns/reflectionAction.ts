// ============================================================
// Reflective moment — action decision (pure)
// ------------------------------------------------------------
// A reflective moment is ALWAYS optional. The player either writes a
// reflection and saves it, or skips it with no input at all. These are two
// separate paths and must never share one handler: the skip path applies no
// text validation, writes no empty reflection, and grants no reward.
// ============================================================

export type ReflectionAction = "save" | "skip" | "next" | "edit";

export interface ReflectionActionInput {
  /** Raw textarea value, untrimmed. */
  text: string;
  /** Activity already completed (resolved earlier or in this session). */
  resolved: boolean;
  /** Reflection was persisted in this session and the player can move on. */
  saved: boolean;
  /** Read-only replay view of a completed moment. */
  isReplay: boolean;
  /** Player tapped "edit" on a replayed moment. */
  editing: boolean;
}

/** Whitespace-only input is empty input. */
export function hasReflectionText(text: string | null | undefined): boolean {
  return (text ?? "").trim().length > 0;
}

/** Which single action button the reflective moment shows right now. */
export function reflectionAction(input: ReflectionActionInput): ReflectionAction {
  if (input.isReplay && !input.editing) return "edit";
  const written = hasReflectionText(input.text);
  if (input.saved && input.resolved && written) return "next";
  return written ? "save" : "skip";
}

/**
 * Skipping is never gated: no text, no choice, no hearts, no network.
 * Only the in-flight lock (double-tap guard) can refuse it.
 */
export function canSkipReflection(locked: boolean): boolean {
  return !locked;
}
