// ============================================================
// Admin Campaign Types
// ------------------------------------------------------------
// Data-driven shapes used by the hidden /admin/campaigns panel.
// These intentionally live OUTSIDE the existing campaign-engine
// types so we can evolve admin/import features without touching
// any of the public UI contracts.
// ============================================================

export type CampaignStatus = "draft" | "published";
export type CampaignDifficulty = "easy" | "medium" | "hard" | "legendary";

export type CampaignQuestionType =
  | "reading_then_question"
  | "multiple_choice"
  | "true_false"
  | "arrange_events"
  | "decision_choice"
  | "match_pairs"
  | "fill_blank"
  | "reflection_prompt";

export interface CampaignPair {
  left: string;
  right: string;
}

export interface CampaignActivity {
  id: string;
  type: CampaignQuestionType;
  prompt: string;
  contextText?: string;
  options?: string[];
  correctAnswer?: string | number | boolean;
  correctOrder?: string[];
  pairs?: CampaignPair[];
  feedbackCorrect?: string;
  feedbackWrong?: string;
  hint?: string;
  xpReward?: number;       // default 10
  coinsReward?: number;    // default 5
  heartsPenalty?: number;  // default 1
  difficulty?: CampaignDifficulty;
  relatedFigure?: string;
  relatedCity?: string;
  relatedBattle?: string;
  relatedArtifact?: string;
  // ---- Reflection-only (type === "reflection_prompt") ----
  /** Optional authored quote surfaced above the prompt. */
  quote?: string;
  /** Attribution for the quote (author / source). */
  quoteAttribution?: string;
  /**
   * Reflective-moment response mode.
   *   - "continue" → read + press "متابعة الرحلة". No answer captured.
   *   - "choose"   → author-provided reflection choices; every choice accepted.
   *   - "write"    → free-text personal reflection. Stored locally only.
   * When omitted the mode is inferred: `options.length ≥ 2` → "choose",
   * otherwise → "continue". Set `allowFreeText: true` to permit an
   * additional free-text field alongside "choose".
   */
  reflectionMode?: "continue" | "choose" | "write";
  /** Enables the optional free-text field in "choose" mode. */
  allowFreeText?: boolean;
}


export interface CampaignReward {
  xp?: number;
  coins?: number;
  artifactId?: string;
  badgeId?: string;
  figureId?: string;
  achievementId?: string;
  /** Free-form list of registry item ids unlocked together. */
  unlocks?: string[];
}

export interface CampaignChapter {
  id: string;
  title: string;
  subtitle?: string;
  introText?: string;
  historicalReadingText?: string;
  order: number;
  unlockRequirement?: string;        // chapter id that must be completed first
  rewards?: CampaignReward;
  activities: CampaignActivity[];
}

export interface Campaign {
  id: string;
  slug?: string;
  title: string;
  subtitle?: string;
  historicalPeriod?: string;
  description?: string;
  coverImage?: string;
  mapRegion?: string;
  category?: string;
  difficulty?: CampaignDifficulty;
  estimatedDuration?: string;
  status: CampaignStatus;
  tags?: string[];
  chapters: CampaignChapter[];
  finalRewards?: CampaignReward;
  /** Registry item ids unlocked when the campaign is fully completed. */
  unlocks?: string[];
  /**
   * Deterministic chronological position. Primary sort axis for player-facing
   * lists. Lower = earlier in history. When set, this always wins over
   * sort_year and historicalPeriod parsing.
   */
  chronological_order?: number;
  /**
   * Canonical starting year (Hijri preferred, fallback to Gregorian
   * converted to Hijri-scale by subtracting 622). Used when
   * chronological_order is absent.
   */
  sort_year?: number;
  /** Optional canonical world slug (e.g. "ottoman", "abbasid"). */
  worldSlug?: string;
  /** Optional canonical era key. */
  era?: string;
  createdAt?: string;
  updatedAt?: string;
}


/** Defaults applied when an imported activity omits reward fields. */
export const ACTIVITY_DEFAULTS = {
  xpReward: 10,
  coinsReward: 5,
  heartsPenalty: 1,
} as const;

export interface ValidationIssue {
  level: "error" | "warning";
  message: string;          // Arabic message
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  normalized?: Campaign;
}