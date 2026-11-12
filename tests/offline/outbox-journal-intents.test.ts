import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore,IDBDatabase} from 'fake-indexeddb';
import {journalIntentsForOwner,type JournalCommandInput} from '@/lib/rewards/journal-intents';
import {openSettlementDatabase,SETTLEMENT_DB,SETTLEMENT_STORES} from '@/lib/rewards/database';
import {settlementForOwner} from '@/lib/rewards/settlement';
import {setActiveOwnerInternal,__resetIdentityForTests} from '@/lib/identity/owner';
const owner='user:alice';
const input=():JournalCommandInput=>({commandId:'cmd',commandType:'chapter-progress-attempt',protocol:1,campaignId:'c',chapterId:'ch',activityId:'a',payload:{campaignId:'c',chapterId:'ch',score:1},targets:[{key:'activity:c:ch:a',terms:'description-only',level:'activity'},{key:'chapter:c:ch',terms:'chapter-description',level:'chapter'}]});
const address=(key:string,who=owner)=>JSON.stringify([who,key]);
async function raw(store:string,key:string,value?:unknown,remove=false){const db=await openSettlementDatabase();try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction(store,value===undefined&&!remove?'readonly':'readwrite');const s=tx.objectStore(store);const q=remove?s.delete(key):value===undefined?s.get(key):s.put(value,key);tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());__resetIdentityForTests();setActiveOwnerInternal(owner);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('atomically stores an immutable command and v2 pending references, then permits synthetic read-only dispatch',async()=>{
 const api=journalIntentsForOwner(owner);const row=await api.prepare(input());expect(row?.commandRevision).toBe(1);
 for(const target of input().targets){expect(await raw('entitlements',address(target.key))).toMatchObject({version:2,owner,progress:'pending',reward:'awaiting_confirmation',binding:{kind:'journal-command-v1',commandId:'cmd'}});}
 const synthetic=vi.fn();const committed=await api.readCommitted('cmd');if(committed)synthetic(committed.payload);expect(synthetic).toHaveBeenCalledWith(input().payload);
 expect(await api.prepare(input())).toEqual(row);
});
it('captures input before awaits and returns clones',async()=>{const v=input();const api=journalIntentsForOwner(owner);const pending=api.prepare(v);v.targets[0].terms='mutated';const row=(await pending)!;row.targets[0].terms='also mutated';expect((await api.readCommitted('cmd'))?.targets[0].terms).toBe('description-only');});
for(const change of ['payload','terms','targets']as const)it(`rejects changed ${change} under an existing command`,async()=>{const api=journalIntentsForOwner(owner);await api.prepare(input());const v=input();if(change==='payload')v.payload={campaignId:'c',chapterId:'ch',score:2};if(change==='terms')v.targets[0].terms='new';if(change==='targets')v.targets.pop();await expect(api.prepare(v)).rejects.toThrow('command-conflict');});
it('rejects empty/duplicate targets and nonfinite/sparse/nonplain input before any write',()=>{for(const mutate of [(v:JournalCommandInput)=>{v.targets=[]},(v:JournalCommandInput)=>{v.targets.push(v.targets[0])},(v:JournalCommandInput)=>{v.payload={score:NaN}},(v:JournalCommandInput)=>{v.payload=new Array(2)},(v:JournalCommandInput)=>{v.payload=new Date() as any}]){const v=input();mutate(v);expect(()=>journalIntentsForOwner(owner).prepare(v)).toThrow();}});
it('does not repair a missing or conflicting referenced row',async()=>{const api=journalIntentsForOwner(owner);await api.prepare(input());await raw('entitlements',address(input().targets[0].key),undefined,true);await expect(api.readCommitted('cmd')).rejects.toThrow();await expect(api.prepare(input())).rejects.toThrow();expect(await raw('entitlements',address(input().targets[0].key))).toBeUndefined();});
for(const failStore of ['intents','entitlements'])it(`rolls back every write when actual ${failStore} add succeeds then transaction aborts`,async()=>{
 const original=IDBObjectStore.prototype.add;vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){const request=original.apply(this,args);if(this.name===failStore)request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;});
 await expect(journalIntentsForOwner(owner).prepare(input())).rejects.toThrow();expect(await raw('intents',address('cmd'))).toBeUndefined();for(const target of input().targets)expect(await raw('entitlements',address(target.key))).toBeUndefined();
});
it('competing real IDB transactions cannot accept conflicting commands for the same entitlement',async()=>{
 const a=journalIntentsForOwner(owner),b=journalIntentsForOwner(owner);const v={...input(),commandId:'other'};
 const result=await Promise.allSettled([a.prepare(input()),b.prepare(v)]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
});
it('v1 APIs reject same-owner mixed rows but another owner journal does not poison its list',async()=>{
 await journalIntentsForOwner(owner).prepare(input());await expect(settlementForOwner(owner).list()).rejects.toThrow('corrupt-record');
 setActiveOwnerInternal('user:bob');expect(await settlementForOwner('user:bob').list()).toEqual([]);
});
it('v1 row collisions reject without converting bytes',async()=>{const key=input().targets[0].key;const old=await settlementForOwner(owner).prepare({key,source:'local',terms:'old',binding:{operationId:'old',revision:null,snapshot:'old'},expected:null});await expect(journalIntentsForOwner(owner).prepare(input())).rejects.toThrow();expect(await raw('entitlements',address(key))).toEqual(old);});
it('retired owner cannot accept or dispatch a committed command',async()=>{const api=journalIntentsForOwner(owner);await api.prepare(input());setActiveOwnerInternal('user:bob');setActiveOwnerInternal(owner);await expect(api.readCommitted('cmd')).rejects.toThrow('identity-changed');});
async function oldDatabase(version:number,stores:readonly string[]){return new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(SETTLEMENT_DB,version);q.onupgradeneeded=()=>{for(const s of stores)q.result.createObjectStore(s);};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
for(const version of [1,2])it(`upgrades valid v${version} without changing old bytes`,async()=>{
 const db=await oldDatabase(version,version===1?['entitlements']:SETTLEMENT_STORES);await new Promise<void>(resolve=>{const tx=db.transaction('entitlements','readwrite');tx.objectStore('entitlements').put({sentinel:'unchanged'},'legacy-fixture');tx.oncomplete=()=>resolve();});db.close();
 const next=await openSettlementDatabase();expect(next.version).toBe(3);expect([...next.objectStoreNames].sort()).toEqual([...SETTLEMENT_STORES,'intents'].sort());next.close();expect(await raw('entitlements','legacy-fixture')).toEqual({sentinel:'unchanged'});
});
it('does not repair a corrupt v2 missing a required store',async()=>{const db=await oldDatabase(2,['entitlements','economy','appliedGrants']);db.close();await expect(openSettlementDatabase()).rejects.toThrow('invalid-schema');const old=await oldDatabase(2,[]);expect(old.objectStoreNames.contains('intents')).toBe(false);expect(old.objectStoreNames.contains('migrationState')).toBe(false);old.close();});
it('interrupted upgrade rolls back the new store and database version',async()=>{
 const db=await oldDatabase(2,SETTLEMENT_STORES);db.close();const original=IDBDatabase.prototype.createObjectStore;
 vi.spyOn(IDBDatabase.prototype,'createObjectStore').mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase['createObjectStore']>){const s=original.apply(this,args);if(args[0]==='intents')s.transaction.abort();return s;});
 await expect(openSettlementDatabase()).rejects.toThrow();vi.restoreAllMocks();const old=await oldDatabase(2,[]);expect(old.version).toBe(2);expect(old.objectStoreNames.contains('intents')).toBe(false);old.close();
});
it('forces two open write transactions while the first is held, then rejects the conflicting successor',async()=>{
 const original=IDBDatabase.prototype.transaction;let release=false,opened=0,firstReady=false;
 vi.spyOn(IDBDatabase.prototype,'transaction').mockImplementation(function(this:IDBDatabase,...args:Parameters<IDBDatabase['transaction']>){const tx=original.apply(this,args);if(args[1]==='readwrite' && tx.objectStoreNames.contains('intents')){opened++;if(opened===1){const keep=()=>{const q=tx.objectStore('intents').get('__hold');q.onsuccess=()=>{firstReady=true;if(!release)keep();};};keep();}}return tx;});
 const first=journalIntentsForOwner(owner).prepare(input());
 const second=journalIntentsForOwner(owner).prepare({...input(),commandId:'competitor'});const observed=second.then(()=>true,()=>false);
 await vi.waitFor(()=>{expect(firstReady).toBe(true);expect(opened).toBe(2);});release=true;await first;expect(await observed).toBe(false);
 expect(await journalIntentsForOwner(owner).readCommitted('competitor')).toBeUndefined();
});
it('aborts after intent and both reference writes succeeded, leaving neither side committed',async()=>{
 const original=IDBObjectStore.prototype.add;const reached:string[]=[];
 vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){const q=original.apply(this,args);q.addEventListener('success',()=>{reached.push(this.name);if(reached.length===3)this.transaction.abort();});return q;});
 await expect(journalIntentsForOwner(owner).prepare(input())).rejects.toThrow();expect(reached.sort()).toEqual(['entitlements','entitlements','intents']);expect(await raw('intents',address('cmd'))).toBeUndefined();for(const t of input().targets)expect(await raw('entitlements',address(t.key))).toBeUndefined();
});
it('identity retirement during successful writes aborts both intent and references',async()=>{
 const original=IDBObjectStore.prototype.add;let switched=false;
 vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){const q=original.apply(this,args);q.addEventListener('success',()=>{if(!switched){switched=true;setActiveOwnerInternal('user:bob');}});return q;});
 await expect(journalIntentsForOwner(owner).prepare(input())).rejects.toThrow('identity-changed');setActiveOwnerInternal(owner);expect(await journalIntentsForOwner(owner).readCommitted('cmd')).toBeUndefined();
});
it('a fresh reader after all prior connections close recovers the exact committed command, not a new ID',async()=>{
 await journalIntentsForOwner(owner).prepare(input());const fresh=journalIntentsForOwner(owner);const row=await fresh.readCommitted('cmd');expect(row?.commandId).toBe('cmd');expect(row?.payload).toEqual(input().payload);expect(await fresh.readCommitted('missing')).toBeUndefined();
});
it('rejects corrupt v2 store configuration without adding intents',async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(SETTLEMENT_DB,2);q.onupgradeneeded=()=>{for(const name of SETTLEMENT_STORES)q.result.createObjectStore(name,name==='economy'?{keyPath:'id'}:undefined);};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
 await expect(openSettlementDatabase()).rejects.toThrow('invalid-schema');const old=await oldDatabase(2,[]);expect(old.objectStoreNames.contains('intents')).toBe(false);old.close();
});

for(const value of [undefined,null,false,0,''])it(`rejects present malformed intent ${String(value)} instead of treating it as absent`,async()=>{
 const db=await openSettlementDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('intents','readwrite');tx.objectStore('intents').put(value,address('cmd'));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
 const api=journalIntentsForOwner(owner);await expect(api.readCommitted('cmd')).rejects.toThrow('corrupt-intent');await expect(api.prepare(input())).rejects.toThrow('corrupt-intent');expect(await raw('intents',address('cmd'))).toBe(value);
});

for(const change of ['remove-target','level','activity'] as const)it(`rejects one-sided persisted ${change} mutation`,async()=>{
 const api=journalIntentsForOwner(owner);await api.prepare(input());const row=await raw('intents',address('cmd'));
 if(change==='remove-target')row.targets.pop();if(change==='level')row.targets[0].level='campaign';if(change==='activity')row.activityId='different';
 await raw('intents',address('cmd'),row);await expect(api.readCommitted('cmd')).rejects.toThrow('corrupt-intent');await expect(api.prepare(input())).rejects.toThrow();
 expect(await raw('intents',address('cmd'))).toEqual(row);
});
it('rejects rewritten command canonical text when existing references still bind the original full command',async()=>{
 const api=journalIntentsForOwner(owner);await api.prepare(input());const row=await raw('intents',address('cmd'));row.activityId='different';row.commandCanonical=row.commandCanonical.replace('"activityId":"a"','"activityId":"different"');await raw('intents',address('cmd'),row);
 await expect(api.readCommitted('cmd')).rejects.toThrow('entitlement-conflict');
});
