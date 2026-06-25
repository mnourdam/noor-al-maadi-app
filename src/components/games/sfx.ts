// Game SFX hook layer — no audio assets required yet.
// Dispatches CustomEvents on `window` so a future audio layer can subscribe.
export type GameSfxKind =
  | "card_flip"
  | "ink_write"
  | "gold_unlock"
  | "correct"
  | "wrong"
  | "timeline_snap"
  | "thread_connect"
  | "museum_unlock"
  | "completion"
  | "tick"
  | "timeout";

export function sfx(kind: GameSfxKind): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("irth:sfx", { detail: { kind } }));
  } catch {
    /* noop */
  }
}
