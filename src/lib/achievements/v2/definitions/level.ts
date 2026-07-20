import type { AchievementDefinition } from "../types";

export const levelFive: AchievementDefinition = {
  id: "ach_level_5",
  version: 1,
  engineVersion: 2,
  category: "level",
  rarity: "common",
  family: "level_progression",
  sortOrder: 50,
  i18n: {
    titleKey: "ach.level.5.title",
    descriptionKey: "ach.level.5.description",
  },
  media: { icon: { ref: "⭐", kind: "emoji" } },
  inputs: ["level"],
  predicate: (s) => s.level.value >= 5,
  progress: (s) => Math.min(1, s.level.value / 5),
  rewards: { xp: 150 },
  events: {
    onUnlocked: ["play_common_sound"],
  },
  analyticsId: "achievement_level_5",
};
