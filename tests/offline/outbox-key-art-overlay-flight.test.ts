import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const key='irth.campaign-key-art.overlay.v1';
const art=(path:string|null)=>({id:'synthetic',slug:'synthetic-slug',key_art_path:path,key_art_square_path:null,key_art_credit:null});
function deferred(){let resolve!:(v:Response)=>void;const promise=new Promise<Response>(r=>resolve=r);return {promise,resolve};}
function response(path:string|null){return new Response(JSON.stringify([art(path)]),{status:200,headers:{'content-type':'application/json'}});}
const requests:{url:string;signal:AbortSignal|null|undefined;gate:ReturnType<typeof deferred>}[]=[];
beforeEach(()=>{
 vi.resetModules();localStorage.clear();requests.length=0;
 vi.stubEnv('VITE_SUPABASE_URL','https://synthetic.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','synthetic-not-a-secret');vi.stubGlobal('navigator',{onLine:true});
 vi.stubGlobal('fetch',vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);if(!url.startsWith('https://synthetic.invalid/rest/v1/campaigns_public?'))throw Error('unexpected transport');
  const gate=deferred();requests.push({url,signal:init?.signal,gate});return gate.promise; // Deliberately ignores abort.
 }));
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()});
async function requestCount(n:number){await vi.waitFor(()=>expect(requests).toHaveLength(n));}
it('bounds hung actual SDK request, falls back without fresh TTL, retries and ignores late success',async()=>{
 localStorage.setItem(key,JSON.stringify({at:0,map:{synthetic:art('persisted.webp')}}));
 const m=await import('@/lib/campaignKeyArtOverlay');vi.useFakeTimers();const first=m.getCampaignKeyArtOverlay();const shared=m.getCampaignKeyArtOverlay();await requestCount(1);
 expect(requests[0].signal).toBeInstanceOf(AbortSignal);
 await vi.advanceTimersByTimeAsync(m.KEY_ART_OVERLAY_TIMEOUT_MS);
 expect((await first).synthetic.key_art_path).toBe('persisted.webp');expect(await shared).toEqual(await first);expect(requests[0].signal?.aborted).toBe(true);
 const retry=m.getCampaignKeyArtOverlay();await requestCount(2);requests[1].gate.resolve(response('new.webp'));expect((await retry).synthetic.key_art_path).toBe('new.webp');
 requests[0].gate.resolve(response('old.webp'));await vi.advanceTimersByTimeAsync(0);
 expect(m.peekCampaignKeyArtOverlay().synthetic.key_art_path).toBe('new.webp');expect(JSON.parse(localStorage.getItem(key)!).map.synthetic.key_art_path).toBe('new.webp');
});
it('invalidation resolves old callers empty and admits successor; old success cannot persist or clear successor',async()=>{
 const m=await import('@/lib/campaignKeyArtOverlay');const old=m.getCampaignKeyArtOverlay();await requestCount(1);
 m.invalidateCampaignKeyArtOverlay();expect(await old).toEqual({});expect(requests[0].signal?.aborted).toBe(true);
 const fresh=m.getCampaignKeyArtOverlay();await requestCount(2);expect(requests[1].signal).not.toBe(requests[0].signal);requests[0].gate.resolve(response('old.webp'));await new Promise(r=>setTimeout(r,0));
 expect(m.peekCampaignKeyArtOverlay()).toEqual({});expect(localStorage.getItem(key)).toBeNull();expect(requests[1].signal?.aborted).toBe(false);
 const join=m.getCampaignKeyArtOverlay();await Promise.resolve();expect(requests).toHaveLength(2);
 requests[1].gate.resolve(response('new.webp'));expect((await fresh).synthetic.key_art_path).toBe('new.webp');expect(await join).toEqual(await fresh);
});
it('repeated invalidation ABA and synchronous abort-listener admission keep successor owned',async()=>{
 const m=await import('@/lib/campaignKeyArtOverlay');const a=m.getCampaignKeyArtOverlay();await requestCount(1);
 let b:ReturnType<typeof m.getCampaignKeyArtOverlay>|undefined;
 requests[0].signal!.addEventListener('abort',()=>{b=m.getCampaignKeyArtOverlay();},{once:true});
 m.invalidateCampaignKeyArtOverlay();expect(await a).toEqual({});await requestCount(2);
 m.invalidateCampaignKeyArtOverlay();expect(await b).toEqual({});const a2=m.getCampaignKeyArtOverlay();await requestCount(3);
 requests[1].gate.resolve(response('B.webp'));requests[0].gate.resolve(response('A.webp'));await new Promise(r=>setTimeout(r,0));
 expect(localStorage.getItem(key)).toBeNull();const join=m.getCampaignKeyArtOverlay();expect(requests).toHaveLength(3);
 requests[2].gate.resolve(response('A-new.webp'));expect((await a2).synthetic.key_art_path).toBe('A-new.webp');expect(await join).toEqual(await a2);
});
it('success keeps ten-minute TTL, expired errors use cache without renewing freshness',async()=>{
 // One clock owns both cachedAt and the exact TTL boundary, including under load.
 vi.useFakeTimers();
 const m=await import('@/lib/campaignKeyArtOverlay');const first=m.getCampaignKeyArtOverlay();await requestCount(1);requests[0].gate.resolve(response('warm.webp'));await first;
 await vi.advanceTimersByTimeAsync(599999);expect((await m.getCampaignKeyArtOverlay()).synthetic.key_art_path).toBe('warm.webp');expect(requests).toHaveLength(1);expect(requests[0].signal?.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(1);const refresh=m.getCampaignKeyArtOverlay();await requestCount(2);
 requests[1].gate.resolve(new Response(JSON.stringify({message:'synthetic-error'}),{status:400,headers:{'content-type':'application/json'}}));expect((await refresh).synthetic.key_art_path).toBe('warm.webp');
 const retry=m.getCampaignKeyArtOverlay();await requestCount(3);requests[2].gate.resolve(response('fresh.webp'));await retry;
});
it('offline persisted fallback performs no request; explicit invalidation removes it',async()=>{
 localStorage.setItem(key,JSON.stringify({at:0,map:{synthetic:art('persisted.webp')}}));vi.stubGlobal('navigator',{onLine:false});const m=await import('@/lib/campaignKeyArtOverlay');
 expect((await m.getCampaignKeyArtOverlay()).synthetic.key_art_path).toBe('persisted.webp');m.invalidateCampaignKeyArtOverlay();expect(await m.getCampaignKeyArtOverlay()).toEqual({});expect(fetch).not.toHaveBeenCalled();
});
it('preserves null-row omission, id/slug aliasing and nonnull row precedence without inventing removal authority',async()=>{
 const m=await import('@/lib/campaignKeyArtOverlay');const first=m.getCampaignKeyArtOverlay();await requestCount(1);requests[0].gate.resolve(response(null));expect(await first).toEqual({});
 const nonnull={id:'synthetic',key_art_path:'row.webp'};expect(m.applyKeyArtOverlay(nonnull,{synthetic:art('overlay.webp')})).toBe(nonnull);
 expect(m.applyKeyArtOverlay({id:'synthetic',key_art_path:null},{synthetic:art('overlay.webp')}).key_art_path).toBe('overlay.webp');
 m.invalidateCampaignKeyArtOverlay();const fresh=m.getCampaignKeyArtOverlay();await requestCount(2);requests[1].gate.resolve(response('alias.webp'));const map=await fresh;expect(map.synthetic).toEqual(map['synthetic-slug']);
});
