// ============================================================
// Content Pack — universal historical entity schema
// ------------------------------------------------------------
// This file is the contract every future content pack must follow
// (Umayyads, Abbasids, Ottomans, Mamluks, Andalusia, Crusades…).
// New packs only add data — they never modify the schema or any
// downstream consumer (knowledge graph, museum, world map, etc.).
// ============================================================

export type PackEntityType =
  | "state"        // الدولة / السلطنة / الخلافة
  | "figure"       // شخصية تاريخية
  | "city"         // مدينة
  | "battle"       // معركة
  | "event"        // حدث محوري
  | "landmark"     // معلم / أثر معماري
  | "artifact"     // أثر مادي / سلاح / مخطوط
  | "achievement"; // لقب / إنجاز يُفتح للاعب

export type PackRarity = "common" | "rare" | "epic" | "legendary";

export interface PackPeriod {
  /** Display label in Arabic, e.g. "١١٧١ – ١٢٥٠ م". */
  label: string;
  /** Numeric anchor used by the Great Timeline (CE). */
  startYear: number;
  endYear: number;
}

export interface PackUnlockable {
  /** What gets unlocked, e.g. "campaign" | "artifact" | "achievement" | "title". */
  kind: string;
  /** Stable id of the unlockable (matches another PackEntity or an in-app id). */
  refId: string;
  /** Human label for UI surfaces that show rewards. */
  label: string;
}

export interface PackImagePlaceholder {
  /** Short Arabic alt text. */
  alt: string;
  /** Emoji glyph used as a stand-in until artwork ships. */
  glyph: string;
  /** Optional gradient hint for hero cards (tailwind class fragment). */
  tone?: string;
}

export interface PackEntity {
  /** Globally unique across all packs. Convention: `<pack>.<type>.<slug>`. */
  id: string;
  /** Short Arabic title (هو ما يظهر للمستخدم). */
  title: string;
  /** Optional English / latin id-friendly subtitle for debugging. */
  latin?: string;
  type: PackEntityType;
  /** Rich Arabic description, 1–3 sentences. */
  description: string;
  period: PackPeriod;
  /** Ids of other PackEntities this one is historically tied to. */
  relatedEntities: string[];
  /** Things this entity grants the player when discovered/completed. */
  unlockables: PackUnlockable[];
  image: PackImagePlaceholder;
  /** Anchor year used by the Great Timeline (CE). */
  timelinePosition: number;
  /** Rarity for museum sorting; defaults to "rare". */
  rarity?: PackRarity;
  /** Free-form bag for type-specific fields (capital, commanders, rewards…). */
  meta?: Record<string, unknown>;
  /** Optional bridge to legacy ids in src/lib/data.ts / cities.ts. */
  bridges?: {
    characterId?: string;
    battleId?: string;
    cityId?: string;
    regionId?: string;
    artifactId?: string;
    storyId?: string;
    era?: string;
  };
}

export interface ContentPack {
  id: string;            // e.g. "pack-001-ayyubid"
  order: number;         // load / display order
  title: string;         // Arabic display title
  subtitle?: string;     // optional Arabic subtitle
  summary: string;       // 1–2 sentence Arabic blurb
  era: string;           // legacy Era id (links to existing data.ts)
  period: PackPeriod;
  cover: PackImagePlaceholder;
  entities: PackEntity[];
}