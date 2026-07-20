/**
 * Canonical achievement definitions — Slice 2 port.
 *
 * Every entry here derives its predicate/progress ONLY from
 * `ProgressSnapshot` fields fed by canonical services:
 *   - campaigns          → server-authoritative campaign progress
 *   - investigations     → useCanonicalInvestigationProgress
 *   - encyclopedia       → user_entity_discoveries (via playerDiscoveries)
 *   - museum             → user_collection / discoveries
 *   - atlas              → user_entity_discoveries (regions/cities/states)
 *   - worlds             → worlds-progress
 *   - xp / level         → profile.points (canonical XP ledger)
 *   - dinars             → profile.dinars (canonical economy ledger)
 *   - streak             → daily streak system
 *   - titles             → profile.titlesEarned (title grant system)
 *
 * IDs are STABLE with the legacy engine so `user_achievements` rows and
 * existing unlocked-at timestamps port forward untouched.
 *
 * Achievements that require legacy-only counters (stories read, decisions,
 * timelines, saved stories, missions, badges) are intentionally NOT ported;
 * they are enumerated in `flagged.ts` for the migration audit.
 */

import type { AchievementDefinition, AchievementDefinition as D } from "../types";

// ---------- helpers ----------

function ratio(value: number, goal: number): number {
  if (goal <= 0) return 1;
  return Math.min(1, Math.max(0, value / goal));
}

// ---------- Campaigns ----------

const campaigns: D[] = [
  { id: "ach_campaign_1",  goal: 1,  rarity: "common",    xp: 150, dinars: 100, family: "campaigns_progression", order: 10, event: "play_common_sound" },
  { id: "ach_campaign_3",  goal: 3,  rarity: "rare",      xp: 400, dinars: 200, family: "campaigns_progression", order: 20, event: "play_rare_sound" },
  { id: "ach_campaign_5",  goal: 5,  rarity: "rare",      xp: 800, dinars: 400, family: "campaigns_progression", order: 30, event: "play_rare_sound" },
  { id: "ach_campaign_10", goal: 10, rarity: "epic",      xp: 1800, family: "campaigns_progression", order: 40, event: "play_epic_sound", title: "قاهر الجبهات" },
  { id: "ach_campaign_20", goal: 20, rarity: "legendary", xp: 4000, family: "campaigns_progression", order: 50, event: "play_legendary_sound", title: "فاتح الفاتحين" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "campaigns",
  rarity: c.rarity as D["rarity"],
  family: c.family,
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.goal >= 20 ? "👑" : c.goal >= 10 ? "🏰" : c.goal >= 5 ? "🛡️" : c.goal >= 3 ? "⚔️" : "🎌", kind: "emoji" } },
  inputs: ["campaigns"] as const,
  predicate: (s) => s.campaigns.totalCompleted >= c.goal,
  progress: (s) => ratio(s.campaigns.totalCompleted, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Investigations ----------

const investigations: D[] = [
  { id: "ach_inv_1",   goal: 1,   rarity: "common",    xp: 100,             order: 10, event: "play_common_sound" },
  { id: "ach_inv_5",   goal: 5,   rarity: "common",    xp: 100,             order: 20, event: "play_common_sound" },
  { id: "ach_inv_15",  goal: 15,  rarity: "rare",      xp: 300, dinars: 150, order: 30, event: "play_rare_sound" },
  { id: "ach_inv_30",  goal: 30,  rarity: "rare",      xp: 700, dinars: 300, order: 40, event: "play_rare_sound" },
  { id: "ach_inv_60",  goal: 60,  rarity: "legendary", xp: 2000,             order: 50, event: "play_legendary_sound", title: "إمام المحقّقين" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "investigations",
  rarity: c.rarity as D["rarity"],
  family: "investigations_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.goal >= 60 ? "🗝️" : c.goal >= 30 ? "⚖️" : c.goal >= 15 ? "🕵️" : "🔍", kind: "emoji" } },
  inputs: ["investigations"] as const,
  predicate: (s) => s.investigations.totalCompleted >= c.goal,
  progress: (s) => ratio(s.investigations.totalCompleted, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Streak (Daily/Dedication) ----------

const streak: D[] = [
  { id: "ach_streak_7",   goal: 7,   rarity: "common",    xp: 100,             icon: "🔥", order: 10, event: "play_common_sound" },
  { id: "ach_streak_30",  goal: 30,  rarity: "rare",      xp: 400, dinars: 250, icon: "🌙", order: 20, event: "play_rare_sound" },
  { id: "ach_streak_100", goal: 100, rarity: "epic",      xp: 1500,            icon: "☀️", order: 30, event: "play_epic_sound",      title: "صاحب المئة" },
  { id: "ach_streak_365", goal: 365, rarity: "legendary", xp: 5000,            icon: "🌟", order: 40, event: "play_legendary_sound", title: "حارس العام" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "daily",
  rarity: c.rarity as D["rarity"],
  family: "streak_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["streak"] as const,
  predicate: (s) => s.streak.current >= c.goal || s.streak.longest >= c.goal,
  progress: (s) => ratio(Math.max(s.streak.current, s.streak.longest), c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Level ----------

const level: D[] = [
  { id: "ach_level_5",  goal: 5,  rarity: "common",    xp: 150,          icon: "⭐", order: 10, event: "play_common_sound" },
  { id: "ach_level_7",  goal: 7,  rarity: "rare",      xp: 0, dinars: 400, icon: "🌠", order: 20, event: "play_rare_sound" },
  { id: "ach_level_10", goal: 10, rarity: "legendary", xp: 0,            icon: "🏅", order: 30, event: "play_legendary_sound", title: "أسطورة التاريخ" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "level",
  rarity: c.rarity as D["rarity"],
  family: "level_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["level"] as const,
  predicate: (s) => s.level.value >= c.goal,
  progress: (s) => ratio(s.level.value, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- XP (Wealth / Points) ----------

const xp: D[] = [
  { id: "ach_points_1000",  goal: 1000,  rarity: "common",  dinars: 100,  icon: "💎", order: 10, event: "play_common_sound" },
  { id: "ach_points_5000",  goal: 5000,  rarity: "rare",    dinars: 500,  icon: "💠", order: 20, event: "play_rare_sound" },
  { id: "ach_points_15000", goal: 15000, rarity: "rare",    dinars: 1500, icon: "🔷", order: 30, event: "play_rare_sound" },
  { id: "ach_points_50000", goal: 50000, rarity: "epic",    dinars: 0,    icon: "🟣", order: 40, event: "play_epic_sound", title: "ذو الخمسين" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "economy",
  rarity: c.rarity as D["rarity"],
  family: "xp_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["xp"] as const,
  predicate: (s) => s.xp.total >= c.goal,
  progress: (s) => ratio(s.xp.total, c.goal),
  rewards: { dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Dinars ----------

const dinars: D[] = [
  { id: "ach_dinars_500",   goal: 500,   rarity: "common", xp: 100,  icon: "🪙", order: 10, event: "play_common_sound" },
  { id: "ach_dinars_2000",  goal: 2000,  rarity: "rare",   xp: 300,  icon: "💰", order: 20, event: "play_rare_sound" },
  { id: "ach_dinars_10000", goal: 10000, rarity: "epic",   xp: 0,    icon: "🏦", order: 30, event: "play_epic_sound", title: "تاجر الإرث" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "economy",
  rarity: c.rarity as D["rarity"],
  family: "dinars_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["dinars"] as const,
  predicate: (s) => s.dinars.lifetimeEarned >= c.goal || s.dinars.current >= c.goal,
  progress: (s) => ratio(Math.max(s.dinars.lifetimeEarned, s.dinars.current), c.goal),
  rewards: { xp: c.xp, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Museum (Artifacts) ----------

const museum: D[] = [
  { id: "ach_artifact_10",  goal: 10,  rarity: "common",  xp: 100,             icon: "🏺", order: 10, event: "play_common_sound" },
  { id: "ach_artifact_25",  goal: 25,  rarity: "rare",    xp: 250, dinars: 150, icon: "⚱️", order: 20, event: "play_rare_sound" },
  { id: "ach_artifact_50",  goal: 50,  rarity: "rare",    xp: 600, dinars: 350, icon: "🗿", order: 30, event: "play_rare_sound" },
  { id: "ach_artifact_100", goal: 100, rarity: "epic",    xp: 1500,             icon: "🏛️", order: 40, event: "play_epic_sound", title: "ربّ المتحف" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "museum",
  rarity: c.rarity as D["rarity"],
  family: "museum_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["museum"] as const,
  predicate: (s) => s.museum.totalOwned >= c.goal,
  progress: (s) => ratio(s.museum.totalOwned, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Encyclopedia (Characters/Figures) ----------

function figuresCount(byCategory: ReadonlyMap<string, number>): number {
  // Canonical entity_type keys for people/figures in the encyclopedia.
  return (byCategory.get("figure") ?? 0)
       + (byCategory.get("companion") ?? 0)
       + (byCategory.get("scholar") ?? 0);
}

const characters: D[] = [
  { id: "ach_char_6",  goal: 6,  rarity: "common", xp: 80,               icon: "🎴", order: 10, event: "play_common_sound" },
  { id: "ach_char_15", goal: 15, rarity: "rare",   xp: 200, dinars: 100, icon: "🪪", order: 20, event: "play_rare_sound" },
  { id: "ach_char_30", goal: 30, rarity: "rare",   xp: 500, dinars: 200, icon: "🧑‍🎓", order: 30, event: "play_rare_sound" },
  { id: "ach_char_60", goal: 60, rarity: "epic",   xp: 1200,             icon: "👤", order: 40, event: "play_epic_sound", title: "موسوعة الشخصيات" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "encyclopedia",
  rarity: c.rarity as D["rarity"],
  family: "characters_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["encyclopedia"] as const,
  predicate: (s) => figuresCount(s.encyclopedia.byCategoryCount) >= c.goal,
  progress: (s) => ratio(figuresCount(s.encyclopedia.byCategoryCount), c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Atlas (Regions) ----------

const atlas: D[] = [
  { id: "ach_region_5",  goal: 5,  rarity: "common", xp: 80,             icon: "🗺️", order: 10, event: "play_common_sound" },
  { id: "ach_region_10", goal: 10, rarity: "rare",   xp: 200,            icon: "🧭", order: 20, event: "play_rare_sound" },
  { id: "ach_region_15", goal: 15, rarity: "rare",   xp: 500, dinars: 250, icon: "🌍", order: 30, event: "play_rare_sound" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "atlas",
  rarity: c.rarity as D["rarity"],
  family: "atlas_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["atlas"] as const,
  predicate: (s) => s.atlas.totalDiscovered >= c.goal,
  progress: (s) => ratio(s.atlas.totalDiscovered, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Eras (Encyclopedia by era) ----------

const eras: D[] = [
  { id: "ach_eras_5",  goal: 5,  rarity: "rare", xp: 250, icon: "🏺", order: 10, event: "play_rare_sound" },
  { id: "ach_eras_10", goal: 10, rarity: "epic", xp: 800, icon: "⏳", order: 20, event: "play_epic_sound", title: "ابن العصور" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "encyclopedia",
  rarity: c.rarity as D["rarity"],
  family: "eras_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["encyclopedia"] as const,
  // Canonical era coverage: count of eras with at least one discovery.
  predicate: (s) => s.encyclopedia.byEraCount.size >= c.goal,
  progress: (s) => ratio(s.encyclopedia.byEraCount.size, c.goal),
  rewards: { xp: c.xp, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Collection (Museum + Figures union) ----------

const collection: D[] = [
  { id: "ach_collection_50",  goal: 50,  rarity: "rare",      xp: 300,              icon: "📦", order: 10, event: "play_rare_sound" },
  { id: "ach_collection_150", goal: 150, rarity: "epic",      xp: 1200, dinars: 600, icon: "🏯", order: 20, event: "play_epic_sound" },
  { id: "ach_collection_300", goal: 300, rarity: "legendary", xp: 3000,             icon: "🗄️", order: 30, event: "play_legendary_sound", title: "أمين الأرشيف الأكبر" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "collection",
  rarity: c.rarity as D["rarity"],
  family: "collection_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["museum", "encyclopedia"] as const,
  predicate: (s) => s.museum.totalOwned + figuresCount(s.encyclopedia.byCategoryCount) >= c.goal,
  progress: (s) => ratio(s.museum.totalOwned + figuresCount(s.encyclopedia.byCategoryCount), c.goal),
  rewards: { xp: c.xp, dinars: c.dinars, titleId: c.title },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Titles (canonical title grants) ----------

const titles: D[] = [
  { id: "ach_titles_3",  goal: 3,  rarity: "rare", xp: 250, icon: "🎖️", order: 10, event: "play_rare_sound" },
  { id: "ach_titles_10", goal: 10, rarity: "epic", xp: 0, dinars: 1500, icon: "🏵️", order: 20, event: "play_epic_sound" },
].map((c) => ({
  id: c.id,
  version: 1,
  engineVersion: 2,
  category: "special",
  rarity: c.rarity as D["rarity"],
  family: "titles_progression",
  sortOrder: c.order,
  i18n: {
    titleKey: `ach.${c.id}.title`,
    descriptionKey: `ach.${c.id}.description`,
  },
  media: { icon: { ref: c.icon, kind: "emoji" } },
  inputs: ["titles"] as const,
  predicate: (s) => s.titles.earnedCount >= c.goal,
  progress: (s) => ratio(s.titles.earnedCount, c.goal),
  rewards: { xp: c.xp, dinars: c.dinars },
  events: { onUnlocked: ["show_confetti", c.event] },
  analyticsId: `achievement_${c.id}`,
} as AchievementDefinition));

// ---------- Legendary composites (canonical subsets only) ----------

const legendary: D[] = [
  {
    id: "ach_legend_master",
    version: 1, engineVersion: 2,
    category: "special", rarity: "legendary",
    family: "legendary", sortOrder: 20,
    i18n: {
      titleKey: "ach.ach_legend_master.title",
      descriptionKey: "ach.ach_legend_master.description",
    },
    media: { icon: { ref: "👑", kind: "emoji" } },
    inputs: ["campaigns", "museum", "streak"] as const,
    predicate: (s) =>
      s.campaigns.totalCompleted >= 10 && s.museum.totalOwned >= 100 && s.streak.longest >= 100,
    progress: (s) => (
      Math.min(1, s.campaigns.totalCompleted / 10) * 0.34 +
      Math.min(1, s.museum.totalOwned / 100) * 0.33 +
      Math.min(1, Math.max(s.streak.current, s.streak.longest) / 100) * 0.33
    ),
    prerequisites: ["ach_campaign_10", "ach_artifact_100", "ach_streak_100"],
    rewards: { xp: 5000, titleId: "سيّد الميادين" },
    events: { onUnlocked: ["show_confetti", "play_legendary_sound"] },
    analyticsId: "achievement_ach_legend_master",
  },
  {
    id: "ach_legend_eternal",
    version: 1, engineVersion: 2,
    category: "special", rarity: "legendary",
    family: "legendary", sortOrder: 30,
    visibility: { hidden: true, revealOn: "prerequisite-met" },
    i18n: {
      titleKey: "ach.ach_legend_eternal.title",
      descriptionKey: "ach.ach_legend_eternal.description",
    },
    media: { icon: { ref: "♾️", kind: "emoji" } },
    inputs: ["level", "streak"] as const,
    predicate: (s) => s.level.value >= 10 && s.streak.longest >= 365,
    progress: (s) => (
      Math.min(1, s.level.value / 10) * 0.5 +
      Math.min(1, Math.max(s.streak.current, s.streak.longest) / 365) * 0.5
    ),
    prerequisites: ["ach_level_10", "ach_streak_365"],
    rewards: { titleId: "الخالد" },
    events: { onUnlocked: ["show_confetti", "play_legendary_sound"] },
    analyticsId: "achievement_ach_legend_eternal",
  },
];

export const CANONICAL_DEFINITIONS: readonly AchievementDefinition[] = Object.freeze([
  ...campaigns,
  ...investigations,
  ...streak,
  ...level,
  ...xp,
  ...dinars,
  ...museum,
  ...characters,
  ...atlas,
  ...eras,
  ...collection,
  ...titles,
  ...legendary,
]);
