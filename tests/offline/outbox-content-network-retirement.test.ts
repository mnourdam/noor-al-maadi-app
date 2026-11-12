import {it,expect,vi,beforeEach} from 'vitest';
const e=vi.hoisted(()=>({fetch:vi.fn(),hasPrevious:true,updatedAt:null as string|null}));
vi.mock('@/integrations/supabase/client',async()=>{const {createClient}=await import('@supabase/supabase-js');return {supabase:createClient('http://127.0.0.1:1','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(...args:any[])=>e.fetch(...args)}})}});
vi.mock('@/lib/local-first-store',()=>({isLocalReady:()=>false,localDataVersion:()=>0}));
vi.mock('@/lib/offline-storage',()=>({loadSnapshot:async()=>e.hasPrevious?({snapshot_version:1,generated_at:'2020-01-01T00:00:00Z',collections:{encyclopedia_entities:[{id:'kept',...(e.updatedAt?{updated_at:e.updatedAt}:{})}]},content_counts:{encyclopedia_entities:1}}):null,saveSnapshot:vi.fn(),mergeSnapshots:vi.fn(),MIN_PUBLIC_ENCYCLOPEDIA_ROWS:1500,SNAPSHOT_SCHEMA_VERSION:5}));
vi.mock('@/lib/offline-manifest',()=>({fetchContentManifest:async()=>null,isManifestCountComparable:()=>true}));
import {refreshSnapshotIncremental} from '@/lib/offline-snapshot';
const refresh=refreshSnapshotIncremental as (options?:{signal?:AbortSignal;strictComplete?:boolean})=>ReturnType<typeof refreshSnapshotIncremental>;
beforeEach(()=>{vi.resetAllMocks();e.hasPrevious=true;e.updatedAt=null;e.fetch.mockImplementation(async()=>new Response(JSON.stringify({message:'synthetic unavailable',code:'TEST'}),{status:400,headers:{'Content-Type':'application/json'}}))});
it('strict controller refresh rejects unavailable collections instead of stamping success',async()=>{await expect(refresh({strictComplete:true})).rejects.toBeDefined()});
it('legacy refresh still retains cached collections on failure',async()=>{expect((await refresh()).collections.encyclopedia_entities).toEqual([{id:'kept'}])});
it('pre-aborted refresh rejects before issuing any request',async()=>{const c=new AbortController();c.abort();const result=await refresh({signal:c.signal,strictComplete:true}).then(()=> 'resolved',e=>e.name);expect(e.fetch).not.toHaveBeenCalled();expect(result).toBe('AbortError')});
it('actual PostgREST builder carries signal and abort is not swallowed into fallback',async()=>{
 const c=new AbortController();let seen:AbortSignal|undefined;
 e.fetch.mockImplementationOnce(async(_url:any,init:any)=>{seen=init.signal;c.abort();throw new DOMException('retired','AbortError')});
 const result=await refresh({signal:c.signal,strictComplete:true}).then(()=> 'resolved',e=>e.name);
 expect(seen).toBe(c.signal);expect(result).toBe('AbortError');expect(e.fetch).toHaveBeenCalledTimes(1);
});
function successResponse(url:any,init:any){
 const u=new URL(String(url));
 if(u.pathname.endsWith('/rpc/stories_snapshot_manifest_v2'))return new Response(JSON.stringify({ok:true,stories:[],story_scenes:[],story_media:[],story_collections:[]}));
 const count=u.pathname.endsWith('/encyclopedia_entities')?1500:0;
 if(init.method==='HEAD')return new Response(null,{headers:{'content-range':`0-0/${count}`}});
 const offset=Number(u.searchParams.get('offset')??0);const limit=Number(u.searchParams.get('limit')??100);
 return new Response(JSON.stringify(Array.from({length:Math.min(limit,Math.max(0,count-offset))},(_,i)=>({id:String(offset+i)}))),{headers:{'Content-Type':'application/json'}});
}
it('unavailable manifest permits strict full-fetch success only when every collection succeeds',async()=>{
 const c=new AbortController();e.fetch.mockImplementation(async(url:any,init:any)=>{expect(init.signal).toBe(c.signal);return successResponse(url,init)});
 const result=await refresh({signal:c.signal,strictComplete:true});expect(result.collections.encyclopedia_entities).toHaveLength(1500);
 expect(e.fetch.mock.calls.filter(([url])=>String(url).includes('stories_snapshot_manifest_v2'))).toHaveLength(1);
});
it('canceling one request leaves an independent strict call and later retry usable',async()=>{
 const a=new AbortController();const b=new AbortController();let ready!:()=>void;const entered=new Promise<void>(r=>ready=r);
 e.fetch.mockImplementation(async(url:any,init:any)=>{
  if(init.signal===a.signal){ready();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('retired','AbortError')),{once:true}))}
  return successResponse(url,init);
 });
 const retired=refresh({signal:a.signal,strictComplete:true}).then(()=> 'resolved',e=>e.name);await entered;
 const independent=await refresh({signal:b.signal,strictComplete:true});a.abort();expect(await retired).toBe('AbortError');
 expect(independent.collections.encyclopedia_entities).toHaveLength(1500);
 expect((await refresh({signal:new AbortController().signal,strictComplete:true})).collections.encyclopedia_entities).toHaveLength(1500);
});
it('in-flight story manifest is isolated per refresh, not reused by independent retry',async()=>{
 const a=new AbortController();const b=new AbortController();let ready!:()=>void;const entered=new Promise<void>(r=>ready=r);
 e.fetch.mockImplementation(async(url:any,init:any)=>{
  if(init.signal===a.signal&&String(url).includes('stories_snapshot_manifest_v2')){ready();return new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('retired','AbortError')),{once:true}))}
  return successResponse(url,init);
 });
 const first=refresh({signal:a.signal,strictComplete:true}).then(()=> 'resolved',e=>e.name);await entered;
 expect((await refresh({signal:b.signal,strictComplete:true})).collections.encyclopedia_entities).toHaveLength(1500);
 a.abort();expect(await first).toBe('AbortError');
 expect(e.fetch.mock.calls.filter(([url])=>String(url).includes('stories_snapshot_manifest_v2'))).toHaveLength(2);
});

it('no-cache generation fallback forwards cancellation and rejects instead of returning a candidate',async()=>{
 e.hasPrevious=false;const c=new AbortController();
 e.fetch.mockImplementation(async(_url:any,init:any)=>{expect(init.signal).toBe(c.signal);c.abort();throw new DOMException('retired','AbortError')});
 await expect(refresh({signal:c.signal,strictComplete:true})).rejects.toMatchObject({name:'AbortError'});
 expect(e.fetch).toHaveBeenCalled();
});

it('pending actual delta request retires without full-fetch fallback and a later delta retry succeeds',async()=>{
 e.updatedAt='2019-12-01T00:00:00Z';
 const retired=new AbortController();const retry=new AbortController();
 let ready!:()=>void;const entered=new Promise<void>(r=>ready=r);
 let pending=false;
 e.fetch.mockImplementation(async(url:any,init:any)=>{
  const request=new URL(String(url));
  if(request.pathname.endsWith('/encyclopedia_entities')){
   expect(init.method).not.toBe('HEAD');
   expect(request.searchParams.get('updated_at')).toBe('gt.'+e.updatedAt);
   if(init.signal===retired.signal){
    pending=true;ready();
    return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>{
     pending=false;reject(new DOMException('retired delta','AbortError'));
    },{once:true}));
   }
   expect(init.signal).toBe(retry.signal);
   return new Response(JSON.stringify([{id:'new-delta',updated_at:'2020-01-02T00:00:00Z'}]),{headers:{'Content-Type':'application/json'}});
  }
  expect(init.signal).toBe(retry.signal);
  return successResponse(url,init);
 });
 const first=refresh({signal:retired.signal,strictComplete:true}).then(()=> 'unexpected success',error=>error.name);
 await entered;expect(pending).toBe(true);expect(e.fetch).toHaveBeenCalledTimes(1);
 retired.abort();expect(await first).toBe('AbortError');expect(pending).toBe(false);
 expect(e.fetch).toHaveBeenCalledTimes(1); // No count/full-fetch fallback or later collection request.
 const result=await refresh({signal:retry.signal,strictComplete:true});
 expect(result.collections.encyclopedia_entities).toEqual([
  {id:'kept',updated_at:e.updatedAt},{id:'new-delta',updated_at:'2020-01-02T00:00:00Z'},
 ]);
 expect(e.fetch.mock.calls.filter(([,init])=>init.signal===retired.signal)).toHaveLength(1);
});
