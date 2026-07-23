// ============================================================
// Shared motion tokens for the story player.
// One motion designer, one language: every animation in the player
// pulls its easing from this file so nothing feels "authored by a
// different hand".
// ============================================================

/** Primary "cinematic" easing — soft entry, decisive settle. */
export const EASE_CINEMATIC = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Steady drift — used by Ken Burns and long fills. */
export const EASE_DRIFT = "cubic-bezier(0.33, 0.02, 0.35, 1)";
/** Gentle accent — for small acknowledgements (tap flashes, pause). */
export const EASE_SOFT = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** Standard fade duration for micro-interactions. */
export const DUR_FLASH = 420;
/** Standard "settle" duration used by progress + reveal. */
export const DUR_SETTLE = 700;
