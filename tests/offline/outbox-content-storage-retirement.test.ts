import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
const cache=vi.hoisted(()=>({reclaim:vi.fn()}));
vi.mock('@/lib/image-cache',()=>({reclaimDisposableImageCaches:()=>cache.reclaim()}));
import {saveSnapshot,loadSnapshot} from '@/lib/offline-storage';
const snapshot=(v:number)=>({snapshot_version:v,schema_version:5,generated_at:'2026-11-12T00:00:00Z',content_counts:{encyclopedia_entities:1500},collections:{encyclopedia_entities:Array.from({length:1500},(_,id)=>({id}))}});
const save=saveSnapshot as (s:ReturnType<typeof snapshot>,signal?:AbortSignal)=>Promise<void>;
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());localStorage.clear()});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
it('pre-aborted write cannot replace a persisted successor',async()=>{
 await save(snapshot(3));const c=new AbortController();c.abort();
 const outcome=await save(snapshot(2),c.signal).then(()=> 'resolved',e=>e.name);
 expect((await loadSnapshot())?.snapshot_version).toBe(3);
 expect(outcome).toBe('AbortError');
});
it('abort after real IDB put success rolls transaction back and never falls back',async()=>{
 await save(snapshot(3));const c=new AbortController();const original=IDBObjectStore.prototype.put;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['put']>){
  const request=original.apply(this,args);request.addEventListener('success',()=>c.abort());return request;
 });
 const outcome=await save(snapshot(2),c.signal).then(()=> 'resolved',e=>e.name);
 expect((await loadSnapshot())?.snapshot_version).toBe(3);
 expect(localStorage.getItem('irth.offline.snapshot.v2')).toBeNull();
 expect(outcome).toBe('AbortError');
});
it('pre-aborted fallback cannot overwrite localStorage successor',async()=>{
 vi.stubGlobal('indexedDB',undefined);await save(snapshot(3));const before=localStorage.getItem('irth.offline.snapshot.v2');const c=new AbortController();c.abort();
 const outcome=await save(snapshot(2),c.signal).then(()=> 'resolved',e=>e.name);
 expect(localStorage.getItem('irth.offline.snapshot.v2')).toBe(before);expect(outcome).toBe('AbortError');
});
it('legacy no-signal writes still persist normally',async()=>{
 await save(snapshot(1));await save(snapshot(3));expect((await loadSnapshot())?.snapshot_version).toBe(3);
});

it('retired delayed open cannot overwrite a retry committed first',async()=>{
 await save(snapshot(1));const c=new AbortController();
 let opened!:()=>void;const ready=new Promise<void>(r=>opened=r);let release!:()=>void;
 const native=indexedDB.open.bind(indexedDB);
 const spy=vi.spyOn(indexedDB,'open').mockImplementationOnce((...args)=>{
  const req=native(...args);let handler:any;
  Object.defineProperty(req,'onsuccess',{configurable:true,set(fn){handler=fn},get(){return handler}});
  req.addEventListener('success',event=>{release=()=>handler?.call(req,event);opened()});return req;
 });
 const stale=save(snapshot(2),c.signal).then(()=> 'resolved',e=>e.name);
 await ready;c.abort();spy.mockRestore();await save(snapshot(3));release();
 expect(await stale).toBe('AbortError');expect((await loadSnapshot())?.snapshot_version).toBe(3);
});
it('abort during quota reclamation prevents retry and fallback over successor',async()=>{
 await save(snapshot(1));const c=new AbortController();let entered!:()=>void;const ready=new Promise<void>(r=>entered=r);let release!:(n:number)=>void;
 cache.reclaim.mockImplementationOnce(()=>{entered();return new Promise<number>(r=>release=r)});
 const spy=vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(()=>{throw new DOMException('synthetic quota','QuotaExceededError')});
 const stale=save(snapshot(2),c.signal).then(()=> 'resolved',e=>e.name);
 await ready;c.abort();spy.mockRestore();await save(snapshot(3));release(1);
 expect(await stale).toBe('AbortError');expect((await loadSnapshot())?.snapshot_version).toBe(3);
 expect(localStorage.getItem('irth.offline.snapshot.v2')).toBeNull();
});
it('spontaneous IDB AbortError still uses legacy fallback when signal is live',async()=>{
 const c=new AbortController();vi.spyOn(IDBObjectStore.prototype,'put').mockImplementationOnce(()=>{throw new DOMException('spontaneous transaction failure','AbortError')});
 await save(snapshot(3),c.signal);expect(JSON.parse(localStorage.getItem('irth.offline.snapshot.v2')!).snapshot_version).toBe(3);
});
