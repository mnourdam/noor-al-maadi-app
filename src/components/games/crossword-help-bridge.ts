// ============================================================
// Crossword Help Bridge
// ------------------------------------------------------------
// A tiny module-level singleton the CrosswordRenderer fills with
// imperative actions for its own local Help dialog. No React
// context, no fragile spec getters — just plain function refs.
// The host route reads from this bridge to power the in-game
// "كشف حرف" option without depending on game metadata or any
// generic help framework.
// ============================================================

export interface CrosswordHelpBridge {
  /** Returns true when there's at least one unrevealed letter to reveal. */
  hasUnrevealed: () => boolean;
  /** Reveal one unrevealed letter. Returns true on success. */
  revealOne: () => boolean;
}

let current: CrosswordHelpBridge | null = null;

export function setCrosswordHelpBridge(bridge: CrosswordHelpBridge | null) {
  current = bridge;
}

export function getCrosswordHelpBridge(): CrosswordHelpBridge | null {
  return current;
}
