import {it,expect,vi,beforeEach} from 'vitest';
const e=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@/integrations/supabase/client',async()=>{const {createClient}=await import('@supabase/supabase-js');return {supabase:createClient('http://127.0.0.1:1','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(...args:any[])=>e.fetch(...args)}})}});
beforeEach(()=>{vi.resetAllMocks();vi.resetModules()});
it('independent real manifest RPC is not poisoned by cancellation of another scope',async()=>{
 const {fetchContentManifest}=await import('@/lib/offline-manifest');const a=new AbortController();const b=new AbortController();let ready!:()=>void;const entered=new Promise<void>(r=>ready=r);
 e.fetch.mockImplementation(async(_url:any,init:any)=>{if(init.signal===a.signal){ready();return new Promise((_r,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('retired','AbortError')),{once:true}))}expect(init.signal).toBe(b.signal);return new Response('[]')});
 const first=fetchContentManifest(a.signal).then(()=> 'resolved',e=>e.name);await entered;
 expect(await fetchContentManifest(b.signal)).toEqual([]);a.abort();expect(await first).toBe('AbortError');expect(e.fetch).toHaveBeenCalledTimes(2);
});
it('pre-aborted manifest rejects without issuing RPC',async()=>{const {fetchContentManifest}=await import('@/lib/offline-manifest');const c=new AbortController();c.abort();await expect(fetchContentManifest(c.signal)).rejects.toMatchObject({name:'AbortError'});expect(e.fetch).not.toHaveBeenCalled()});
