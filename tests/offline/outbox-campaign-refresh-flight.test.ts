import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const e=vi.hoisted(()=>({fetch:vi.fn(),row:null as any,info:null as any,merge:vi.fn()}));
vi.mock('@/integrations/supabase/client',async()=>{const {createClient}=await import('@supabase/supabase-js');return {supabase:createClient('https://synthetic.invalid','synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(...args:any[])=>e.fetch(...args)}})}});
vi.mock('@/lib/local-first-store',()=>({ensureLocalSnapshotLoaded:async()=>{},localCampaignByIdOrSlug:()=>e.row,localSnapshotInfo:()=>e.info,mergeLocalCampaignRows:(rows:any[])=>{e.merge(rows);e.row=rows[0];return true},localPublishedCampaigns:()=>[e.row],localCampaignDividerRows:()=>[],invalidateLocalCampaign:()=>{}}));
vi.mock('@/lib/campaignKeyArtOverlay',()=>({getCampaignKeyArtOverlay:async()=>({}),applyKeyArtOverlay:(c:any)=>c}));
const row=(image:string)=>({id:'campaign',slug:'campaign',data:{id:'campaign',slug:'campaign',status:'published',intro_story_id:'intro',chapters:[{id:'chapter',imageUrl:image}]}});
const response=(data:any)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const manifest=(url:any)=>String(url).includes('/rpc/get_content_manifest');
const flush=async()=>{await vi.dynamicImportSettled();await vi.advanceTimersByTimeAsync(0)};
let online:PropertyDescriptor|undefined;
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();vi.useFakeTimers();online=Object.getOwnPropertyDescriptor(navigator,'onLine');Object.defineProperty(navigator,'onLine',{configurable:true,value:true});e.row=row('cached');e.info=null;e.fetch.mockImplementation(async(url:any)=>response(manifest(url)?[]:[row('fresh')]));});
afterEach(()=>{vi.useRealTimers();if(online)Object.defineProperty(navigator,'onLine',online);else delete (navigator as any).onLine;});
it('bounds a hung real manifest and returns valid cached chapter with healthy overlay',async()=>{
 let signal!:AbortSignal;e.fetch.mockImplementation((_url:any,init:any)=>{signal=init.signal;return new Promise(()=>{})});
 const {fetchCampaignByIdOrSlug,refreshCampaignRows}=await import('@/lib/supabaseCampaigns');
 const read=fetchCampaignByIdOrSlug('campaign');await flush();expect(e.fetch).toHaveBeenCalledTimes(1);expect(signal.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(10_000);expect((await read)?.chapters[0].imageUrl).toBe('cached');expect(signal.aborted).toBe(true);expect(e.merge).not.toHaveBeenCalled();
 e.fetch.mockImplementation(async(url:any)=>response(manifest(url)?[]:[row('retry')]));expect(await refreshCampaignRows()).toBe(true);expect(e.row.data.chapters[0].imageUrl).toBe('retry');
});
it('joins one flight, forwards the same owned signal and retains successful session memo',async()=>{
 const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');const a=refreshCampaignRows(),b=refreshCampaignRows();expect(a).toBe(b);expect(await a).toBe(true);expect(e.fetch).toHaveBeenCalledTimes(2);
 const signals=e.fetch.mock.calls.map(([,init])=>init.signal);expect(signals[0]).toBeInstanceOf(AbortSignal);expect(signals[0]).toBe(signals[1]);expect(signals[0].aborted).toBe(false);expect(refreshCampaignRows()).toBe(a);expect(vi.getTimerCount()).toBe(0);
});
it('retires forced A before abort reentry and ignores late A rows after successful B',async()=>{
 let finish!:(v:Response)=>void;let old!:AbortSignal;let joined:Promise<boolean>|undefined;let queries=0;
 const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');
 e.fetch.mockImplementation(async(url:any,init:any)=>{if(manifest(url))return response([]);if(++queries===1){old=init.signal;old.addEventListener('abort',()=>{joined=refreshCampaignRows()});return new Promise<Response>(r=>finish=r)}return response([row('B')]);});
 const a=refreshCampaignRows();await flush();const b=refreshCampaignRows(true);expect(joined).toBe(b);expect(old.aborted).toBe(true);expect(await a).toBe(false);expect(await b).toBe(true);finish(response([row('late-A')]));await flush();expect(e.row.data.chapters[0].imageUrl).toBe('B');expect(e.merge).toHaveBeenCalledTimes(1);expect(refreshCampaignRows()).toBe(b);
});
it('times out ignored-abort PostgREST and fences late rows while successor remains pending',async()=>{
 const finishes:Array<(v:Response)=>void>=[];const signals:AbortSignal[]=[];
 e.fetch.mockImplementation(async(url:any,init:any)=>{if(manifest(url))return response([]);signals.push(init.signal);return new Promise<Response>(r=>finishes.push(r))});
 const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');const a=refreshCampaignRows();await flush();await vi.advanceTimersByTimeAsync(10_000);expect(await a).toBe(false);expect(signals[0].aborted).toBe(true);
 const b=refreshCampaignRows();await flush();finishes[0](response([row('late')]));await flush();expect(e.merge).not.toHaveBeenCalled();expect(refreshCampaignRows()).toBe(b);finishes[1](response([row('B')]));expect(await b).toBe(true);expect(e.row.data.chapters[0].imageUrl).toBe('B');
});
it('late rejected predecessor cannot clear pending successor; repeated force only admits newest',async()=>{
 const finishes:Array<(v:Response)=>void>=[];let rejectOld!:(e:Error)=>void;let n=0;
 e.fetch.mockImplementation(async(url:any)=>{if(manifest(url))return response([]);if(++n===1)return new Promise<Response>((_r,j)=>rejectOld=j);return new Promise<Response>(r=>finishes.push(r))});
 const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');const a=refreshCampaignRows();await flush();const b=refreshCampaignRows(true);await flush();const c=refreshCampaignRows(true);await flush();rejectOld(new Error('synthetic'));finishes[0](response([row('B')]));await flush();expect(await a).toBe(false);expect(await b).toBe(false);expect(refreshCampaignRows()).toBe(c);expect(e.merge).not.toHaveBeenCalled();finishes[1](response([row('C')]));expect(await c).toBe(true);expect(e.row.data.chapters[0].imageUrl).toBe('C');
});
it('preserves exact manifest skip and offline cached behavior',async()=>{
 e.info={content_counts:{admin_campaigns:1},generated_at:'2026-01-02'};e.fetch.mockResolvedValue(response([{collection:'admin_campaigns',total_count:1,last_updated:'2026-01-01'}]));const {refreshCampaignRows,fetchCampaignByIdOrSlug}=await import('@/lib/supabaseCampaigns');expect(await refreshCampaignRows()).toBe(true);expect(e.fetch).toHaveBeenCalledTimes(1);expect(e.merge).not.toHaveBeenCalled();Object.defineProperty(navigator,'onLine',{value:false,configurable:true});expect((await fetchCampaignByIdOrSlug('campaign'))?.chapters[0].imageUrl).toBe('cached');expect(e.fetch).toHaveBeenCalledTimes(1);
});
it('preserves empty-row failure and permits a later successful retry',async()=>{
 e.fetch.mockResolvedValue(response([]));const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');expect(await refreshCampaignRows()).toBe(false);expect(e.merge).not.toHaveBeenCalled();e.fetch.mockImplementation(async(url:any)=>response(manifest(url)?[]:[row('retry')]));expect(await refreshCampaignRows()).toBe(true);expect(e.merge).toHaveBeenCalledTimes(1);
});
it('late timed-out manifest cannot start a row request or contaminate healthy retry',async()=>{
 let finish!:(v:Response)=>void;e.fetch.mockImplementationOnce(()=>new Promise<Response>(r=>finish=r));const {refreshCampaignRows}=await import('@/lib/supabaseCampaigns');const a=refreshCampaignRows();await flush();await vi.advanceTimersByTimeAsync(10_000);expect(await a).toBe(false);expect(await refreshCampaignRows()).toBe(true);const count=e.fetch.mock.calls.length;finish(response([]));await flush();expect(e.fetch).toHaveBeenCalledTimes(count);expect(e.merge).toHaveBeenCalledTimes(1);
});
