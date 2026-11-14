import React from 'react';
import {it, expect, vi, afterEach} from 'vitest';
import {render, act, cleanup, waitFor} from '@testing-library/react';
const state=vi.hoisted(()=>({uid:'restored-player' as string|null,fetch:vi.fn(),claim:vi.fn(),repair:vi.fn(),mark:vi.fn(),invoke:vi.fn()}));
vi.mock('@/lib/profile',()=>({useProfile:()=>({})}));
vi.mock('@/lib/investigations/progress',()=>({useCanonicalInvestigationProgress:()=>({completedIds:[],count:0})}));
vi.mock('@/lib/campaigns/completions',()=>({localCompletedIds:()=>[],fetchServerCompletedIds:vi.fn()}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:vi.fn()}));
vi.mock('@/lib/achievements/v2/claim.functions',()=>({fetchUserAchievements:state.fetch,claimAchievements:state.claim,repairHistoricalAchievements:state.repair,markAchievementsPresented:state.mark}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:async()=>({data:{user:state.uid?{id:state.uid}:null}}),getSession:async()=>({data:{session:state.uid?{user:{id:state.uid}}:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:vi.fn()}}})},from:()=>({select:()=>({eq:()=>({abortSignal:async()=>({data:[],error:null})})})}),functions:{invoke:state.invoke}}}));
import {AchievementWatcher} from '@/components/AchievementWatcher';
import {useAchievementViews} from '@/lib/achievements/v2/driver';
import {initAchievementEngine,resetAchievementEngine,establishAchievementLiveBaseline,pushCanonical,getEvaluation,getPersisted} from '@/lib/achievements/v2/engine';
import {setActiveOwnerInternal} from '@/lib/identity/owner';
import {onAchievementTransition} from '@/lib/achievements/v2/events';
function Views(){const views=useAchievementViews();return <>{['ach_campaign_1','ach_artifact_10','ach_inv_1'].map(id=>{const v=views.find(x=>x.id===id);return <output key={id} data-testid={id}>{v?.state}:{v?.claimedAt}</output>})}</>}
const date='2026-01-01T00:00:00.000Z';
const restored=['ach_campaign_1','ach_artifact_10'].map(id=>({achievement_id:id,unlocked_at:date,rewards_granted_at:date,presented_at:date,notified_at:date,engine_version:2,definition_version:1}));
afterEach(cleanup);
it.each([false,true])('restored claimed rows remain silent across local reset/logout/login; new live unlock once (delayed claim=%s)',async(delayed)=>{
 vi.clearAllMocks();
 let resolveClaim!:(value:any)=>void;
 const pendingClaim=new Promise<any>(resolve=>{resolveClaim=resolve});
 localStorage.clear();state.uid='restored-player';setActiveOwnerInternal('user:restored-player');
 state.fetch.mockResolvedValue(restored);state.claim.mockImplementation(async({data})=>({inserted:[],alreadyClaimed:data.ids})).mockImplementationOnce(async({data})=>delayed?pendingClaim:({inserted:data.ids,alreadyClaimed:[]}));state.repair.mockResolvedValue({repaired:[],existing:[]});state.mark.mockResolvedValue({});state.invoke.mockResolvedValue({data:{},error:null});
 const transition=vi.fn(),banner=vi.fn(),sound=vi.fn();const stop=onAchievementTransition(transition);
 window.addEventListener('irth:notifications:banner',banner);window.addEventListener('irth:achievement-unlocked',sound);
 try{
  initAchievementEngine();
  let view=render(<><AchievementWatcher/><Views/></>);
  for(let session=0;session<2;session++){
   await act(async()=>{await resetAchievementEngine(state.uid);pushCanonical({campaigns:{completedIds:['restored-campaign']}});await establishAchievementLiveBaseline();});
   for(const row of restored){
    await waitFor(()=>expect(view.getByTestId(row.achievement_id).textContent).toBe(`claimed:${date}`));
    expect(getPersisted().get(row.achievement_id)?.rewardsGrantedAt).toBe(date);
   }
   for(let repeat=0;repeat<2;repeat++){
    const previous=getEvaluation().snapshotVersion;
    await act(async()=>{pushCanonical({campaigns:{completedIds:['restored-campaign']}});});
    expect(getEvaluation().snapshotVersion).toBeGreaterThan(previous);
   }
   expect(state.claim).not.toHaveBeenCalled();expect(state.invoke).not.toHaveBeenCalled();expect(state.mark).not.toHaveBeenCalled();expect(transition).not.toHaveBeenCalled();expect(banner).not.toHaveBeenCalled();expect(sound).not.toHaveBeenCalled();
   if(session===0){
    view.unmount();state.uid=null;setActiveOwnerInternal('guest:restore-test');await act(async()=>{await resetAchievementEngine(null);});
    state.uid='restored-player';setActiveOwnerInternal('user:restored-player');view=render(<><AchievementWatcher/><Views/></>);
   }
  }
  expect(state.fetch).toHaveBeenCalledTimes(2);
  await act(async()=>{pushCanonical({investigations:{completedIds:['new-investigation']}});});
  await waitFor(()=>expect(state.claim).toHaveBeenCalledTimes(1));
  expect(state.claim).toHaveBeenCalledWith({data:{ids:['ach_inv_1'],engineVersion:2}});
  if(delayed){expect(transition).not.toHaveBeenCalled();await act(async()=>{resolveClaim({inserted:['ach_inv_1'],alreadyClaimed:[]});});}
  expect(transition).toHaveBeenCalledTimes(1);
  expect(transition.mock.calls[0][0]).toMatchObject({achievementId:'ach_inv_1',origin:'live_gameplay_unlock'});
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledTimes(1));
  expect(state.mark).toHaveBeenCalledTimes(1);expect(sound).toHaveBeenCalledTimes(1);expect(banner).not.toHaveBeenCalled();
  await act(async()=>{pushCanonical({investigations:{completedIds:['new-investigation']}});});
  // A local pending receipt permits an idempotent retry until server hydration.
  expect(state.claim).toHaveBeenCalledTimes(2);
  expect(state.claim).toHaveBeenLastCalledWith({data:{ids:['ach_inv_1'],engineVersion:2}});
  expect(state.invoke).toHaveBeenCalledTimes(1);expect(transition).toHaveBeenCalledTimes(1);
  expect(state.mark).toHaveBeenCalledTimes(1);expect(sound).toHaveBeenCalledTimes(1);expect(banner).not.toHaveBeenCalled();
 }finally{stop();window.removeEventListener('irth:notifications:banner',banner);window.removeEventListener('irth:achievement-unlocked',sound);}
});
