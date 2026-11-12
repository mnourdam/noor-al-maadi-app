import { beforeEach, expect, it, vi } from 'vitest';
import type { Campaign, CampaignActivity, CampaignChapter } from '@/types/campaign';
vi.mock('@/lib/campaigns/completions', () => ({ recordCampaignCompletion: vi.fn() }));
import { recordCampaignCompletion } from '@/lib/campaigns/completions';
import { recordActivity, getCampaignProgress, PROGRESS_KEY } from '@/lib/importedCampaignProgress';
const activity: CampaignActivity = {id:'a',type:'multiple_choice',prompt:'Fixture',xpReward:10,coinsReward:5,heartsPenalty:1};
const chapter: CampaignChapter = {id:'ch',title:'Fixture',order:1,activities:[activity]};
const campaign: Campaign = {id:'c',title:'Fixture',status:'published',chapters:[chapter],unlocks:['fixture']};
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
for (const field of ['xpReward','coinsReward','heartsPenalty'] as const) {
  for (const bad of [NaN,Infinity,-Infinity]) for (const persist of [true,false]) {
    it(`rejects ${field}=${String(bad)}, persist=${persist}, before any progress or unlock marker`, () => {
      const bytes=localStorage.getItem(PROGRESS_KEY);
      expect(() => recordActivity(campaign,chapter,{...activity,[field]:bad},field!=='heartsPenalty',persist)).toThrow('invalid-progress-arithmetic');
      expect(localStorage.getItem(PROGRESS_KEY)).toBe(bytes);
      expect(recordCampaignCompletion).not.toHaveBeenCalled();
      expect(getCampaignProgress('c').completed).toBe(false);
    });
  }
}
for (const branch of ['xp','coins','hearts'] as const) {
  it(`rejects finite ${branch} overflow without serializing null or partial completion`, () => {
    const base=getCampaignProgress('c');
    base.chapters.ch={completedActivityIds:[],completed:false,xpEarned:0,coinsEarned:0,heartsLost:0};
    if(branch==='xp') {base.totalXp=Number.MAX_VALUE;base.chapters.ch.xpEarned=Number.MAX_VALUE;}
    if(branch==='coins') {base.totalCoins=Number.MAX_VALUE;base.chapters.ch.coinsEarned=Number.MAX_VALUE;}
    if(branch==='hearts') {base.totalHeartsLost=Number.MAX_VALUE;base.chapters.ch.heartsLost=Number.MAX_VALUE;}
    localStorage.setItem(PROGRESS_KEY,JSON.stringify({c:base}));const bytes=localStorage.getItem(PROGRESS_KEY);
    const input={...activity,[branch==='xp'?'xpReward':branch==='coins'?'coinsReward':'heartsPenalty']:Number.MAX_VALUE};
    expect(() => recordActivity(campaign,chapter,input,branch!=='hearts')).toThrow('invalid-progress-arithmetic');
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(bytes);
    expect(recordCampaignCompletion).not.toHaveBeenCalled();
  });
}
it('preserves finite negative and fractional rewards, duplicate behavior and retry after invalid input', () => {
  expect(() => recordActivity(campaign,chapter,{...activity,xpReward:NaN},true)).toThrow();
  const next=recordActivity(campaign,chapter,{...activity,xpReward:-2.5,coinsReward:0.25,heartsPenalty:NaN},true);
  expect(next.totalXp).toBe(-2.5);expect(next.totalCoins).toBe(.25);expect(next.completed).toBe(true);
  const bytes=localStorage.getItem(PROGRESS_KEY);
  expect(recordActivity(campaign,chapter,{...activity,xpReward:NaN},true)).toEqual(next);
  expect(localStorage.getItem(PROGRESS_KEY)).toBe(bytes);
});
it('preserves fractional negative heart accounting and ignores unused reward inputs on wrong answers', () => {
  const next=recordActivity(campaign,chapter,{...activity,xpReward:NaN,coinsReward:Infinity,heartsPenalty:-.5},false);
  expect(next.totalHeartsLost).toBe(-.5);expect(next.completed).toBe(false);expect(next.chapters.ch.completedActivityIds).toEqual([]);
});
it('preserves projection without writes and valid zero completion', () => {
  const next=recordActivity(campaign,chapter,{...activity,xpReward:0,coinsReward:0},true,false);
  expect(next.completed).toBe(true);expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
});
