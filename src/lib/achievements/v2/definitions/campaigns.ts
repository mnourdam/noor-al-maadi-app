import type { AchievementDefinition } from "../types";

export const campaignFirst: AchievementDefinition = {
  id: "ach_campaign_1",
  version: 1,
  engineVersion: 2,
  category: "campaigns",
  rarity: "common",
  family: "campaigns_progression",
  sortOrder: 10,
  i18n: {
    titleKey: "ach.campaigns.first.title",
    descriptionKey: "ach.campaigns.first.description",
  },
  media: { icon: { ref: "🎌", kind: "emoji" } },
  inputs: ["campaigns"],
  predicate: (s) => s.campaigns.totalCompleted >= 1,
  progress: (s) => Math.min(1, s.campaigns.totalCompleted / 1),
  rewards: { xp: 150, dinars: 100 },
  events: {
    onUnlocked: ["show_confetti", "play_common_sound"],
  },
  analyticsId: "achievement_first_campaign",
};
