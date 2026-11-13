import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OfflineSnapshot } from '@/lib/offline-storage';
const e = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(async () => {}) }));
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://synthetic.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args: any[]) => e.fetch(...args) },
  }) };
});
vi.mock('@/lib/offline-storage', () => ({
  MIN_PUBLIC_ENCYCLOPEDIA_ROWS: 1500, saveSnapshot: e.save,
  loadSnapshot: async () => { throw Error('unexpected snapshot load'); },
  mergeSnapshots: () => { throw Error('unexpected snapshot merge'); },
}));
vi.mock('@/lib/offline-snapshot', () => ({ loadBundledSnapshot: async () => { throw Error('unexpected bundled load'); } }));
const key = 'irth.campaign-key-art.overlay.v1';
const row = (image: string) => ({ id: 'campaign', slug: 'campaign-slug', status: 'published', data: {
  id: 'campaign', slug: 'campaign-slug', status: 'published', intro_story_id: null,
  chapters: [{ id: 'chapter', imageUrl: image }],
} });
const art = (path: string) => ({ id: 'campaign', slug: 'campaign', key_art_path: path,
  key_art_square_path: null, key_art_credit: null });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const flush = async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(0); };
let online: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers();
  online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => {
  vi.useRealTimers();
  if (online) Object.defineProperty(navigator, 'onLine', online); else delete (navigator as any).onLine;
});
async function setup() {
 const store=await import('@/lib/local-first-store');
 store.applyLocalSnapshot({snapshot_version:5,schema_version:5,generated_at:'2020-01-01T00:00:00Z',source:'bundled',content_counts:{admin_campaigns:1},collections:{admin_campaigns:[row('cached-image')]}} as OfflineSnapshot);
 const reader=await import('@/lib/supabaseCampaigns');return {store,reader};
}
const failed=()=>new Response(JSON.stringify({message:'synthetic failure'}),{status:400,headers:{'Content-Type':'application/json'}});
const held: {field:string;signal:AbortSignal;resolve:(r:Response)=>void}[]=[];
async function fixture(){
 const env=await setup();held.length=0;
 e.fetch.mockImplementation((input:RequestInfo|URL,init?:RequestInit)=>{
  const u=new URL(String(input));expect(u.origin).toBe('https://synthetic.invalid');
  if(u.pathname.endsWith('/rpc/get_content_manifest'))return Promise.resolve(response([]));
  expect(u.pathname).toBe('/rest/v1/campaigns_public');
  const field=u.searchParams.has('id')?'id':u.searchParams.has('slug')?'slug':null;
  if(field)return new Promise<Response>(resolve=>held.push({field,signal:init?.signal as AbortSignal,resolve}));
  return Promise.resolve(response([row('cached-image')]));
 });return env;
}
const error=(status:number,code='synthetic')=>new Response(JSON.stringify({message:'synthetic error',code}),{status,headers:{'Content-Type':'application/json'}});
it('deadline returns current cached published metadata, ignores late ID and next call gets fresh intro',async()=>{
 const {reader,store}=await fixture();let settled=false;const pending=reader.fetchCampaignByIdOrSlug('campaign').then(value=>{settled=true;return value});await flush();expect(held).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(7999);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);const cached=await pending;expect(cached?.chapters[0].imageUrl).toBe('cached-image');expect(cached?.intro_story_id).toBeNull();expect(held[0].signal.aborted).toBe(true);
 held[0].resolve(response(null));await flush();expect(held).toHaveLength(1);expect(store.localCampaignByIdOrSlug('campaign')?.data.chapters[0].imageUrl).toBe('cached-image');
 const fresh=reader.fetchCampaignByIdOrSlug('campaign');await flush();expect(held).toHaveLength(2);
 held[1].resolve(response({...row('fresh-image'),data:{...row('fresh-image').data,intro_story_id:'new-intro'}}));
 expect((await fresh)?.intro_story_id).toBe('new-intro');expect(held[1].signal.aborted).toBe(false);
});
it.each([null,'22P02'])('ID absence/invalid UUID %s proceeds slug within same total deadline',async(code)=>{
 const {reader}=await fixture();let settled=false;const pending=reader.fetchCampaignByIdOrSlug('campaign').then(value=>{settled=true;return value});await flush();await vi.advanceTimersByTimeAsync(6000);
 held[0].resolve(code?error(400,code):response(null));await flush();expect(held.map(x=>x.field)).toEqual(['id','slug']);expect(held[1].signal).toBe(held[0].signal);
 await vi.advanceTimersByTimeAsync(1999);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect((await pending)?.chapters[0].imageUrl).toBe('cached-image');expect(held[1].signal.aborted).toBe(true);
 held[1].resolve(response({...row('late-image'),data:{...row('late-image').data,intro_story_id:'late-intro'}}));await flush();expect(held).toHaveLength(2);
});
it('invalid UUID lookup can freshly resolve slug and explicit null intro remains null',async()=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();held[0].resolve(error(400,'22P02'));await flush();held[1].resolve(response(row('fresh-image')));
 const value=await pending;expect(value?.intro_story_id).toBeNull();expect(value?.chapters[0].imageUrl).toBe('fresh-image');
});
it.each([400,401,403])('denied/schema status %s never falls back or dispatches slug',async(status)=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();held[0].resolve(error(status));expect(await pending).toBeNull();expect(held).toHaveLength(1);
});
it.each([500])('availability status %s revalidates cached row and uses warm artwork only',async(status)=>{
 const {reader}=await fixture();localStorage.setItem(key,JSON.stringify({at:0,map:{campaign:art('warm-art')}}));
 const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();const count=e.fetch.mock.calls.length;held[0].resolve(error(status));const value=await pending;
 expect(value?.chapters[0].imageUrl).toBe('cached-image');expect(value?.key_art_path).toBe('warm-art');expect(e.fetch).toHaveBeenCalledTimes(count);
});
it.each(['absent','unpublished','divider'])('authoritative %s does not revive cached published row',async(kind)=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();
 const value=kind==='absent'?null:kind==='unpublished'?{...row('old'),data:{...row('old').data,status:'draft'}}:{...row('old'),data:{...row('old').data,kind:'divider'}};
 held[0].resolve(response(value));await flush();if(kind==='absent'){expect(held).toHaveLength(2);held[1].resolve(response(null));}
 expect(await pending).toBeNull();
});
it('wrapper invalidation retires alias response and fallback even if local row repopulates',async()=>{
 const {reader,store}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();reader.invalidatePublishedCampaign('campaign-slug');store.mergeLocalCampaignRows([row('repopulated-image')]);
 held[0].resolve(response({...row('stale-network'),data:{...row('stale-network').data,intro_story_id:'stale-intro'}}));expect(await pending).toBeNull();expect(held).toHaveLength(1);
});
it('fallback re-reads latest cache and rejects current low-level removal',async()=>{
 const {reader,store}=await fixture();const first=reader.fetchCampaignByIdOrSlug('campaign');await flush();store.mergeLocalCampaignRows([row('updated-image')]);held[0].resolve(error(500));expect((await first)?.chapters[0].imageUrl).toBe('updated-image');
 const second=reader.fetchCampaignByIdOrSlug('campaign');await flush();store.invalidateLocalCampaign('campaign');held[1].resolve(error(500));expect(await second).toBeNull();
});
it('true local miss has no fallback; offline and draft retain separate policies',async()=>{
 const {reader}=await fixture();const miss=reader.fetchCampaignByIdOrSlug('unknown');await flush();held[0].resolve(error(500));expect(await miss).toBeNull();
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});const count=e.fetch.mock.calls.length;
 expect((await reader.fetchCampaignByIdOrSlug('campaign'))?.chapters[0].imageUrl).toBe('cached-image');expect(e.fetch).toHaveBeenCalledTimes(count);
 e.fetch.mockImplementation(async(input:RequestInfo|URL)=>{expect(new URL(String(input)).pathname).toBe('/rest/v1/rpc/admin_get_campaign_full');return error(403);});
 expect(await reader.fetchCampaignByIdOrSlug('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',{mode:'draft'})).toBeNull();
});

it.each(['503','network'])('actual SDK retries %s within owned deadline without issuing overlay or slug',async(kind)=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();
 e.fetch.mockImplementation(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input));expect(url.origin).toBe('https://synthetic.invalid');expect(url.searchParams.has('id')).toBe(true);
  if(kind==='network')throw new TypeError('synthetic offline transport');return error(503);
 });
 held[0].resolve(error(503));await flush();await vi.advanceTimersByTimeAsync(7500);await flush();
 expect((await pending)?.chapters[0].imageUrl).toBe('cached-image');expect(held).toHaveLength(1);
});

it('malformed JSON keeps its SDK nonzero status and does not authorize fallback',async()=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();
 held[0].resolve(new Response('not-json',{status:200,headers:{'Content-Type':'application/json'}}));
 expect(await pending).toBeNull();expect(held).toHaveLength(1);
});

it('SDK status0 response body-read failure allows current fallback',async()=>{
 const {reader}=await fixture();const pending=reader.fetchCampaignByIdOrSlug('campaign');await flush();
 const broken=response(row('unused'));vi.spyOn(broken,'text').mockRejectedValue(new TypeError('synthetic body-read failure'));
 held[0].resolve(broken);expect((await pending)?.chapters[0].imageUrl).toBe('cached-image');expect(held).toHaveLength(1);
});
