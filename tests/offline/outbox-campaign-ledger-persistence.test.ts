import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Campaign, CampaignChapter, CampaignActivity } from '@/types/campaign';
vi.mock('@/lib/progressSync', () => ({ upsertChapterProgress: vi.fn(), addCollectionItems: vi.fn() }));
import { claimActivityReward, claimChapterReward, claimCampaignReward, hasClaimed, activityKey, chapterKey, campaignKey } from '@/lib/campaignLedger';
import { installIdentityPartition, __uninstallPartitionForTests } from '@/lib/identity/partition';
import { __resetIdentityForTests, setActiveOwnerInternal } from '@/lib/identity/owner';
import { recordActivity, getCampaignProgress } from '@/lib/importedCampaignProgress';
const key = 'irth_campaign_ledger_v1';
const activity: CampaignActivity = { id: 'a', type: 'multiple_choice', prompt: 'Synthetic', xpReward: 10, coinsReward: 5 };
const chapter: CampaignChapter = { id: 'ch', title: 'Synthetic', order: 1, activities: [activity], rewards: { xp: 20, coins: 10 } };
const campaign: Campaign = { id: 'c', title: 'Synthetic', status: 'published', chapters: [chapter], finalRewards: { xp: 30, coins: 15 } };
const cases = [
  ['activity', () => claimActivityReward(campaign, chapter, activity), activityKey('c', 'ch', 'a'), 10, 5],
  ['chapter', () => claimChapterReward(campaign, chapter), chapterKey('c', 'ch'), 20, 10],
  ['campaign', () => claimCampaignReward(campaign), campaignKey('c'), 30, 15],
] as const;
beforeEach(() => { localStorage.clear(); __resetIdentityForTests(); setActiveOwnerInternal('user:ledger-alice'); });
afterEach(() => { vi.restoreAllMocks(); __uninstallPartitionForTests(); });
for (const [name, claim, marker, xp, coins] of cases) {
  for (const fault of ['silent-drop', 'mismatch', 'throw'] as const) {
    it(`${name} does not acknowledge a ${fault} marker write`, () => {
      const original = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, value) {
        if (k !== key) return original.call(this, k, value);
        if (fault === 'throw') throw new Error('synthetic quota');
        if (fault === 'mismatch') original.call(this, k, JSON.stringify({ keys: {}, pending: [] }));
      });
      expect(claim()).toEqual({ granted: false, xp: 0, coins: 0, unlocks: [] });
      expect(hasClaimed(marker)).toBe(false);
    });
  }
  it(`${name} acknowledges a readable marker once and retains it across a fresh claim`, () => {
    expect(claim()).toEqual({ granted: true, xp, coins, unlocks: [] });
    const bytes = localStorage.getItem(key);
    expect(hasClaimed(marker)).toBe(true);
    expect(claim().granted).toBe(false);
    expect(localStorage.getItem(key)).toBe(bytes);
  });
}
it('accepted progress may persist independently, but an unreadable reward marker must not authorize the caller reward branch', () => {
  // Real local adapters in the same order as the route AFTER its server/outbox acknowledgment.
  recordActivity(campaign, chapter, activity, true);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, value) {
    if (k !== key) original.call(this, k, value);
  });
  const delta = claimActivityReward(campaign, chapter, activity);
  expect(getCampaignProgress(campaign.id).completed).toBe(true);
  expect(delta.granted).toBe(false);
  expect(hasClaimed(activityKey('c', 'ch', 'a'))).toBe(false);
});

for (const boundary of ['set', 'get'] as const) {
  it(`does not acknowledge storage reentry retiring the owner during ${boundary}`, () => {
    const originalSet = Storage.prototype.setItem;
    const originalGet = Storage.prototype.getItem;
    let written = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, value) {
      originalSet.call(this, k, value);
      if (k === key) {
        written = true;
        if (boundary === 'set') setActiveOwnerInternal('user:ledger-bob');
      }
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k) {
      const value = originalGet.call(this, k);
      if (k === key && written && boundary === 'get') setActiveOwnerInternal('user:ledger-bob');
      return value;
    });
    expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
    // A write may already exist. Rejection is not a rollback or permission to retry.
    expect(originalGet.call(localStorage, key)).not.toBeNull();
  });
}
it('does not acknowledge an unreadable readback after a completed write', () => {
  const originalSet = Storage.prototype.setItem;
  const originalGet = Storage.prototype.getItem;
  let written = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, value) {
    originalSet.call(this, k, value); if (k === key) written = true;
  });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k) {
    if (k === key && written) throw new Error('synthetic unreadable storage');
    return originalGet.call(this, k);
  });
  expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  expect(originalGet.call(localStorage, key)).not.toBeNull();
});

it('acknowledges and deduplicates within the real owner partition without borrowing another owner marker', () => {
  installIdentityPartition();
  expect(claimActivityReward(campaign, chapter, activity).granted).toBe(true);
  expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
  setActiveOwnerInternal('user:ledger-bob');
  expect(hasClaimed(activityKey('c', 'ch', 'a'))).toBe(false);
  expect(claimActivityReward(campaign, chapter, activity).granted).toBe(true);
  setActiveOwnerInternal('user:ledger-alice');
  expect(claimActivityReward(campaign, chapter, activity).granted).toBe(false);
});
