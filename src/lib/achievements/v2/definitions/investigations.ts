import type { AchievementDefinition } from "../types";

export const investigationFirst: AchievementDefinition = {
  id: "ach_inv_1",
  version: 1,
  engineVersion: 2,
  category: "investigations",
  rarity: "common",
  family: "investigations_progression",
  sortOrder: 10,
  i18n: {
    titleKey: "ach.investigations.first.title",
    descriptionKey: "ach.investigations.first.description",
  },
  media: { icon: { ref: "🔍", kind: "emoji" } },
  inputs: ["investigations"],
  predicate: (s) => s.investigations.totalCompleted >= 1,
  progress: (s) => Math.min(1, s.investigations.totalCompleted / 1),
  rewards: { xp: 100 },
  events: {
    onUnlocked: ["show_confetti", "play_common_sound"],
  },
  analyticsId: "achievement_first_investigation",
};
