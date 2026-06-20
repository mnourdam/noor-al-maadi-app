// ============================================================
// Content Registry Types
// ------------------------------------------------------------
// A reusable registry that lets imported campaigns reference
// historical content (figures, artifacts, cities, battles, …)
// by stable id without touching hardcoded data files.
// ============================================================

export type RegistryItemType =
  | "figure"
  | "artifact"
  | "city"
  | "battle"
  | "scholar"
  | "dynasty"
  | "badge"
  | "achievement";

export type RegistryRarity =
  | "common"
  | "rare"
  | "epic"
  | "legendary";

export interface ContentRegistryItem {
  id: string;
  type: RegistryItemType;
  name: string;
  title?: string;
  subtitle?: string;
  description?: string;
  image?: string;
  historicalPeriod?: string;
  category?: string;
  rarity?: RegistryRarity;
  tags?: string[];
  relatedCampaigns?: string[];
  relatedFigures?: string[];
  relatedCities?: string[];
  relatedBattles?: string[];
  sourceNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnlockableItem {
  registryId: string;
  unlockedAt?: string;
  source?: { campaignId?: string; chapterId?: string };
}

export interface MuseumItem extends ContentRegistryItem {
  unlocked?: boolean;
}

export interface Badge extends ContentRegistryItem { type: "badge" }
export interface Achievement extends ContentRegistryItem { type: "achievement" }