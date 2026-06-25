// Shared TypeScript types for the Games framework.
// All gameplay content is driven by JSON — never hardcode stages here.

export type GameMode =
  | "crossword"
  | "chronology"
  | "who_am_i"
  | "connections"
  | "memory";

export type GameStatus = "draft" | "published" | "archived";

export interface GameEnvelope {
  slug: string;
  mode: GameMode;
  title: string;
  description?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimated_time: number; // minutes
  xp: number;
  coins: number;
  hearts_penalty: number;
  related_entities: string[];
  metadata?: Record<string, unknown>;
  stages: unknown[]; // shape per-mode (validated by schemas.ts)
}

// ---- Per-mode stage shapes -------------------------------------------------

export interface CrosswordClue {
  number: number;
  direction: "across" | "down";
  row: number; // 0-indexed
  col: number;
  answer: string; // letters only, Arabic
  hint: string;
  related?: string; // encyclopedia entity id/slug
}

export interface CrosswordStage {
  title?: string;
  rows: number;
  cols: number;
  clues: CrosswordClue[];
}

export interface ChronologyEvent {
  label: string;
  year: number; // negative = BCE
  era?: string;
  related?: string;
}

export interface ChronologyStage {
  title?: string;
  prompt?: string;
  events: ChronologyEvent[];
}

export interface WhoAmIStage {
  title?: string;
  hints: [string, string, string];
  answer: string; // canonical name
  acceptable?: string[]; // alternative spellings
  related?: string;
}

export interface ConnectionPair {
  left: string;
  right: string;
  relation: string; // e.g. "قائد المعركة"
  related?: string;
}

export interface ConnectionsStage {
  title?: string;
  pairs: ConnectionPair[];
}

export interface MemoryPair {
  a: string;
  b: string;
  relation?: string;
  related?: string;
}

export interface MemoryStage {
  title?: string;
  pairs: MemoryPair[];
}

// ---- Discriminated stage union --------------------------------------------

export type StageFor<M extends GameMode> = M extends "crossword"
  ? CrosswordStage
  : M extends "chronology"
  ? ChronologyStage
  : M extends "who_am_i"
  ? WhoAmIStage
  : M extends "connections"
  ? ConnectionsStage
  : M extends "memory"
  ? MemoryStage
  : never;

export const GAME_MODES: GameMode[] = [
  "crossword",
  "chronology",
  "who_am_i",
  "connections",
  "memory",
];

export const MODE_LABELS_AR: Record<GameMode, string> = {
  crossword: "الكلمات المتقاطعة التاريخية",
  chronology: "ترتيب الأحداث",
  who_am_i: "من أنا؟",
  connections: "الروابط التاريخية",
  memory: "ذاكرة التاريخ",
};

export const MODE_TAGLINES_AR: Record<GameMode, string> = {
  crossword: "أكمل الشبكة بأسماء الشخصيات والمعارك والمدن.",
  chronology: "رتّب الأحداث وفق تسلسلها الزمني الصحيح.",
  who_am_i: "ثلاثة تلميحات متدرجة تقودك إلى الشخصية.",
  connections: "اكتشف العلاقة بين الأطراف التاريخية.",
  memory: "زاوج البطاقات في تحدٍّ سريع للذاكرة.",
};
