/**
 * Retired legacy achievement ids — Slice 4 resolution.
 *
 * These 15 ids were flagged in Slice 2 because they depended on legacy
 * profile counters (stories read, saved stories, decisions, timelines,
 * missions, badges) that never had a canonical server-side ledger.
 *
 * Slice 4 audit concluded that no reliable canonical equivalent exists
 * today, so each id is RETIRED:
 *
 *   - Not part of `DEFINITIONS`, so the v2 engine never evaluates them.
 *   - Registry validator (`registry.ts`) treats these ids as reserved
 *     and fails hard if a canonical definition tries to re-declare one.
 *   - No UI surface renders them: profile / home / achievements pages
 *     consume `AchievementView[]` exclusively.
 *   - Any historical `profile.achievementsEarned` timestamps for these
 *     ids are dropped — the field itself was removed from `ProfileState`
 *     in Slice 4, since v2 owns unlock persistence via `user_achievements`.
 *
 * When (if ever) a canonical ledger arrives for the underlying domain,
 * port the id into `all.ts` alongside that ledger and remove it from
 * `RETIRED_IDS` in the same slice.
 */

export interface RetiredAchievement {
  id: string;
  legacyCategory: string;
  reason: string;
  resolution: "retired";
}

export const RETIRED_LEGACY_ACHIEVEMENTS: readonly RetiredAchievement[] = Object.freeze([
  { id: "ach_read_5",       legacyCategory: "reading",   reason: "storiesRead is a legacy profile counter with no canonical read ledger.",       resolution: "retired" },
  { id: "ach_read_15",      legacyCategory: "reading",   reason: "storiesRead is a legacy profile counter.",                                       resolution: "retired" },
  { id: "ach_read_30",      legacyCategory: "reading",   reason: "storiesRead is a legacy profile counter.",                                       resolution: "retired" },
  { id: "ach_read_60",      legacyCategory: "reading",   reason: "storiesRead is a legacy profile counter.",                                       resolution: "retired" },
  { id: "ach_read_120",     legacyCategory: "reading",   reason: "storiesRead is a legacy profile counter.",                                       resolution: "retired" },
  { id: "ach_saved_10",     legacyCategory: "reading",   reason: "savedStories is a legacy client-only list.",                                     resolution: "retired" },
  { id: "ach_decisions_5",  legacyCategory: "mastery",   reason: "decisionsCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_decisions_15", legacyCategory: "mastery",   reason: "decisionsCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_decisions_40", legacyCategory: "mastery",   reason: "decisionsCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_timeline_5",   legacyCategory: "mastery",   reason: "timelinesCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_timeline_15",  legacyCategory: "mastery",   reason: "timelinesCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_timeline_30",  legacyCategory: "mastery",   reason: "timelinesCompleted has no canonical ledger.",                                    resolution: "retired" },
  { id: "ach_missions_25",  legacyCategory: "campaigns", reason: "Per-mission granularity is not surfaced canonically (only campaign completion).", resolution: "retired" },
  { id: "ach_badges_10",    legacyCategory: "wealth",    reason: "badges is a legacy profile array with no canonical grant system.",              resolution: "retired" },
  { id: "ach_legend_combo", legacyCategory: "legendary", reason: "Composite requires stories/decisions/timelines counters.",                       resolution: "retired" },
]);

/** Reserved id set — v2 registry validator refuses to re-declare these. */
export const RETIRED_IDS: ReadonlySet<string> = new Set(
  RETIRED_LEGACY_ACHIEVEMENTS.map((f) => f.id),
);
