import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore,IDBDatabase} from 'fake-indexeddb';
import {setActiveOwnerInternal,getActiveUserId,__resetIdentityForTests} from '@/lib/identity/owner';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:getActiveUserId()}}}})},rpc:(...args:unknown[])=>rpc(...args)}}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
import {recordChapterProgress} from '@/lib/offline/record';
import {saveGameplay,readDurableSaveReceipt,type DurableSaveReceipt} from '@/lib/offline/gameplay-write';
import {prepareCampaignPending} from '@/lib/rewards/campaign-pending';
import {settlementForOwner} from '@/lib/rewards/settlement';
import {openSettlementDatabase} from '@/lib/rewards/database';
const payload={campaignId:'c',chapterId:'ch',score:1};
const rpc=vi.fn();
const save=(capture=true)=>saveGameplay({userId:'alice',id:'chapter:c:ch',kind:'chapter_progress',payload,rpc,captureDurableReceipt:capture});
const intent=(r:DurableSaveReceipt)=>({key:'campaign-attempt:c:ch:a',campaignId:'c',chapterId:'ch',terms:'existing-authored-tier-description-v1',operationId:r.operationId,revision:r.revision,payloadSnapshot:r.payloadSnapshot,expected:null});
beforeEach(()=>{localStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:alice');vi.stubGlobal('indexedDB',new IDBFactory());const tails=new Map<string,Promise<unknown>>();vi.stubGlobal('navigator',{onLine:true,locks:{request:(n:string,_:unknown,fn:()=>unknown)=>{const work=(tails.get(n)??Promise.resolve()).then(fn);tails.set(n,work.catch(()=>{}));return work;}}});rpc.mockReset().mockResolvedValue({data:{ok:true},error:null});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('joins an actual accepted outbox revision to existing pending journal only',async()=>{
 const result=await save();expect(result.acknowledged).toBe(true);const r=result.durableReceipt!;expect(Object.isFrozen(r)).toBe(true);
 await prepareCampaignPending(r,intent(r));const row=await settlementForOwner('user:alice').read(intent(r).key);
 expect(row?.attempts).toEqual([{binding:{operationId:r.operationId,revision:r.revision,snapshot:JSON.stringify(payload)},progress:'pending',reward:'awaiting_confirmation'}]);
 const db=await openSettlementDatabase();for(const store of ['economy','appliedGrants','migrationState']){const count=await new Promise<number>((resolve,reject)=>{const q=db.transaction(store).objectStore(store).count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});expect(count).toBe(0);}db.close();
});
it('preserves default outcome shape without opting in',async()=>{expect((await save(false)).durableReceipt).toBeUndefined();});
it('rejects copied receipts, altered revision/payload and conflicting terms',async()=>{
 const r=(await save()).durableReceipt!;await expect(prepareCampaignPending({...r},intent(r))).rejects.toThrow('invalid-or-retired');
 for(const change of [{revision:'other'},{payloadSnapshot:'{}'},{operationId:'other'}])await expect(prepareCampaignPending(r,{...intent(r),...change})).rejects.toThrow('receipt-mismatch');
 await prepareCampaignPending(r,intent(r));await expect(prepareCampaignPending(r,{...intent(r),terms:'changed'})).rejects.toThrow('entitlement-conflict');
});
it('rejects ABA receipts even though the same owner name returns',async()=>{const r=(await save()).durableReceipt!;setActiveOwnerInternal('user:bob');setActiveOwnerInternal('user:alice');expect(()=>readDurableSaveReceipt(r)).toThrow('invalid-or-retired');});
it('records the unresolved cross-store crash gap rather than inventing confirmation',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'offline'}});const r=(await save()).durableReceipt!;
 expect(await settlementForOwner('user:alice').read(intent(r).key)).toBeUndefined();
 // No journal was written merely because outbox accepted the intent.
 await prepareCampaignPending(r,intent(r));expect((await settlementForOwner('user:alice').read(intent(r).key))?.attempts[0].progress).toBe('pending');
});

it('uses the actual chapter recorder facade with opt-in immutable accepted receipt',async()=>{
 const outcome=await recordChapterProgress({...payload,status:'unlocked'},{captureDurableReceipt:true});
 const r=outcome.durableReceipt!;expect(r.operationId).toBe('chapter_progress:alice:c:ch');
 await prepareCampaignPending(r,intent(r));expect((await settlementForOwner('user:alice').read(intent(r).key))?.attempts[0].progress).toBe('pending');
});
it('omits proof when fallback silently loses the enqueue although RPC acknowledges',async()=>{
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(()=>{throw new Error('synthetic IDB write failure');});
 const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(!k.startsWith('irth.outbox.fallback'))original.call(this,k,v);});
 const outcome=await save();expect(outcome.acknowledged).toBe(true);expect(outcome.durableReceipt).toBeUndefined();
});
it('does not downgrade legacy unknown or relabel confirmed history as pending',async()=>{
 const r=(await save()).durableReceipt!;const i=intent(r);const journal=settlementForOwner('user:alice');
 await journal.prepare({key:i.key,source:'local',terms:i.terms,binding:{operationId:r.operationId,revision:r.revision,snapshot:r.payloadSnapshot},expected:null,legacy:true});
 await expect(prepareCampaignPending(r,i)).rejects.toThrow('non-pending-history');
 expect((await journal.read(i.key))?.attempts[0].progress).toBe('legacy_unknown');
});
it('rejects another chapter description and changed revision without explicit expected CAS',async()=>{
 const r=(await save()).durableReceipt!;await expect(prepareCampaignPending(r,{...intent(r),chapterId:'other'})).rejects.toThrow('chapter-mismatch');
 await prepareCampaignPending(r,intent(r));const next=(await save()).durableReceipt!;expect(next.revision).not.toBe(r.revision);
 await expect(prepareCampaignPending(next,intent(next))).rejects.toThrow('stale-binding');
});
it('retains the issued snapshot rather than adopting a later replacement queue row',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'offline'}});
 const first=(await save()).durableReceipt!;const second=(await saveGameplay({userId:'alice',id:first.operationId,kind:'chapter_progress',payload:{...payload,score:2},rpc,captureDurableReceipt:true})).durableReceipt!;
 expect(second.revision).not.toBe(first.revision);expect(readDurableSaveReceipt(first).payloadSnapshot).toBe(JSON.stringify(payload));
 await prepareCampaignPending(first,intent(first));expect((await settlementForOwner('user:alice').read(intent(first).key))?.attempts[0].binding.revision).toBe(first.revision);
});
it('a confirmed journal row is never exposed as a pending result',async()=>{
 const r=(await save()).durableReceipt!;const i=intent(r);await prepareCampaignPending(r,i);const journal=settlementForOwner('user:alice');const row=(await journal.read(i.key))!;
 await journal.settle(i.key,row.attempts[0].binding,{state:'confirmed',rewardDue:false,evidence:'synthetic test only'});
 await expect(prepareCampaignPending(r,i)).rejects.toThrow('non-pending-history');expect((await journal.read(i.key))?.attempts[0].progress).toBe('confirmed');
});
it('retired RPC completion cannot yield a usable receipt capability',async()=>{
 let resolve!:(x:any)=>void;rpc.mockReturnValue(new Promise(r=>{resolve=r}));const pending=save();await vi.waitFor(()=>expect(rpc).toHaveBeenCalledOnce());
 setActiveOwnerInternal('user:bob');resolve({data:{ok:true},error:null});const result=await pending;
 expect(result.acknowledged).toBe(false);expect(result.reason).toBe('identity_changed');expect(()=>readDurableSaveReceipt(result.durableReceipt!)).toThrow('invalid-or-retired');
});
for(const optInFirst of [false,true])it(`mixed receipt callers share one dispatch, opt-in first=${optInFirst}`,async()=>{
 let resolve!:(v:any)=>void;rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const first=save(optInFirst),second=save(!optInFirst);await vi.waitFor(()=>expect(rpc).toHaveBeenCalledOnce());resolve({data:{ok:true},error:null});
 const [a,b]=await Promise.all([first,second]);const ordinary=optInFirst?b:a, opted=optInFirst?a:b;
 expect(ordinary.durableReceipt).toBeUndefined();expect(opted.durableReceipt).toBeDefined();expect(rpc).toHaveBeenCalledOnce();
});
it('pending-only prepare refuses rejection committed after the caller read the same binding',async()=>{
 const r=(await save()).durableReceipt!;const i=intent(r);await prepareCampaignPending(r,i);const journal=settlementForOwner('user:alice');
 const stale=(await journal.read(i.key))!;const binding=stale.attempts[0].binding;
 // Force the interleaving: caller read B, another actual IDB transaction rejects B,
 // then caller prepares C using still-equal expected binding B.
 await journal.settle(i.key,binding,{state:'rejected',evidence:'synthetic rejection'});
 const before=await journal.read(i.key);
 await expect(journal.prepare({key:i.key,source:'local',terms:i.terms,binding:{...binding,revision:'next'},expected:binding,pendingOnly:true})).rejects.toThrow('non-pending-history');
 expect(await journal.read(i.key)).toEqual(before);
});
it('snapshots the opt-in flag before await rather than reading a later caller mutation',async()=>{
 const params={userId:'alice',id:'snapshot-option',kind:'chapter_progress' as const,payload,rpc,captureDurableReceipt:false};
 const pending=saveGameplay(params);params.captureDurableReceipt=true;expect((await pending).durableReceipt).toBeUndefined();
});
it('journal write failure preserves the previous row without touching economic stores',async()=>{
 const r=(await save()).durableReceipt!;const i=intent(r);
 const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['put']>){if(this.name==='entitlements')throw new Error('synthetic journal failure');return original.apply(this,args);});
 await expect(prepareCampaignPending(r,i)).rejects.toThrow();expect(await settlementForOwner('user:alice').read(i.key)).toBeUndefined();
});

it('enqueue deadline stays unresolved after a late transaction completion notification',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const original=IDBDatabase.prototype.transaction;let release:(()=>void)|undefined;let intercepted=false;
 vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase['transaction']>){
  const tx=original.apply(this,args);
  if(this.name==='irth-offline-outbox' && args[1]==='readwrite' && !intercepted){
   intercepted=true;
   Object.defineProperty(tx,'oncomplete',{configurable:true,set(handler){tx.addEventListener('complete',event=>{release=()=>handler.call(tx,event);});}});
  }
  return tx;
 });
 const pending=save();
 // IDB uses its real asynchronous task queue; only UI deadlines are virtual.
 for(let n=0;n<100 && !release;n++)await new Promise<void>(r=>setImmediate(r));
 expect(release).toBeDefined();await vi.advanceTimersByTimeAsync(8001);
 const result=await pending;expect(result.storageState).toBe('unresolved');expect(result.durableReceipt).toBeUndefined();expect(rpc).not.toHaveBeenCalled();
 release!();await Promise.resolve();expect(result.durableReceipt).toBeUndefined();expect(rpc).not.toHaveBeenCalled();
});
it('late opt-in after ordinary dispatch receives no fabricated proof or second request',async()=>{
 let resolve!:(v:any)=>void;rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const ordinary=save(false);await vi.waitFor(()=>expect(rpc).toHaveBeenCalledOnce());
 const late=save(true);resolve({data:{ok:true},error:null});
 expect((await ordinary).durableReceipt).toBeUndefined();expect((await late).durableReceipt).toBeUndefined();expect(rpc).toHaveBeenCalledOnce();
});

it('rejects malformed runtime identifiers even when an issued receipt contains matching numeric values',async()=>{
 const r=(await saveGameplay({userId:'alice',id:'malformed-identifiers',kind:'chapter_progress',payload:{campaignId:7,chapterId:8},rpc,captureDurableReceipt:true})).durableReceipt!;
 await expect(prepareCampaignPending(r,{...intent(r),campaignId:7,chapterId:8} as unknown as Parameters<typeof prepareCampaignPending>[1])).rejects.toThrow('chapter-mismatch');
 const valid=(await save()).durableReceipt!;
 for(const key of ['campaign-attempt:',7])await expect(prepareCampaignPending(valid,{...intent(valid),key} as unknown as Parameters<typeof prepareCampaignPending>[1])).rejects.toThrow('receipt-mismatch');
});

it('preserves identical default Promise identity even when an opt-in caller shares the flight',async()=>{
 let resolve!:(v:any)=>void;rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const first=save(false),second=save(false),opted=save(true),third=save(false);
 expect(first).toBe(second);expect(third).toBe(first);
 await vi.waitFor(()=>expect(rpc).toHaveBeenCalledOnce());resolve({data:{ok:true},error:null});
 expect((await first).durableReceipt).toBeUndefined();expect((await opted).durableReceipt).toBeDefined();
});
