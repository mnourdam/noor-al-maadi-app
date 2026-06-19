/**
 * Historical avatar collection — Quality of Life v1
 *
 * Curated set of 60 in-app avatars themed around Islamic/Arab history.
 * Each avatar is rendered as a glyph (emoji or symbolic character) on top
 * of a gold gradient — no remote images, no uploads.
 */

export interface HistoricalAvatar {
  id: string;
  name: string;          // Arabic label
  glyph: string;         // single character / emoji rendered in the badge
  category: "holy" | "weapon" | "armor" | "knowledge" | "symbol" | "tool" | "nature";
}

export const AVATARS: HistoricalAvatar[] = [
  // Holy places & symbols
  { id: "kaaba",       name: "الكعبة",          glyph: "🕋", category: "holy"   },
  { id: "aqsa",        name: "المسجد الأقصى",   glyph: "🕌", category: "holy"   },
  { id: "minaret",     name: "المئذنة",         glyph: "🕌", category: "holy"   },
  { id: "mihrab",      name: "المحراب",         glyph: "⛩",  category: "holy"   },
  { id: "crescent",    name: "الهلال",          glyph: "☪",  category: "symbol" },
  { id: "star",        name: "نجمة الإرث",      glyph: "★",  category: "symbol" },
  { id: "rosette",     name: "الوردة الإسلامية", glyph: "❀", category: "symbol" },
  { id: "calligraphy", name: "خط عربي",         glyph: "ﷲ",  category: "symbol" },
  { id: "prayer_bead", name: "السبحة",          glyph: "📿", category: "holy"   },
  { id: "lantern",     name: "فانوس قديم",      glyph: "🏮", category: "tool"   },

  // Weapons
  { id: "sword",       name: "السيف",           glyph: "⚔",  category: "weapon" },
  { id: "scimitar",    name: "السيف المعقوف",   glyph: "🗡", category: "weapon" },
  { id: "spear",       name: "الرمح",           glyph: "🔱", category: "weapon" },
  { id: "bow",         name: "القوس",           glyph: "🏹", category: "weapon" },
  { id: "shield",      name: "الترس",           glyph: "🛡", category: "armor"  },
  { id: "dagger",      name: "الخنجر",          glyph: "🔪", category: "weapon" },
  { id: "axe",         name: "البلطة",          glyph: "🪓", category: "weapon" },

  // Armor
  { id: "helmet",      name: "الخوذة",          glyph: "🪖", category: "armor"  },
  { id: "armor",       name: "الدرع",           glyph: "🛡", category: "armor"  },
  { id: "ring",        name: "خاتم عثماني",     glyph: "💍", category: "armor"  },

  // Knowledge & manuscripts
  { id: "manuscript",  name: "مخطوط نادر",      glyph: "📜", category: "knowledge" },
  { id: "abbasid_book",name: "كتاب عباسي",      glyph: "📖", category: "knowledge" },
  { id: "quill",       name: "الريشة والمحبرة", glyph: "🖋", category: "knowledge" },
  { id: "hikma",       name: "بيت الحكمة",      glyph: "🏛", category: "knowledge" },
  { id: "library",     name: "خزانة الكتب",     glyph: "📚", category: "knowledge" },
  { id: "ink",         name: "محبرة",           glyph: "🖋", category: "knowledge" },
  { id: "scroll",      name: "لفافة",           glyph: "📜", category: "knowledge" },
  { id: "tablet",      name: "اللوح",           glyph: "🪧", category: "knowledge" },

  // Flags
  { id: "umayyad_flag",name: "راية أموية",      glyph: "🏳", category: "symbol" },
  { id: "abbasid_flag",name: "راية عباسية",     glyph: "🏴", category: "symbol" },
  { id: "rashidun_flag",name:"راية الراشدين",   glyph: "🏳", category: "symbol" },
  { id: "ayyubid_flag",name: "راية أيوبية",     glyph: "🏴", category: "symbol" },
  { id: "ottoman_flag",name: "راية عثمانية",    glyph: "🏴", category: "symbol" },

  // Tools & science
  { id: "compass",     name: "البوصلة",         glyph: "🧭", category: "tool"   },
  { id: "astrolabe",   name: "الأسطرلاب",       glyph: "⚙",  category: "tool"   },
  { id: "hourglass",   name: "الساعة الرملية",  glyph: "⌛", category: "tool"   },
  { id: "map",         name: "خارطة الأقاليم",  glyph: "🗺", category: "tool"   },
  { id: "telescope",   name: "المرقاب",         glyph: "🔭", category: "tool"   },
  { id: "scale",       name: "الميزان",         glyph: "⚖",  category: "tool"   },
  { id: "key",         name: "مفتاح القدس",     glyph: "🗝", category: "tool"   },
  { id: "abacus",      name: "العدّاد",         glyph: "🧮", category: "tool"   },
  { id: "scissors",    name: "المقص",           glyph: "✂",  category: "tool"   },
  { id: "magnifier",   name: "العدسة",          glyph: "🔍", category: "tool"   },

  // Nature & animals
  { id: "horse",       name: "الفرس العربي",    glyph: "🐎", category: "nature" },
  { id: "camel",       name: "الجمل",           glyph: "🐪", category: "nature" },
  { id: "falcon",      name: "الصقر",           glyph: "🦅", category: "nature" },
  { id: "lion",        name: "الأسد",           glyph: "🦁", category: "nature" },
  { id: "palm",        name: "النخلة",          glyph: "🌴", category: "nature" },
  { id: "olive",       name: "الزيتون",         glyph: "🫒", category: "nature" },
  { id: "desert",      name: "الصحراء",         glyph: "🏜", category: "nature" },
  { id: "oasis",       name: "الواحة",          glyph: "🌿", category: "nature" },

  // Architecture
  { id: "dome",        name: "القبة",           glyph: "🕋", category: "holy"   },
  { id: "gate",        name: "بوابة المدينة",   glyph: "🚪", category: "symbol" },
  { id: "fortress",    name: "القلعة",          glyph: "🏰", category: "armor"  },
  { id: "tower",       name: "البرج",           glyph: "🗼", category: "armor"  },
  { id: "caravan",     name: "القافلة",         glyph: "🐫", category: "nature" },
  { id: "well",        name: "البئر",           glyph: "💧", category: "nature" },

  // Misc
  { id: "coin",        name: "الدينار",         glyph: "🪙", category: "tool"   },
  { id: "incense",     name: "العود والبخور",   glyph: "🕯", category: "tool"   },
  { id: "crown",       name: "تاج الخلافة",     glyph: "👑", category: "symbol" },
  { id: "torch",       name: "الشعلة",          glyph: "🔥", category: "symbol" },
];

export const DEFAULT_AVATAR_ID = "kaaba";

export function getAvatar(id?: string | null): HistoricalAvatar {
  if (!id) return AVATARS[0];
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}