/**
 * Irth Identity Emblems — collectible avatar system.
 *
 * Each avatar is a premium vector emblem rendered by `<AvatarArt>` on top of
 * a dark navy disc with parchment-gold detailing. Emblems are NOT emoji and
 * NOT generic icons — they are part of the Irth visual identity.
 *
 * The data model is future-proof: every avatar carries rarity + unlock
 * metadata so we can later gate premium emblems behind campaigns,
 * achievements, museum progress, or special events. Today most are
 * unlocked by default (`unlock_method: "default"`).
 */

export type AvatarCategory =
  | "banner"      // Caliphate / dynasty banners
  | "symbol"      // Crescents, calligraphy, identity marks
  | "weapon"      // Sword, shield, etc.
  | "knowledge"   // Scroll, book, scholar tools
  | "role"        // Scholar, explorer, cartographer, curator, historian, horseman
  | "place"       // Mosque, castle, oasis
  | "tool";       // Compass, astrolabe

export type AvatarRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type AvatarUnlockMethod =
  | "default"
  | "achievement"
  | "campaign"
  | "museum"
  | "event"
  | "level"
  | "referral";

export interface AvatarUnlockRequirement {
  /** Free-text Arabic description of the requirement, shown in the picker. */
  label?: string;
  /** Optional structured ref — e.g. achievement id, campaign id, museum count. */
  refId?: string;
  /** Numeric threshold for level/count-based unlocks. */
  threshold?: number;
}

export interface HistoricalAvatar {
  id: string;
  name: string;                 // Arabic display name
  category: AvatarCategory;
  rarity: AvatarRarity;
  unlock_method: AvatarUnlockMethod;
  unlock_requirement?: AvatarUnlockRequirement;
  /**
   * Unicode fallback rune used by the share-card canvas exporter (which
   * cannot render React SVGs). The in-app UI always uses `<AvatarArt>`.
   */
  glyph: string;
}

export const AVATARS: HistoricalAvatar[] = [
  // ── Banners ──────────────────────────────────────────────
  { id: "banner_rashidun", name: "راية الراشدين", category: "banner", rarity: "uncommon",  unlock_method: "default", glyph: "▲" },
  { id: "banner_umayyad",  name: "راية أموية",    category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_abbasid",  name: "راية عباسية",   category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_andalus",  name: "راية الأندلس",  category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_ayyubid",  name: "راية أيوبية",   category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },
  { id: "banner_ottoman",  name: "راية عثمانية",  category: "banner", rarity: "rare",      unlock_method: "default", glyph: "▲" },

  // ── Symbols ──────────────────────────────────────────────
  { id: "crescent_star", name: "الهلال والنجمة", category: "symbol", rarity: "common",   unlock_method: "default", glyph: "☪" },
  { id: "calligraphy",   name: "خط عربي",        category: "symbol", rarity: "uncommon", unlock_method: "default", glyph: "ﷲ" },
  { id: "star",          name: "نجمة إرث",       category: "symbol", rarity: "common",   unlock_method: "default", glyph: "★" },

  // ── Weapons / armor ──────────────────────────────────────
  { id: "sword",  name: "السيف",  category: "weapon", rarity: "common",   unlock_method: "default", glyph: "⚔" },
  { id: "shield", name: "الترس",  category: "weapon", rarity: "common",   unlock_method: "default", glyph: "🛡" },

  // ── Knowledge ────────────────────────────────────────────
  { id: "scroll", name: "اللفافة", category: "knowledge", rarity: "common",   unlock_method: "default", glyph: "📜" },
  { id: "book",   name: "الكتاب",  category: "knowledge", rarity: "common",   unlock_method: "default", glyph: "📖" },

  // ── Roles ────────────────────────────────────────────────
  { id: "scholar",        name: "العالِم",          category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "explorer",       name: "الرحّالة",         category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "cartographer",   name: "رسّام الخرائط",    category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },
  { id: "museum_curator", name: "أمين المتحف",      category: "role", rarity: "rare",     unlock_method: "default", glyph: "✦" },
  { id: "historian",      name: "المؤرّخ",          category: "role", rarity: "rare",     unlock_method: "default", glyph: "✦" },
  { id: "horseman",       name: "الفارس",           category: "role", rarity: "uncommon", unlock_method: "default", glyph: "✦" },

  // ── Places ───────────────────────────────────────────────
  { id: "mosque", name: "المسجد", category: "place", rarity: "common", unlock_method: "default", glyph: "🕌" },
  { id: "castle", name: "القلعة", category: "place", rarity: "common", unlock_method: "default", glyph: "🏰" },

  // ── Tools ────────────────────────────────────────────────
  { id: "compass",   name: "البوصلة",  category: "tool", rarity: "common",   unlock_method: "default", glyph: "🧭" },
  { id: "astrolabe", name: "الأسطرلاب", category: "tool", rarity: "uncommon", unlock_method: "default", glyph: "⚙" },
];

export const DEFAULT_AVATAR_ID = "crescent_star";

/** Backwards-compatible avatar resolver. Falls back to the default emblem. */
export function getAvatar(id?: string | null): HistoricalAvatar {
  if (!id) return AVATARS.find((a) => a.id === DEFAULT_AVATAR_ID) ?? AVATARS[0];
  // Legacy id remap: previous emoji set used different ids.
  const legacyMap: Record<string, string> = {
    kaaba: "mosque",
    aqsa: "mosque",
    minaret: "mosque",
    mihrab: "mosque",
    crescent: "crescent_star",
    rosette: "star",
    prayer_bead: "scroll",
    lantern: "scroll",
    scimitar: "sword",
    spear: "sword",
    bow: "sword",
    dagger: "sword",
    axe: "sword",
    helmet: "shield",
    armor: "shield",
    ring: "calligraphy",
    manuscript: "scroll",
    abbasid_book: "book",
    quill: "scroll",
    hikma: "scholar",
    library: "book",
    ink: "scroll",
    tablet: "scroll",
    umayyad_flag: "banner_umayyad",
    abbasid_flag: "banner_abbasid",
    rashidun_flag: "banner_rashidun",
    ayyubid_flag: "banner_ayyubid",
    ottoman_flag: "banner_ottoman",
    hourglass: "astrolabe",
    map: "cartographer",
    telescope: "astrolabe",
    scale: "scholar",
    key: "scroll",
    abacus: "scholar",
    scissors: "scroll",
    magnifier: "historian",
    horse: "horseman",
    camel: "explorer",
    falcon: "explorer",
    lion: "shield",
    palm: "mosque",
    olive: "mosque",
    desert: "explorer",
    oasis: "explorer",
    dome: "mosque",
    gate: "castle",
    fortress: "castle",
    tower: "castle",
    caravan: "explorer",
    well: "explorer",
    coin: "museum_curator",
    incense: "calligraphy",
    crown: "banner_ottoman",
    torch: "historian",
  };
  const remapped = legacyMap[id] ?? id;
  return AVATARS.find((a) => a.id === remapped) ?? AVATARS[0];
}

export const RARITY_LABEL: Record<AvatarRarity, string> = {
  common: "شائع",
  uncommon: "غير شائع",
  rare: "نادر",
  epic: "ملحمي",
  legendary: "أسطوري",
};

export const CATEGORY_LABEL: Record<AvatarCategory, string> = {
  banner: "الرايات",
  symbol: "الرموز",
  weapon: "السلاح والدرع",
  knowledge: "المعرفة",
  role: "الشخصيات",
  place: "الأماكن",
  tool: "الأدوات",
};

/**
 * Returns whether an avatar is available to the given player profile.
 * Today all `default` avatars are unlocked. Other unlock methods are
 * reserved for future content and currently treated as locked.
 */
export function isAvatarUnlocked(
  avatar: HistoricalAvatar,
  _ctx: { unlockedAvatarIds?: string[] } = {},
): boolean {
  if (avatar.unlock_method === "default") return true;
  return (_ctx.unlockedAvatarIds ?? []).includes(avatar.id);
}
