import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import * as images from '@/lib/image-cache';
import {saveSnapshot,loadSnapshot} from '@/lib/offline-storage';
const snapshot={snapshot_version:2,schema_version:5,generated_at:'2026-11-12T00:00:00Z',content_counts:{encyclopedia_entities:1500},collections:{encyclopedia_entities:Array.from({length:1500},(_,id)=>({id}))}};
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());localStorage.clear()});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
it('actual quota retry reclaims only disposable image caches, leaving user bytes untouched',async()=>{
 const names=new Set(['irth-images-v1','irth-images-old','auth-cache','content-cache']);
 const remove=vi.fn(async(k:string)=>names.delete(k));vi.stubGlobal('caches',{keys:async()=>[...names],delete:remove});
 localStorage.setItem('synthetic-user-progress','unchanged');const deleteDB=vi.spyOn(indexedDB,'deleteDatabase');
 const native=IDBObjectStore.prototype.put;let writes=0;
 vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['put']>){writes++;if(names.has('irth-images-v1'))throw new DOMException('synthetic quota','QuotaExceededError');return native.apply(this,args)});
 await saveSnapshot(snapshot);expect(writes).toBe(2);expect(remove.mock.calls.map(c=>c[0]).sort()).toEqual(['irth-images-old','irth-images-v1']);
 expect([...names].sort()).toEqual(['auth-cache','content-cache']);expect((await loadSnapshot())?.snapshot_version).toBe(2);
 expect(localStorage.getItem('synthetic-user-progress')).toBe('unchanged');expect(localStorage.getItem('irth.offline.snapshot.v2')).toBeNull();expect(deleteDB).not.toHaveBeenCalled();
});
it('reclaim export tolerates unavailable CacheStorage',async()=>{vi.stubGlobal('caches',undefined);expect(await images.reclaimDisposableImageCaches()).toBe(0)});
it.each(['plain','keyed'])('%s prefetch honors existing exhausted origin storage budget',async(kind)=>{
 const fetcher=vi.fn(async()=>{throw Error('network forbidden')});const sign=vi.fn(async()=> 'https://synthetic.invalid/a.png');
 vi.stubGlobal('fetch',fetcher);vi.stubGlobal('caches',{open:async()=>({match:async()=>null,put:vi.fn()})});
 vi.stubGlobal('navigator',{onLine:true,storage:{estimate:async()=>({usage:900*1024**2,quota:1024**3})}});
 if(kind==='plain')await images.prefetchImages(['https://synthetic.invalid/a.png']);else await images.prefetchKeyedImages([{key:'synthetic',getUrl:sign}]);
 expect(fetcher).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
});
it.each(['plain','keyed'])('%s prefetch still warms one synthetic image with available budget',async(kind)=>{
 const put=vi.fn();const response={ok:true,type:'basic',clone(){return this},headers:{get:()=> '16'}};
 const fetcher=vi.fn(async()=>response);vi.stubGlobal('fetch',fetcher);vi.stubGlobal('caches',{open:async()=>({match:async()=>null,put})});
 vi.stubGlobal('navigator',{onLine:true,storage:{estimate:async()=>({usage:0,quota:2*1024**3})}});
 if(kind==='plain')await images.prefetchImages(['https://synthetic.invalid/a.png']);else await images.prefetchKeyedImages([{key:'synthetic',getUrl:async()=> 'https://synthetic.invalid/a.png'}]);
 expect(fetcher).toHaveBeenCalledOnce();expect(put).toHaveBeenCalledOnce();
});
it.each(['plain','keyed'])('%s prefetch stops scheduling after byte budget exhaustion (in-flight workers may finish)',async(kind)=>{
 const put=vi.fn();const response={ok:true,type:'basic',clone(){return this},headers:{get:()=>String(500*1024**2)}};
 const fetcher=vi.fn(async()=>response);vi.stubGlobal('fetch',fetcher);vi.stubGlobal('caches',{open:async()=>({match:async()=>null,put})});
 vi.stubGlobal('navigator',{onLine:true});vi.stubGlobal('Capacitor',{isNativePlatform:()=>true});
 const urls=Array.from({length:12},(_,i)=>`https://synthetic.invalid/budget-${i}.png`);
 if(kind==='plain')await images.prefetchImages(urls);else await images.prefetchKeyedImages(urls.map(key=>({key,getUrl:async()=>key})));
 expect(fetcher.mock.calls.length).toBeGreaterThan(0);expect(fetcher.mock.calls.length).toBeLessThanOrEqual(6);expect(put).toHaveBeenCalledTimes(fetcher.mock.calls.length);
});
