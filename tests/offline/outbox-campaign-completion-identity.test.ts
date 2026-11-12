import {it,expect,vi} from 'vitest';
import {__resetIdentityForTests,setActiveOwnerInternal} from '@/lib/identity/owner';
const env=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:env.from}}));
import {fetchServerCompletedIds,unionCompletedIds} from '@/lib/campaigns/completions';
it('reads whole-campaign sticky facts, not chapter-progress presence',async()=>{
 __resetIdentityForTests();setActiveOwnerInternal('user:ledger-test');
 env.from.mockImplementation(table=>({select:()=>({eq:async()=>({data:table==='user_campaign_completions'?[{campaign_id:'finished'}]:[{campaign_id:'only-unlocked'},{campaign_id:'one-of-three-chapters'}],error:null})})}));
 const result=await fetchServerCompletedIds();
 expect([...result.ids]).toEqual(['finished']);
});
it('does not return completion IDs from a retired ABA session',async()=>{
 __resetIdentityForTests();setActiveOwnerInternal('user:aba');
 let resolve!:(x:unknown)=>void;
 const promise=new Promise(r=>{resolve=r});
 env.from.mockReturnValue({select:()=>({eq:()=>promise})});
 const pending=fetchServerCompletedIds();await Promise.resolve();
 setActiveOwnerInternal('user:other');setActiveOwnerInternal('user:aba');
 resolve({data:[{campaign_id:'old-session'}],error:null});
 expect([...(await pending).ids]).toEqual([]);
});

it('does not query when the owner changes before the first continuation',async()=>{
 __resetIdentityForTests();setActiveOwnerInternal('user:before');env.from.mockClear();
 const pending=fetchServerCompletedIds();setActiveOwnerInternal('user:after');
 expect([...(await pending).ids]).toEqual([]);expect(env.from).not.toHaveBeenCalled();
});
it('cleans up a synchronous query throw and permits a fresh attempt',async()=>{
 __resetIdentityForTests();setActiveOwnerInternal('user:throw');
 env.from.mockImplementationOnce(()=>{throw new Error('offline')});
 expect([...(await fetchServerCompletedIds()).ids]).toEqual([]);
 env.from.mockReturnValue({select:()=>({eq:async()=>({data:[{campaign_id:'fresh'}],error:null})})});
 expect([...(await fetchServerCompletedIds()).ids]).toEqual(['fresh']);
});
it('coalesces same epoch but not successor epoch and preserves its slot',async()=>{
 __resetIdentityForTests();setActiveOwnerInternal('user:flights');env.from.mockClear();
 let first!:(x:unknown)=>void,second!:(x:unknown)=>void;
 env.from.mockReturnValueOnce({select:()=>({eq:()=>new Promise(r=>{first=r})})})
 .mockReturnValueOnce({select:()=>({eq:()=>new Promise(r=>{second=r})})});
 const old=fetchServerCompletedIds();await Promise.resolve();
 setActiveOwnerInternal('user:other');setActiveOwnerInternal('user:flights');
 const next=fetchServerCompletedIds();await Promise.resolve();
 first({data:[{campaign_id:'old'}],error:null});expect([...(await old).ids]).toEqual([]);
 const coalesced=fetchServerCompletedIds();await Promise.resolve();expect(env.from).toHaveBeenCalledTimes(2);
 second({data:[{campaign_id:'new'}],error:null});
 expect([...(await next).ids]).toEqual(['new']);expect([...(await coalesced).ids]).toEqual(['new']);
});
it('retires local/profile union contributions as well as delayed server rows',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:union');
 localStorage.setItem('irth.campaign_completions.v1',JSON.stringify({local:{campaignId:'local',completedAt:'2026-01-01'}}));
 let resolve!:(x:unknown)=>void;env.from.mockReturnValue({select:()=>({eq:()=>new Promise(r=>{resolve=r})})});
 const pending=unionCompletedIds(['profile']);await Promise.resolve();
 setActiveOwnerInternal('user:other');resolve({data:[{campaign_id:'server'}],error:null});
 expect([...(await pending)]).toEqual([]);
});
it('preserves current-owner normalized local/profile/server union',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:positive');
 localStorage.setItem('irth.campaign_completions.v1',JSON.stringify({local:{campaignId:'local',completedAt:'2026-01-01'}}));
 env.from.mockReturnValue({select:()=>({eq:async()=>({data:[{campaign_id:'Server'}],error:null})})});
 expect(await unionCompletedIds(['Profile'])).toEqual(new Set(['local','profile','server']));
});
it('does not infer campaign facts when the intended ledger is unavailable',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:missing');
 env.from.mockReturnValue({select:()=>({eq:async()=>({data:null,error:{code:'42P01'}})})});
 expect(await unionCompletedIds(['existing-local-policy'])).toEqual(new Set(['existing-local-policy']));
});
it('keeps guest reads local without a server request',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('guest:campaign');env.from.mockClear();
 expect(await unionCompletedIds(['guest-local'])).toEqual(new Set(['guest-local']));
 expect(env.from).not.toHaveBeenCalled();
});
