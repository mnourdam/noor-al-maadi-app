// ============================================================
// Emblem rarity normalization
// ------------------------------------------------------------
// The final rarity set is: common / rare / epic / legendary.
// Legacy avatars authored with `uncommon` are remapped to `rare`
// at the registry boundary. `avatar_id` is NEVER touched — only
// the presentation rarity changes.
// ============================================================

import type { EmblemRarity } from "./types";

export const EMBLEM_RARITIES: readonly EmblemRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
] as const;

export const RARITY_LABEL_AR: Record<EmblemRarity, string> = {
  common: "شائع",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

export function normalizeEmblemRarity(v: unknown): EmblemRarity {
  if (typeof v !== "string") return "common";
  const k = v.trim().toLowerCase();
  if (k === "uncommon") return "rare"; // legacy → normalized
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
