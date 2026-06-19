/**
 * Centralized display-name resolver for player-facing labels.
 *
 * Internal IDs (e.g. `salahuddin-sword`, `legendary-liberator`,
 * `bayt_hikma_detective`, `mamluk.state.mamluk`) must never reach the UI.
 * Components should funnel raw IDs through these helpers to obtain a
 * localized Arabic display string.
 */
import { ARTIFACTS, CHARACTERS, ERAS } from "@/lib/data";
import { getPackEntity } from "@/lib/packs/registry";

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
};

/** Curated map of known reward-artifact IDs (used outside ARTIFACTS table). */
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
  const trimmed = id.replace(/^badge-/, "");
  return BADGE_NAMES[trimmed] ?? BADGE_NAMES[id] ?? "شارة";
}

/** Resolve an artifact ID to its Arabic name across all known sources. */
export function displayArtifactName(id?: string | null): string {
  if (!id) return "";
  const direct = ARTIFACTS.find((a) => a.id === id);
  if (direct) return direct.name;
  const pack = getPackEntity(id);
  if (pack?.name) return pack.name;
  return REWARD_ARTIFACT_NAMES[id] ?? "أثر نادر";
}

/** Resolve a character / figure ID to an Arabic name. */
export function displayCharacterName(id?: string | null): string {
  if (!id) return "";
  const direct = CHARACTERS.find((c) => c.id === id);
  if (direct) return direct.name;
  const pack = getPackEntity(id);
  return pack?.name ?? "شخصية تاريخية";
}

/** Resolve a pack entity ID (e.g. `mamluk.state.mamluk`) to an Arabic name. */
export function displayEntityName(id?: string | null): string {
  if (!id) return "";
  const pack = getPackEntity(id);
  if (pack?.name) return pack.name;
  // Try era prefix fallback (e.g. `mamluk.state.mamluk` → "الدولة المملوكية").
  const eraId = id.split(".")[0];
  const era = ERAS.find((e) => e.id === eraId);
  return era?.name ?? id;
}

/** Generic resolver: try entity → artifact → character → badge → raw. */
export function displayName(id?: string | null): string {
  if (!id) return "";
  const pack = getPackEntity(id);
  if (pack?.name) return pack.name;
  const art = ARTIFACTS.find((a) => a.id === id);
  if (art) return art.name;
  const ch = CHARACTERS.find((c) => c.id === id);
  if (ch) return ch.name;
  if (BADGE_NAMES[id]) return BADGE_NAMES[id];
  if (REWARD_ARTIFACT_NAMES[id]) return REWARD_ARTIFACT_NAMES[id];
  return id;
}
