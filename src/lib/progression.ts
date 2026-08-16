// ============================================================
// PROGRESSION — Player level / title / rank / rewards
// ------------------------------------------------------------
// Single source of truth for the long-term progression curve.
// Designed so that:
//  - Early levels feel fast and rewarding.
//  - Mid-late levels require real commitment.
//  - Legendary titles take weeks/months of play.
//  - Existing player XP is preserved (they simply slide down the new curve).
//  - Future cosmetic rewards (frames, banners, seals, backgrounds…) can be
//    attached without rewriting consumer code.
// ============================================================

export type Rank =
  | "برونزي"
  | "فضّي"
  | "ذهبي"
  | "بلاتيني"
  | "ألماسي"
  | "أسطوري"
  | "خالد";

export type CosmeticKind =
  | "frame"
  | "banner"
  | "seal"
  | "background"
  | "avatar"
  | "horse";

export interface LevelCosmetic {
  kind: CosmeticKind;
  id: string;
  name: string;
}

export interface LevelReward {
  /** Dinars granted on reaching this level (UI display; grant left to future system). */
  dinars?: number;
  /** Unlocked cosmetic item. */
  cosmetic?: LevelCosmetic;
  /** Title granted on this level (mirror of LevelInfo.title when it changes). */
  title?: string;
}

export interface LevelInfo {
  level: number;
  /** Minimum total XP required to reach this level. */
  min: number;
  title: string;
  rank: Rank;
  reward?: LevelReward;
}

/** Max level cap. */
export const MAX_LEVEL = 50;

// ------------------------------------------------------------
// Title / rank tiers (by inclusive level range)
// Inspired by historical Arabic ranks. "أسطورة التاريخ" is the final title.
// ------------------------------------------------------------
interface Tier { from: number; to: number; title: string; rank: Rank }
const TIERS: Tier[] = [
  { from: 1,  to: 3,  title: "طالب التاريخ",     rank: "برونزي" },
  { from: 4,  to: 7,  title: "باحث ناشئ",         rank: "برونزي" },
  { from: 8,  to: 12, title: "راوي إرث",          rank: "فضّي"   },
  { from: 13, to: 18, title: "باحث تاريخي",       rank: "فضّي"   },
  { from: 19, to: 24, title: "مؤرّخ",              rank: "ذهبي"   },
  { from: 25, to: 30, title: "مؤرّخ متمرّس",       rank: "ذهبي"   },
  { from: 31, to: 36, title: "حافظ الآثار",       rank: "بلاتيني" },
  { from: 37, to: 41, title: "جامع المخطوطات",    rank: "بلاتيني" },
  { from: 42, to: 45, title: "شيخ المؤرّخين",     rank: "ألماسي" },
  { from: 46, to: 48, title: "حارس الحضارة",      rank: "ألماسي" },
  { from: 49, to: 49, title: "سيّد الأزمنة",       rank: "أسطوري" },
  { from: 50, to: 50, title: "أسطورة التاريخ",    rank: "خالد"   },
];

function tierFor(level: number): Tier {
  return TIERS.find((t) => level >= t.from && level <= t.to) ?? TIERS[TIERS.length - 1];
}

// ------------------------------------------------------------
// XP curve — progressive (non-linear).
// Formula: round( 50 * (L-1)^2.1 ) to the nearest 10 XP.
// Yields roughly:
//   L2 ≈ 50   L5 ≈ 920    L10 ≈ 4,740   L20 ≈ 23,100
//   L30 ≈ 57,200   L40 ≈ 106,500   L50 ≈ 173,900
// ------------------------------------------------------------
function xpThreshold(level: number): number {
  if (level <= 1) return 0;
  
  // Levels 1-20: Classic curve (round( 50 * (L-1)^2.1 ))
  const baseRaw = 50 * Math.pow(level - 1, 2.1);
  const baseThreshold = Math.round(baseRaw / 10) * 10;
  
  if (level <= 20) {
    return baseThreshold;
  }
  
  // Levels 21-50: Balanced Curve (Base + 169.8 * (L-20)^2)
  // Ensures smooth transition from L20 (24,230) to L21 (27,160)
  // and reaches L50 at 329,990 XP.
  const boostRaw = 169.8 * Math.pow(level - 20, 2);
  const totalRaw = baseThreshold + boostRaw;
  
  return Math.round(totalRaw / 10) * 10;
}

// ------------------------------------------------------------
// Per-level rewards
// Every 5 levels grants a meaningful cosmetic unlock + dinars.
// Title rewards are emitted at the first level of each new tier.
// Dinars scale gently with level so they remain a nice-to-have, not a
// progression breaker.
// ------------------------------------------------------------
const COSMETIC_MILESTONES: Record<number, LevelCosmetic> = {
  5:  { kind: "frame",      id: "frame_bronze",      name: "إطار برونزي" },
  10: { kind: "banner",     id: "banner_silver",     name: "راية الفضة" },
  15: { kind: "seal",       id: "seal_scholar",      name: "ختم الباحث" },
  20: { kind: "background", id: "bg_majlis",         name: "خلفية مجلس العلم" },
  25: { kind: "frame",      id: "frame_gold",        name: "إطار ذهبي" },
  30: { kind: "banner",     id: "banner_historian",  name: "راية المؤرّخين" },
  35: { kind: "seal",       id: "seal_keeper",       name: "ختم حافظ الآثار" },
  40: { kind: "background", id: "bg_library",        name: "خلفية مكتبة بغداد" },
  42: { kind: "horse",      id: "horse_andalus",     name: "جواد الأندلس" },
  45: { kind: "frame",      id: "frame_platinum",    name: "إطار بلاتيني" },
  48: { kind: "banner",     id: "banner_civilization", name: "راية الحضارة" },
  49: { kind: "seal",       id: "seal_master",       name: "ختم سيّد الأزمنة" },
  50: { kind: "frame",      id: "frame_legend",      name: "إطار الأسطورة الخالدة" },
};

function rewardFor(level: number, isNewTitle: boolean, title: string): LevelReward | undefined {
  const reward: LevelReward = {};
  // Gentle dinar scaling: 10 + level*5 per level-up, doubled at multiples of 10.
  const baseDinars = 10 + level * 5;
  reward.dinars = level % 10 === 0 ? baseDinars * 2 : baseDinars;
  if (isNewTitle) reward.title = title;
  const cos = COSMETIC_MILESTONES[level];
  if (cos) reward.cosmetic = cos;
  return Object.keys(reward).length ? reward : undefined;
}

// ------------------------------------------------------------
// Build the full level table.
// ------------------------------------------------------------
export const LEVELS: LevelInfo[] = (() => {
  const out: LevelInfo[] = [];
  let prevTitle = "";
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const tier = tierFor(level);
    const isNewTitle = tier.title !== prevTitle;
    out.push({
      level,
      min: xpThreshold(level),
      title: tier.title,
      rank: tier.rank,
      reward: rewardFor(level, isNewTitle, tier.title),
    });
    prevTitle = tier.title;
  }
  return out;
})();

// ------------------------------------------------------------
// Lookup helper. Backward-compatible shape with the previous LEVELS table:
// returns the current LevelInfo + { next, progress (0..1), toNext }.
// ------------------------------------------------------------
export interface LevelLookup extends LevelInfo {
  next: LevelInfo | null;
  progress: number;
  toNext: number;
}

export function levelFor(points: number): LevelLookup {
  const safePoints = Math.max(0, Math.floor(points || 0));
  let current = LEVELS[0];
  let next: LevelInfo | null = LEVELS[1] ?? null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (safePoints >= LEVELS[i].min) {
      current = LEVELS[i];
      next = LEVELS[i + 1] ?? null;
    }
  }
  const span = next ? next.min - current.min : 0;
  const progress = next && span > 0
    ? Math.min(1, Math.max(0, (safePoints - current.min) / span))
    : 1;
  const toNext = next ? Math.max(0, next.min - safePoints) : 0;
  return { ...current, next, progress, toNext };
}

/** Convenience: titles list in display order (used for "all ranks" previews). */
export const RANK_TITLES: string[] = Array.from(new Set(LEVELS.map((l) => l.title)));
