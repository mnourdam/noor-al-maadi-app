import { computeLockMapByGroup, type ProgressionState, type CampaignLike } from "./src/lib/campaigns/progression";

const mockCampaigns: CampaignLike[] = Array.from({ length: 200 }, (_, i) => ({
  id: `c-${i}`,
  title: `Campaign ${i}`,
  section_key: `section-${Math.floor(i / 10)}`,
  status: "published"
}));

const state: ProgressionState = {
  completedCampaignIds: new Set(["c-0", "c-10", "c-20"]),
  completedStoryIds: new Set(),
  unlockedAchievementIds: new Set(),
  level: 5,
  hydrated: true
};

const entries = mockCampaigns.map(c => ({ campaign: c, groupKey: `section-${Math.floor(parseInt(c.id.split('-')[1]) / 10)}` }));

console.time("computeLockMapByGroup-100-iterations");
for (let i = 0; i < 100; i++) {
  computeLockMapByGroup(entries, state);
}
console.timeEnd("computeLockMapByGroup-100-iterations");
