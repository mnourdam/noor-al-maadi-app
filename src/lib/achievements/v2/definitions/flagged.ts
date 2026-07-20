/**
 * Compatibility-only registry — flagged legacy achievements.
 *
 * These 15 ids CANNOT be represented canonically today (they require legacy
 * profile counters or ledgers that do not exist as canonical services).
 * The v2 engine MUST NOT evaluate, unlock, or grant rewards for them:
 *
 *   - They are NOT exported from `./definitions/index.ts` into `DEFINITIONS`.
 *   - `registry.ts::validate()` fails hard if any id here is re-declared in
 *     the canonical registry (see `flagged_id_in_canonical_registry`).
 *   - No predicate / progress function exists — accidental unlocking is
 *     structurally impossible.
 *
 * Historical unlocks recorded on the legacy `profile.achievementsEarned`
 * map are still displayed by the profile UI in read-only form (see
 * `useAchievementLegacyEvals` in `../driver.tsx`).
 *
 * When a canonical service arrives for the underlying domain, port the
 * flagged id into `all.ts` in the same slice as that service.
 */

export interface FlaggedAchievement {
  id: string;
  legacyCategory: string;
  reason: string;
  requires: string;
}

export const FLAGGED_LEGACY_ACHIEVEMENTS: readonly FlaggedAchievement[] = Object.freeze([
  { id: "ach_read_5",     legacyCategory: "reading", reason: "storiesRead is a legacy profile counter with no canonical read ledger.",   requires: "canonical story-read ledger" },
  { id: "ach_read_15",    legacyCategory: "reading", reason: "storiesRead is a legacy profile counter.", requires: "canonical story-read ledger" },
  { id: "ach_read_30",    legacyCategory: "reading", reason: "storiesRead is a legacy profile counter.", requires: "canonical story-read ledger" },
  { id: "ach_read_60",    legacyCategory: "reading", reason: "storiesRead is a legacy profile counter.", requires: "canonical story-read ledger" },
  { id: "ach_read_120",   legacyCategory: "reading", reason: "storiesRead is a legacy profile counter.", requires: "canonical story-read ledger" },
  { id: "ach_saved_10",   legacyCategory: "reading", reason: "savedStories is a legacy client-only list.", requires: "canonical saved-stories service" },
  { id: "ach_decisions_5",  legacyCategory: "mastery", reason: "decisionsCompleted has no canonical ledger.", requires: "canonical decisions ledger" },
  { id: "ach_decisions_15", legacyCategory: "mastery", reason: "decisionsCompleted has no canonical ledger.", requires: "canonical decisions ledger" },
  { id: "ach_decisions_40", legacyCategory: "mastery", reason: "decisionsCompleted has no canonical ledger.", requires: "canonical decisions ledger" },
  { id: "ach_timeline_5",  legacyCategory: "mastery", reason: "timelinesCompleted has no canonical ledger.", requires: "canonical timelines ledger" },
  { id: "ach_timeline_15", legacyCategory: "mastery", reason: "timelinesCompleted has no canonical ledger.", requires: "canonical timelines ledger" },
  { id: "ach_timeline_30", legacyCategory: "mastery", reason: "timelinesCompleted has no canonical ledger.", requires: "canonical timelines ledger" },
  { id: "ach_missions_25", legacyCategory: "campaigns", reason: "Per-mission granularity is not surfaced canonically (only campaign completion is).", requires: "canonical mission-completion ledger" },
  { id: "ach_badges_10",   legacyCategory: "wealth", reason: "badges is a legacy profile array with no canonical grant system.", requires: "canonical badges service" },
  { id: "ach_legend_combo", legacyCategory: "legendary", reason: "Composite requires stories/decisions/timelines counters.", requires: "reading + decisions + timelines canonical ledgers" },
]);

export const FLAGGED_IDS: ReadonlySet<string> = new Set(
  FLAGGED_LEGACY_ACHIEVEMENTS.map((f) => f.id),
);
