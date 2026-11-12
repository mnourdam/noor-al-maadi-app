import {it,expect,vi,beforeEach} from 'vitest';
import {getActiveUserId,setActiveOwnerInternal,__resetIdentityForTests} from '@/lib/identity/owner';
import {mergeAuthoritativeRows,readMirror} from '@/lib/stories/progress-mirror';
const env=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn()}));
vi.mock('@/lib/offline-baseline-resolver',()=>({getLocalLibraryStories:()=>[],getLocalSceneCount:()=>0,isBaselineInMemory:()=>true,getBaselineContent:async()=>({})}));
vi.mock('@/lib/stories/unlock/guest-evidence',()=>({buildGuestEvidence:()=>({}),guestUnlockState:()=>({})}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:env.rpc,auth:{getSession:env.session}}}));
vi.mock('@/lib/stories/unlock-cache',()=>({loadUnlockedIds:async()=>new Set(),persistUnlockedIds:async()=>{}}));
import {listStoriesSummary} from '@/lib/stories/summary';

beforeEach(()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:alice');
 env.rpc.mockReset();env.session.mockReset().mockImplementation(async()=>({data:{session:{user:{id:getActiveUserId()}}}}));
});
const row=(completed:boolean)=>({id:'story',slug:'story',title_ar:'story',completed,unlocked:false});
it('does not overwrite the new Alice-session mirror with pre-ABA completion data',async()=>{
 localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:alice');
 let resolve!:(x:unknown)=>void;
 env.rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const old=listStoriesSummary('world');
 await vi.waitFor(()=>expect(env.rpc).toHaveBeenCalledTimes(1));
 setActiveOwnerInternal('user:bob');setActiveOwnerInternal('user:alice');
 mergeAuthoritativeRows('alice',[{id:'story',completed:true}]);
 expect(readMirror('alice').entries.story.completed).toBe(true);
 resolve({data:[{id:'story',slug:'story',title_ar:'story',completed:false,unlocked:false}],error:null});
 await old;
 expect(readMirror('alice').entries.story.completed).toBe(true);
});

it('rejects identity changes during initial authentication before issuing an RPC',async()=>{
 let resolve!:(x:unknown)=>void;env.session.mockReturnValue(new Promise(r=>{resolve=r}));
 const pending=listStoriesSummary('auth');setActiveOwnerInternal('user:bob');
 resolve({data:{session:{user:{id:'alice'}}}});
 expect(await pending).toEqual([]);expect(env.rpc).not.toHaveBeenCalled();
});
it('rejects a non-ABA response without writing either mirror',async()=>{
 let resolve!:(x:unknown)=>void;env.rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const pending=listStoriesSummary('switch');await vi.waitFor(()=>expect(env.rpc).toHaveBeenCalledTimes(1));
 setActiveOwnerInternal('user:bob');resolve({data:[row(true)],error:null});
 expect(await pending).toEqual([]);expect(readMirror('alice').entries).toEqual({});expect(readMirror('bob').entries).toEqual({});
});
it('does not coalesce a new epoch or erase its pending slot when the old flight finishes',async()=>{
 let oldResolve!:(x:unknown)=>void,newResolve!:(x:unknown)=>void;
 env.rpc.mockReturnValueOnce(new Promise(r=>{oldResolve=r})).mockReturnValueOnce(new Promise(r=>{newResolve=r}));
 const old=listStoriesSummary('flights');await vi.waitFor(()=>expect(env.rpc).toHaveBeenCalledTimes(1));
 setActiveOwnerInternal('user:bob');setActiveOwnerInternal('user:alice');
 const fresh=listStoriesSummary('flights');await vi.waitFor(()=>expect(env.rpc).toHaveBeenCalledTimes(2));
 oldResolve({data:[row(false)],error:null});expect(await old).toEqual([]);
 const same=listStoriesSummary('flights');await Promise.resolve();await Promise.resolve();
 expect(env.rpc).toHaveBeenCalledTimes(2);
 newResolve({data:[row(true)],error:null});expect((await fresh)[0].completed).toBe(true);expect((await same)[0].completed).toBe(true);
 expect(readMirror('alice').entries.story.completed).toBe(true);
});
it('preserves current-owner authoritative mirror behavior',async()=>{
 env.rpc.mockResolvedValue({data:[row(true)],error:null});
 expect((await listStoriesSummary('positive'))[0].completed).toBe(true);
 expect(readMirror('alice').entries.story.completed).toBe(true);
});

it('keeps synchronous RPC failure fallback usable and clears the failed flight',async()=>{
 env.rpc.mockImplementationOnce(()=>{throw new Error('synchronous offline')});
 expect(await listStoriesSummary('sync-error')).toEqual([]);
 env.rpc.mockResolvedValue({data:[row(true)],error:null});
 expect((await listStoriesSummary('sync-error'))[0].completed).toBe(true);
 expect(env.rpc).toHaveBeenCalledTimes(2);
});
it.each(['null','error','different-user'])('fails closed for stable active-user authentication mismatch: %s',async kind=>{
 if(kind==='error')env.session.mockRejectedValue(new Error('offline-auth'));
 else env.session.mockResolvedValue({data:{session:kind==='null'?null:{user:{id:'bob'}}}});
 expect(await listStoriesSummary('auth-mismatch-'+kind)).toEqual([]);
 expect(env.rpc).not.toHaveBeenCalled();
 expect(readMirror('alice').entries).toEqual({});
});
it('preserves a healthy guest RPC result under the same guest identity',async()=>{
 setActiveOwnerInternal('guest:fixture');env.session.mockResolvedValue({data:{session:null}});
 // A synthetic guest-evidence boundary is used here; no eligibility assertion.
 env.rpc.mockResolvedValue({data:[row(true)],error:null});
 expect((await listStoriesSummary('guest-positive'))[0].completed).toBe(true);
 expect(env.rpc).toHaveBeenCalledWith('list_stories_guest_v3',expect.objectContaining({p_world_slug:'guest-positive'}));
 expect(readMirror('alice').entries).toEqual({});
});
it('does not use guest fallback for an offline active-user session mismatch',async()=>{
 const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
 try {
  env.session.mockResolvedValue({data:{session:null}});
  expect(await listStoriesSummary('offline-mismatch')).toEqual([]);
  expect(env.rpc).not.toHaveBeenCalled();
 } finally {online.mockRestore();}
});
