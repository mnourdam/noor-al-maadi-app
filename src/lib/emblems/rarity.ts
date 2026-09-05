// ============================================================
// Emblem rarity normalization
// ------------------------------------------------------------
// V17-08: the rarity set is common / uncommon / rare / epic /
// legendary. `uncommon` is a REAL tier with one Arabic label
// («غير شائع») on every emblem surface — it is no longer silently
// remapped to `rare`, which made the picker and the registry
// disagree. `avatar_id` is NEVER touched — only presentation.
// ============================================================

import type { EmblemRarity } from "./types";

export const EMBLEM_RARITIES: readonly EmblemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export const RARITY_LABEL_AR: Record<EmblemRarity, string> = {
  common: "شائع",
  uncommon: "غير شائع",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

export function normalizeEmblemRarity(v: unknown): EmblemRarity {
  if (typeof v !== "string") return "common";
  const k = v.trim().toLowerCase();
  if ((EMBLEM_RARITIES as readonly string[]).includes(k)) return k as EmblemRarity;
  return "common";
}

/** IDs currently authored with `uncommon` in the legacy AVATARS table.
 *  Kept for the migration audit report — see resolver + registry. */
export const LEGACY_UNCOMMON_IDS: readonly string[] = [
  "banner_rashidun",
  "calligraphy",
  "scholar",
  "explorer",
  "cartographer",
  "horseman",
  "astrolabe",
];
