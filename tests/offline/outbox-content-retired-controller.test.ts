import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
const e=vi.hoisted(()=>({refresh:vi.fn(),apply:vi.fn(),fingerprint:vi.fn(),record:vi.fn()}));
vi.mock('@/lib/offline-snapshot',()=>({refreshSnapshotIncremental:()=>e.refresh()}));
vi.mock('@/lib/offline-snapshot-validate',()=>({validateSnapshot:()=>({ok:true})}));
vi.mock('@/lib/local-first-store',()=>({applyLocalSnapshot:e.apply}));
vi.mock('@/lib/offline-manifest',()=>({fetchContentManifest:async()=>null,isManifestCountComparable:()=>true,isManifestTimestampCanonical:()=>true}));
vi.mock('@/lib/stories/content-identity-check',()=>({fetchStoryEditorialFingerprint:()=>e.fingerprint()}));
vi.mock('@/lib/stories/content-identity-store',()=>({recordAppliedIdentity:e.record}));
vi.mock('@/lib/offline-snapshot-warm-bridge',()=>({warmSnapshotImageCache:async()=>{}}));
import {applyContentUpdate,persistAppliedStoryIdentity,__resetContentUpdateState} from '@/lib/offline-content-update';
import {saveSnapshot,loadSnapshot} from '@/lib/offline-storage';
const snapshot=(v:number)=>({snapshot_version:v,schema_version:5,generated_at:'2026-11-12T00:00:00Z',content_counts:{encyclopedia_entities:1500},collections:{encyclopedia_entities:Array.from({length:1500},(_,id)=>({id}))}});
function deferred<T>(){let resolve!:(v:T)=>void;return {promise:new Promise<T>(r=>resolve=r),resolve:(v:T)=>resolve(v)}}
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());localStorage.clear();vi.resetAllMocks();__resetContentUpdateState();e.fingerprint.mockResolvedValue(null)});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
it('retired download cannot replace actual durable retry snapshot',async()=>{
 await saveSnapshot(snapshot(1));const late=deferred<ReturnType<typeof snapshot>>();const entered=deferred<void>();
 e.refresh.mockImplementationOnce(()=>{entered.resolve();return late.promise}).mockResolvedValueOnce(snapshot(3));
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const first=applyContentUpdate(1000);await entered.promise;await vi.advanceTimersByTimeAsync(1001);expect(await first).toBe(false);
 vi.useRealTimers();expect(await applyContentUpdate(1000)).toBe(true);
 late.resolve(snapshot(2));await new Promise(r=>setTimeout(r,20));
 expect((await loadSnapshot())?.snapshot_version).toBe(3);
 expect(e.apply.mock.calls.at(-1)?.[0].snapshot_version).toBe(3);
});
it('retired editorial fingerprint cannot overwrite newer identity metadata',async()=>{
 const late=deferred<null>();const entered=deferred<void>();let current=true;
 e.fingerprint.mockImplementationOnce(()=>{entered.resolve();return late.promise});
 const old=persistAppliedStoryIdentity(snapshot(2),()=>current);await entered.promise;current=false;
 await persistAppliedStoryIdentity(snapshot(3));late.resolve(null);await old;
 expect(e.record).toHaveBeenCalledTimes(1);
});
