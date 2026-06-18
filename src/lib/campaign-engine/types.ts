// ============================================================
// Campaign Engine — Data Model
// ------------------------------------------------------------
// A 100% data-driven shape for historical campaigns.
// Adding a new campaign (Khalid ibn al-Walid, Andalusia, the
// Ottomans, Fall of Baghdad…) only requires writing a new
// CampaignDefinition and registering it. No UI changes needed.
// ============================================================

export type Difficulty = "easy" | "medium" | "hard" | "legendary";

import type { Quiz } from "../quiz-engine";
export type { Quiz, QuizQuestion } from "../quiz-engine";

/** Pointer to any entity living in the existing app (legacy data or pack). */
export interface EntityLink {
  kind:
    | "character" | "battle" | "region" | "city"
    | "artifact" | "event" | "state" | "story" | "campaign" | "pack";
  /** Existing id in the relevant registry. */
  id: string;
  /** Optional display label override. */
  label?: string;
}

/** Atomic knowledge surfaced inside a chapter (sidebars / cards). */
export interface KnowledgeCard {
  id: string;
  title: string;
  body: string;
  source?: string;          // future: historical source note
  icon?: string;            // optional emoji glyph
}

/** Future-ready extension: in-chapter decisions / quizzes. */
export interface ChapterDecision {
  id: string;
  prompt: string;
  choices: { label: string; outcome: string; correct?: boolean }[];
}

/** Unlockables granted on chapter completion. */
export interface ChapterUnlock {
  characters?: string[];
  artifacts?: string[];
  cities?: string[];
  regions?: string[];
  battles?: string[];
  events?: string[];
  states?: string[];
  packEntities?: string[];  // ids living in src/lib/packs registry
}

export interface ChapterDefinition {
  id: string;                    // unique within campaign
  index: number;                 // 1-based ordering
  title: string;
  subtitle?: string;
  hero?: string;                 // image url placeholder
  intro: string;                 // narrative introduction
  body?: string[];               // optional extended paragraphs
  figures?: EntityLink[];        // key figures
  locations?: EntityLink[];      // key locations (cities / regions)
  events?: EntityLink[];         // key events / battles
  knowledgeCards?: KnowledgeCard[];
  decisions?: ChapterDecision[]; // optional, engine-ready
  readingGate?: boolean;         // if true, requires explicit "I finished reading"
  unlocks?: ChapterUnlock;
  xp: number;
  /** Optional knowledge quiz; if `required`, must be passed to finish. */
  quiz?: Quiz;
}

export interface CampaignReward {
  title?: string;                // honor title (lifetime)
  artifactId?: string;           // grand-prize artifact id
  badgeId?: string;              // badge awarded
  characterIds?: string[];       // unlocked characters
  xp: number;
  legendary?: boolean;
  /** Awarded automatically once every chapter quiz is fully correct. */
  scholarBadgeId?: string;
  scholarXp?: number;
}

export interface CampaignDefinition {
  id: string;                    // unique campaign id (e.g. "salahuddin-liberator")
  title: string;
  subtitle?: string;
  intro: string;
  hero?: string;
  difficulty: Difficulty;
  estimatedMinutes: [number, number];
  packId?: string;               // optional bridge to a Content Pack
  related: EntityLink[];         // related entities for the graph
  chapters: ChapterDefinition[];
  finalReward: CampaignReward;
  /** Order weight inside the Campaigns hub (lower = earlier). */
  order: number;
  /** If true, campaign card uses the cinematic flagship treatment. */
  flagship?: boolean;
}

// ------------------------------------------------------------
// Runtime types
// ------------------------------------------------------------

export interface ChapterProgress {
  chapterId: string;
  completed: boolean;
  percent: number;
}

export interface CampaignProgress {
  campaignId: string;
  completedChapters: number;
  totalChapters: number;
  percent: number;
  completed: boolean;        // grand reward claimed
  chapters: ChapterProgress[];
}

// ------------------------------------------------------------
// Storage key helpers — shared across the engine
// ------------------------------------------------------------

/** Mission key written into profile.missionsCompleted for chapter completion. */
export function chapterCompletionKey(campaignId: string, chapterId: string): string {
  return `eng:${campaignId}:${chapterId}`;
}

/** Key written into profile.campaignsCompleted when finale claimed. */
export function campaignCompletionKey(campaignId: string): string {
  return `eng:${campaignId}`;
}