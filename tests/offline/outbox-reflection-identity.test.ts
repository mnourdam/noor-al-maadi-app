import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {__resetIdentityForTests,setActiveOwnerInternal} from '@/lib/identity/owner';
import {installIdentityPartition,__uninstallPartitionForTests} from '@/lib/identity/partition';
const sdk=vi.hoisted(()=>({session:vi.fn(),user:vi.fn(),query:vi.fn(),upsert:vi.fn(),remove:vi.fn(),enqueue:vi.fn(),flush:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getUser:sdk.user,getSession:sdk.session},from:()=>({select:()=>({eq:sdk.query}),upsert:sdk.upsert,delete:()=>({eq:()=>({eq:()=>({eq:sdk.remove})})})})}}));
vi.mock('@/lib/offline/outbox',()=>({enqueueWithId:sdk.enqueue}));
vi.mock('@/lib/offline/flush',()=>({flushOutbox:sdk.flush}));
import {saveReflection,deleteReflection,hydrateReflectionsFromServer,getReflection,REFLECTIONS_KEY,REFLECTIONS_CHANGE_EVENT} from '@/lib/reflections';
const tomb='irth.reflections.tombstones.v1';
const record={mode:'write' as const,text:'synthetic private note',at:'2026-01-01'};
const rows=[{campaign_id:'c',activity_id:'a',note:record.text,mode:'write',updated_at:'2026-02-01'}];
function deferred(){let resolve!:(x:any)=>void;const promise=new Promise<any>(r=>{resolve=r});return{promise,resolve};}
const session=(id:string)=>({data:{session:{user:{id}}}});
beforeEach(()=>{__uninstallPartitionForTests();localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:alice');installIdentityPartition();Object.values(sdk).forEach(m=>m.mockReset());sdk.session.mockResolvedValue(session('alice'));sdk.user.mockResolvedValue({data:{user:{id:'alice'}}});sdk.query.mockResolvedValue({data:[],error:null});sdk.enqueue.mockResolvedValue({});sdk.flush.mockResolvedValue(undefined);sdk.upsert.mockResolvedValue({error:null});sdk.remove.mockResolvedValue({error:null});});
afterEach(()=>{vi.restoreAllMocks();__uninstallPartitionForTests();});
for(const aba of [false,true]) it(`retires hydration before writing ${aba?'successor Alice':'Bob'} notes`,async()=>{
 const q=deferred();sdk.query.mockReturnValue(q.promise);const work=hydrateReflectionsFromServer();await vi.waitFor(()=>expect(sdk.query).toHaveBeenCalledOnce());setActiveOwnerInternal('user:bob');if(aba)setActiveOwnerInternal('user:alice');const bytes=localStorage.getItem(REFLECTIONS_KEY);q.resolve({data:rows,error:null});await work;expect(localStorage.getItem(REFLECTIONS_KEY)).toBe(bytes);
});
it('never queues old-owner saved content under a later authenticated owner',async()=>{
 const auth=deferred();sdk.session.mockReturnValue(auth.promise);saveReflection('c','a',record);setActiveOwnerInternal('user:bob');auth.resolve(session('bob'));await new Promise(r=>setTimeout(r,20));expect(sdk.enqueue).not.toHaveBeenCalled();expect(sdk.upsert).not.toHaveBeenCalled();expect(getReflection('c','a')).toBeNull();
});
it('does not add a delete tombstone to a later owner after auth',async()=>{
 localStorage.setItem(REFLECTIONS_KEY,JSON.stringify({'c:a':record}));const auth=deferred();sdk.session.mockReturnValue(auth.promise);const work=deleteReflection('c','a');setActiveOwnerInternal('user:bob');auth.resolve(session('bob'));await work;expect(localStorage.getItem(tomb)).toBeNull();expect(sdk.enqueue).not.toHaveBeenCalled();expect(sdk.remove).not.toHaveBeenCalled();
});
it('retired queued save cannot continue into direct upsert',async()=>{
 const q=deferred();sdk.enqueue.mockReturnValue(q.promise);saveReflection('c','a',record);await vi.waitFor(()=>expect(sdk.enqueue).toHaveBeenCalledOnce());setActiveOwnerInternal('user:bob');q.resolve({});await new Promise(r=>setTimeout(r,20));expect(sdk.flush).not.toHaveBeenCalled();expect(sdk.upsert).not.toHaveBeenCalled();
});
it('retired delete response cannot clear successor tombstone',async()=>{
 const q=deferred();sdk.remove.mockReturnValue(q.promise);const work=deleteReflection('c','a');await vi.waitFor(()=>expect(sdk.remove).toHaveBeenCalledOnce());setActiveOwnerInternal('user:bob');const bytes=JSON.stringify({'c:a':123});localStorage.setItem(tomb,bytes);q.resolve({error:null});await work;expect(localStorage.getItem(tomb)).toBe(bytes);
});
it('event reentry cannot transfer saved content or clear successor tombstones',async()=>{
 const listener=()=>{setActiveOwnerInternal('user:bob');localStorage.setItem(tomb,JSON.stringify({'c:a':123}));};window.addEventListener(REFLECTIONS_CHANGE_EVENT,listener,{once:true});saveReflection('c','a',record);await new Promise(r=>setTimeout(r,20));expect(localStorage.getItem(tomb)).toBe(JSON.stringify({'c:a':123}));expect(sdk.enqueue).not.toHaveBeenCalled();
});
it('keeps synthetic guest/Alice/Bob/guest offline records separate across partition reinstall',async()=>{
 sdk.session.mockResolvedValue({data:{session:null}});
 for(const owner of ['guest:fixture','user:alice','user:bob']) {setActiveOwnerInternal(owner);saveReflection('c','a',{...record,text:owner});await Promise.resolve();}
 __uninstallPartitionForTests();installIdentityPartition();
 for(const owner of ['guest:fixture','user:alice','user:bob','guest:fixture']) {setActiveOwnerInternal(owner);expect(getReflection('c','a')?.text).toBe(owner);}
 expect(sdk.enqueue).not.toHaveBeenCalled();expect(sdk.upsert).not.toHaveBeenCalled();
});
it('preserves current authenticated save and delete mirror operations',async()=>{
 saveReflection('c','a',record);await vi.waitFor(()=>expect(sdk.upsert).toHaveBeenCalledOnce());expect(sdk.enqueue.mock.calls[0][0]).toBe('alice');await deleteReflection('c','a');expect(sdk.remove).toHaveBeenCalledOnce();expect(getReflection('c','a')).toBeNull();expect(JSON.parse(localStorage.getItem(tomb)!)).toEqual({});
});
it('rejects stable authenticated identity mismatch without querying or transmitting',async()=>{
 sdk.user.mockResolvedValue({data:{user:{id:'bob'}}});sdk.session.mockResolvedValue(session('bob'));
 await hydrateReflectionsFromServer();saveReflection('c','a',record);await new Promise(r=>setTimeout(r,20));
 expect(sdk.query).not.toHaveBeenCalled();expect(sdk.enqueue).not.toHaveBeenCalled();expect(sdk.upsert).not.toHaveBeenCalled();expect(getReflection('c','a')?.text).toBe(record.text);
});
it('keeps current hydration timestamp merge and local newer pushback',async()=>{
 localStorage.setItem(REFLECTIONS_KEY,JSON.stringify({'local:a':record}));sdk.query.mockResolvedValue({data:rows,error:null});
 await hydrateReflectionsFromServer();await vi.waitFor(()=>expect(sdk.upsert).toHaveBeenCalledOnce());
 expect(getReflection('c','a')?.text).toBe(record.text);expect(getReflection('local','a')?.text).toBe(record.text);expect(sdk.upsert.mock.calls[0][0].user_id).toBe('alice');
});
