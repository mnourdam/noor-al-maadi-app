// ============================================================
// Guided Tutorial — Registry
// ------------------------------------------------------------
// Central catalogue of every tutorial known to the app. Phase 2A
// registers a single tutorial (`irth-first-time`) whose structural
// definition lives in `./data.ts`.
//
// Consumers must import from this module (not the raw data file) so
// future tutorials can be added without leaking their config shape
// across the codebase.
// ============================================================

import { IRTH_FIRST_TIME_TUTORIAL } from "./data";
import type { TutorialConfig, TutorialId } from "./types";

const TUTORIALS: Readonly<Record<TutorialId, TutorialConfig>> = {
  "irth-first-time": IRTH_FIRST_TIME_TUTORIAL,
};

export function getTutorialConfig(id: TutorialId): TutorialConfig {
  return TUTORIALS[id];
}

export function allTutorialIds(): TutorialId[] {
  return Object.keys(TUTORIALS) as TutorialId[];
}

/** The tutorial that owns the first-time flow. Phase 2A treats this
 *  as the only tutorial; future phases may add more. */
export const FIRST_TIME_TUTORIAL_ID: TutorialId = "irth-first-time";
