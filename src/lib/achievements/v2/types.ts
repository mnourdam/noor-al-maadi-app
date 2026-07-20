/**
 * Achievement Engine v2 — canonical types.
 *
 * Registry entries are pure content. Predicates and progress functions are
 * pure over `ProgressSnapshot` (see `snapshot.ts`) — no side effects, no I/O,
 * no clocks, no randomness. Rewards are advisory on the client and
 * authoritative on the server (registry mirror).
 *
 * No Arabic (or any language) strings live in this file or the engine — all
 * display text is referenced through i18n keys and resolved by `i18n.ts`.
 */

export type AchievementId = string;

export type AchievementCategory =
  | "campaigns"
  | "investigations"
  | "encyclopedia"
  | "museum"
  | "atlas"
  | "worlds"
  | "economy"
  | "level"
  | "daily"
  | "collection"
  | "special"
  | "seasonal";

export type AchievementRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

/**
 * Canonical gameplay domains. Every registry entry declares which domains
 * its predicate reads; a change in a domain triggers re-evaluation of only
 * the entries whose `inputs` include that domain.
 *
 * Legacy profile counters (storiesRead, charactersUnlocked, unlockedEras,
 * regionsUnlocked, artifactsFound) are intentionally NOT domains.
 */
export type CanonicalDomain =
  | "campaigns"
  | "investigations"
  | "encyclopedia"
  | "museum"
  | "atlas"
  | "worlds"
  | "xp"
  | "level"
  | "dinars"
  | "streak"
  | "daily"
  | "games"
  | "titles"
  | "profile";

export interface AssetRef {
  /** Emoji, icon token, or asset path resolved by the UI layer. */
  ref: string;
  /** "emoji" | "asset" | "token". Free-form for future asset systems. */
  kind?: "emoji" | "asset" | "token";
}

export interface AchievementI18n {
  titleKey: string;
  subtitleKey?: string;
  descriptionKey: string;
  lockedDescriptionKey?: string;
  unlockedFlavorKey?: string;
}

export interface AchievementMedia {
  icon: AssetRef;
  artwork?: AssetRef;
  lockedIcon?: AssetRef;
  /** Design-token id, never a raw hex. */
  colorToken?: string;
}

export interface AchievementVisibility {
  /** Absent from lists entirely until unlocked (or prerequisites met if `revealOn` says so). */
  hidden?: boolean;
  /** Shown as an obfuscated placeholder slot with no title/description. */
  secret?: boolean;
  revealOn?: "unlock" | "prerequisite-met";
}

export type AchievementRewardKind =
  | "xp"
  | "dinars"
  | "title"
  | "museumItem"
  | "cosmetic";

export interface AchievementRewards {
  xp?: number;
  dinars?: number;
  titleId?: string;
  museumItemId?: string;
  cosmeticId?: string;
}

/**
 * Declarative event identifiers emitted by the engine after successful
 * unlock/claim. These are NOT callbacks — consumers subscribe to the
 * achievement event bus and decide what to do (confetti, sounds, modals,
 * unlocking a story, etc.). Adding new identifiers is a data change.
 */
export type AchievementEventId =
  | "show_confetti"
  | "play_common_sound"
  | "play_rare_sound"
  | "play_epic_sound"
  | "play_legendary_sound"
  | "show_modal"
  | "show_world_intro"
  | "unlock_story"
  | "unlock_avatar"
  | "unlock_theme"
  | "unlock_frame"
  // Escape hatch for future ids without breaking the type surface.
  | (string & Record<never, never>);

export interface AchievementEventHooks {
  onUnlocked?: AchievementEventId[];
  onClaimed?: AchievementEventId[];
  onViewed?: AchievementEventId[];
}

/**
 * A pure snapshot of everything the evaluator can read. Filled by
 * `snapshot.ts` from canonical selectors only.
 */
export interface ProgressSnapshot {
  /** Monotonically increasing per rebuild; used for memoization keys. */
  version: number;
  /** Domain slices, each rebuilt independently when its source changes. */
  campaigns: {
    completedIds: ReadonlySet<string>;
    inProgressIds: ReadonlySet<string>;
    totalCompleted: number;
  };
  investigations: {
    completedIds: ReadonlySet<string>;
    totalCompleted: number;
    byWorldCompleted: ReadonlyMap<string, number>;
  };
  encyclopedia: {
    discoveredIds: ReadonlySet<string>;
    totalDiscovered: number;
    byCategoryCount: ReadonlyMap<string, number>;
    byEraCount: ReadonlyMap<string, number>;
    byRegionCount: ReadonlyMap<string, number>;
  };
  museum: {
    ownedIds: ReadonlySet<string>;
    totalOwned: number;
    byRarityCount: ReadonlyMap<string, number>;
  };
  atlas: {
    discoveredIds: ReadonlySet<string>;
    totalDiscovered: number;
  };
  worlds: {
    completedSlugs: ReadonlySet<string>;
    perWorldRatio: ReadonlyMap<string, number>;
  };
  xp: { total: number };
  level: { value: number };
  dinars: { current: number; lifetimeEarned: number };
  streak: { current: number; longest: number };
  daily: { challengesCompleted: number };
  games: { totalPlays: number };
  titles: { earnedCount: number };
  profile: { userId: string | null };
}

export type ProgressPredicate = (s: ProgressSnapshot) => boolean;
export type ProgressFn = (s: ProgressSnapshot) => number;

export interface AchievementDefinition {
  id: AchievementId;

  /** Definition version — bump only on breaking semantic change. */
  version: number;
  /** Minimum engine version required to evaluate/reward this entry. */
  engineVersion: number;

  category: AchievementCategory;
  rarity: AchievementRarity;
  tier?: number;
  family?: string;
  sortOrder: number;

  i18n: AchievementI18n;
  media: AchievementMedia;
  visibility?: AchievementVisibility;

  /** Declared canonical inputs — used by the evaluator for partial re-eval. */
  inputs: readonly CanonicalDomain[];
  predicate: ProgressPredicate;
  /** 0..1 progress toward unlock; MUST be monotonic in canonical inputs. */
  progress: ProgressFn;

  /** Achievement ids that must be unlocked first (DAG-validated). */
  prerequisites?: readonly AchievementId[];
  /** Advisory forward links for UI hints only — not gating. */
  unlocks?: readonly AchievementId[];

  rewards?: AchievementRewards;

  /** Declarative event identifiers — see `events.ts`. */
  events?: AchievementEventHooks;

  /** Optional analytics id emitted through the standard analytics bus. */
  analyticsId?: string;

  tags?: readonly string[];
  availability?: { from?: string; until?: string };
  deprecated?: boolean;
}

export type AchievementState =
  | "locked-visible"
  | "locked-hidden"
  | "locked-secret"
  | "unlocked"
  | "claimed";

export interface UserAchievementRecord {
  achievementId: AchievementId;
  unlockedAt: string;
  rewardsGrantedAt: string | null;
  engineVersion: number;
  definitionVersion: number;
}

/**
 * Unified projection consumed by every UI surface.
 */
export interface AchievementView {
  id: AchievementId;
  state: AchievementState;
  progress: number;
  category: AchievementCategory;
  rarity: AchievementRarity;
  sortOrder: number;
  family?: string;
  tier?: number;
  /** null when `state === "locked-secret"`. */
  displayTitle: string | null;
  displaySubtitle: string | null;
  displayDescription: string | null;
  media: AchievementMedia;
  rewards?: AchievementRewards;
  chain?: { family: string; prevId: AchievementId | null; nextId: AchievementId | null };
  unlockedAt: string | null;
  claimedAt: string | null;
}

/**
 * Result of a single evaluator pass.
 */
export interface EvaluationResult {
  /** Ids the evaluator considers currently unlocked (before reconciliation). */
  unlockedIds: ReadonlySet<AchievementId>;
  /** 0..1 progress per achievement id. */
  progress: ReadonlyMap<AchievementId, number>;
  /** Snapshot version this result was computed against. */
  snapshotVersion: number;
}
