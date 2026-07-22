// ============================================================
// Canonical Artifact Rarity Module (Phase 7)
// ------------------------------------------------------------
// Single source of truth for artifact rarity across Irth:
//   • the enum + normalization helper
//   • the Arabic label mapper
//   • the canonical display order
//   • a shared visual-token mapper (ring/chip/frame/glow classes)
//
// Rarity lives on the encyclopedia entity's `metadata.rarity`
// (authored). It is NEVER stored per user and NEVER inferred
// from player behaviour.
// ============================================================

export type ArtifactRarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_VALUES: readonly ArtifactRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
] as const;

/** Canonical presentation/sort order. */
export const RARITY_ORDER: readonly ArtifactRarity[] = RARITY_VALUES;

/** Arabic labels — approved copy. */
export const RARITY_LABEL_AR: Record<ArtifactRarity, string> = {
  common: "عادي",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

/** Accept a common set of alternate authored spellings. Anything else → common. */
const ALIASES: Record<string, ArtifactRarity> = {
  common: "common", normal: "common", basic: "common",
  عادي: "common", "عاديّ": "common",
  rare: "rare", uncommon: "rare", نادر: "rare",
  epic: "epic", mythic: "epic", ملحمي: "epic", "ملحميّ": "epic",
  legendary: "legendary", legend: "legendary", أسطوري: "legendary", "أسطوريّ": "legendary",
};

export function isArtifactRarity(v: unknown): v is ArtifactRarity {
  return typeof v === "string" && (RARITY_VALUES as readonly string[]).includes(v);
}

/** Normalize any authored value to a canonical rarity, defaulting to `common`. */
export function normalizeRarity(v: unknown, fallback: ArtifactRarity = "common"): ArtifactRarity {
  if (isArtifactRarity(v)) return v;
  if (typeof v === "string") {
    const key = v.trim().toLowerCase();
    if (ALIASES[key]) return ALIASES[key];
  }
  return fallback;
}

/** Read rarity off a metadata blob without mutating it. */
export function rarityFromMetadata(
  metadata: unknown,
  fallback: ArtifactRarity = "common",
): ArtifactRarity {
  if (metadata && typeof metadata === "object") {
    const r = (metadata as Record<string, unknown>).rarity;
    return normalizeRarity(r, fallback);
  }
  return fallback;
}

/** Arabic label — never returns the raw slug. */
export function rarityLabelAr(r: unknown): string {
  return RARITY_LABEL_AR[normalizeRarity(r)];
}

/**
 * Canonical visual-token mapper. Consumers pick the classes they need.
 * All values are Tailwind utility strings using project design tokens.
 */
export interface RarityStyle {
  label: string;
  ring: string;
  chip: string;
  glow: string;
  frame: string;
  wash: string;
}

export const RARITY_STYLE: Record<ArtifactRarity, RarityStyle> = {
  common: {
    label: RARITY_LABEL_AR.common,
    ring: "ring-white/10",
    chip: "bg-white/10 text-white/70",
    glow: "",
    frame: "from-white/5 to-transparent",
    wash: "from-white/10 to-transparent",
  },
  rare: {
    label: RARITY_LABEL_AR.rare,
    ring: "ring-sky-400/40",
    chip: "bg-sky-400/15 text-sky-200",
    glow: "shadow-[0_0_28px_-8px_oklch(0.78_0.14_240/45%)]",
    frame: "from-sky-400/15 via-sky-400/5 to-transparent",
    wash: "from-sky-400/20 via-sky-400/5 to-transparent",
  },
  epic: {
    label: RARITY_LABEL_AR.epic,
    ring: "ring-fuchsia-400/45",
    chip: "bg-fuchsia-400/15 text-fuchsia-200",
    glow: "shadow-[0_0_34px_-8px_oklch(0.7_0.2_320/50%)]",
    frame: "from-fuchsia-400/15 via-fuchsia-400/5 to-transparent",
    wash: "from-fuchsia-400/20 via-fuchsia-400/5 to-transparent",
  },
  legendary: {
    label: RARITY_LABEL_AR.legendary,
    ring: "ring-gold/60",
    chip: "bg-gradient-gold text-primary-foreground",
    glow: "shadow-gold",
    frame: "from-gold/25 via-gold/5 to-transparent",
    wash: "from-gold/25 via-gold/5 to-transparent",
  },
};

/** Rank for stable sort ascending (common → legendary). */
export function rarityRank(r: ArtifactRarity): number {
  return RARITY_ORDER.indexOf(r);
}
