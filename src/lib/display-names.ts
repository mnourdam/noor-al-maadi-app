/**
 * Centralized display-name resolver for player-facing labels.
 * Supabase-only: curated maps for badges/artifacts; generic resolver
 * falls back to the raw id. No legacy pack/data dependency.
 */

/** Curated map of known badge IDs → Arabic display names. */
const BADGE_NAMES: Record<string, string> = {
  // Story / reading badges
  first_story: "أول قصة",
  five_stories: "قارئ نهم",

  // Campaign engine badges
  "legendary-liberator": "المحرر الأسطوري",
  "al-faruq": "شارة الفاروق",
  "rashidun-scholar": "عالم الراشدين",
  "ayyubid-collector": "الجامع الأيوبي",
  "crusades-expert": "خبير الحروب الصليبية",

  // Investigation badges
  bayt_hikma_detective: "محقق بيت الحكمة",

  // Seasonal badges
  season_seerah: "شارة السيرة النبوية",
  season_seerah_late: "شارة المدينة",
  season_rashidun: "شارة الراشدين",
  season_andalus: "شارة الأندلس",
  season_andalus_fall: "شارة الأندلس الأخيرة",
  season_baghdad: "شارة بغداد",
  season_baghdad_fall: "شارة بغداد الحزينة",
  season_constantinople: "شارة الفتح",
  season_madina: "شارة المدينة المنوّرة",
  season_jerusalem: "شارة القدس",
  season_yarmouk: "شارة اليرموك",
  season_ain_jalut: "شارة عين جالوت",
  season_seljuk: "شارة السلاجقة",

  // Imported campaign aliases
  "prophetic-mission": "شارة البعثة النبوية",
  "salahuddin": "شارة صلاح الدين",
  "umar": "شارة الفاروق",
};

/** Curated map of known reward-artifact IDs. */
const REWARD_ARTIFACT_NAMES: Record<string, string> = {
  "ref_artifact_lantern": "قنديل الإرث",
  "umari-covenant": "العهدة العمريّة",
  "faruq-armor": "درع الفاروق",
  "umar-ring": "خاتم عمر",
  "qadisiyya-banner": "راية القادسية",
  "diwan-register": "ديوان عمر",
  "salahuddin-sword": "سيف صلاح الدين",
};

/** Resolve a badge ID to an Arabic name. Falls back to a generic label. */
export function displayBadgeName(id?: string | null): string {
  if (!id) return "";
  const trimmed = id.replace(/^badge[-:]/, "");
  return BADGE_NAMES[trimmed] ?? BADGE_NAMES[id] ?? "شارة جديدة";
}

/** Resolve an artifact ID to its Arabic name. */
export function displayArtifactName(id?: string | null): string {
  if (!id) return "";
  return REWARD_ARTIFACT_NAMES[id] ?? "أثر نادر";
}

/** Resolve a character / figure ID to an Arabic name. */
export function displayCharacterName(id?: string | null): string {
  if (!id) return "";
  return "شخصية تاريخية";
}

/** Resolve a pack entity ID to an Arabic name (legacy compat — returns id). */
export function displayEntityName(id?: string | null): string {
  return id ?? "";
}

/** Generic resolver: try badge → artifact → raw. */
export function displayName(id?: string | null): string {
  if (!id) return "";
  if (BADGE_NAMES[id]) return BADGE_NAMES[id];
  if (REWARD_ARTIFACT_NAMES[id]) return REWARD_ARTIFACT_NAMES[id];
  return id;
}
