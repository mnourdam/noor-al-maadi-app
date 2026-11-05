// ============================================================
// Guest Story Completions — local, isolated, idempotent
// ------------------------------------------------------------
// Guests have no server profile, so Story completion (and its
// XP / Dinar reward) is tracked locally against the anonymous
// device profile. This module is the single source of truth for:
//   * whether a guest has already completed a given story
//     (used to make replay reward-silent);
//   * marking a completion so replay is silent forever after;
//   * surfacing local completions to StoryCard so the "جديدة"
//     pill flips to "اكتمل" immediately and on relaunch.
//
// Never used for authenticated users — server RPCs remain the
// authority there. Data lives in localStorage and follows the
// existing guest isolation policy (never merged into a signed
// account's server profile).
// ============================================================

import {
  localScope,
  readCompletionSet,
  saveCompletion,
  type GuestSaveResult,
} from "@/lib/guest/storage";
const STORAGE_KEY = "irth.guest.storyCompletions.v1";
/** Throws on unavailable/corrupt history; absence alone is an empty ledger. */
export function guestHasCompleted(storyId: string): boolean {
  return guestCompletionsSnapshot().has(storyId);
}
export function guestMarkCompleted(storyId: string): Promise<GuestSaveResult> {
  return saveCompletion(STORAGE_KEY, storyId, [
    "irth:guest-story-completed",
    "irth:story-completions:changed",
  ]);
}
export function guestCompletionsSnapshot(): Set<string> {
  return readCompletionSet(localScope(STORAGE_KEY));
}
