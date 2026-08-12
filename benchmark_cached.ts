import { computeLockMapByGroup, type ProgressionState, type CampaignLike } from "./src/lib/campaigns/progression";

// Mock implementation of the logic inside useCampaignLockMap for benchmarking
interface LockMapCache {
  sections: any;
  stateKey: string;
  result: Map<string, any>;
}
let globalLockMapCache: LockMapCache | null = null;

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

const stateKey = JSON.stringify({
  completedCampaignIds: Array.from(state.completedCampaignIds).sort(),
  completedStoryIds: Array.from(state.completedStoryIds ?? []).sort(),
  unlockedAchievementIds: Array.from(state.unlockedAchievementIds ?? []).sort(),
  level: state.level,
  hydrated: state.hydrated
});

const sections = [{ campaigns: mockCampaigns }];

function cachedCompute(sections: any, state: ProgressionState) {
  if (globalLockMapCache && globalLockMapCache.sections === sections && globalLockMapCache.stateKey === stateKey) {
    return globalLockMapCache.result;
  }
  const entries = mockCampaigns.map(c => ({ campaign: c, groupKey: "test" }));
  const result = computeLockMapByGroup(entries, state);
  globalLockMapCache = { sections, stateKey, result };
  return result;
}

console.time("Warm-Hit-100-iterations");
for (let i = 0; i < 100; i++) {
  cachedCompute(sections, state);
}
console.timeEnd("Warm-Hit-100-iterations");

globalLockMapCache = null; // Reset for recompute test
console.time("Recompute-100-iterations");
for (let i = 0; i < 100; i++) {
  globalLockMapCache = null; // Force miss
  cachedCompute(sections, state);
}
console.timeEnd("Recompute-100-iterations");
