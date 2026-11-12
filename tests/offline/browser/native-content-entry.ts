// Debug acceptance entry only. Install the synthetic transport BEFORE target imports.
const realFetch=window.fetch.bind(window);
const harness={mode:'ok',unexpected:[] as string[],aborted:0,entered:0};
Object.assign(window,{nativeAcceptance:harness});
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(url.origin===location.origin)return realFetch(input,init); // Capacitor packaged assets only; INTERNET permission is absent.
 if(url.origin!=='https://native-content.invalid'){harness.unexpected.push(url.origin);throw Error('unexpected acceptance destination')}
 const signal=init?.signal??(input instanceof Request?input.signal:null);
 if(signal?.aborted)throw new DOMException('retired','AbortError');
 const table=url.pathname.split('/').at(-1);
 if(table==='get_content_manifest')return new Response('[]');
 if(table==='stories_snapshot_manifest_v2')return new Response(JSON.stringify({ok:true,stories:[],story_scenes:[],story_media:[],story_collections:[]}));
 const known=['encyclopedia_entities','campaigns_public','investigations_public','today_in_history_events','daily_facts','atlas_entities','content_registry'];
 if(!known.includes(table??'')){harness.unexpected.push(url.pathname);throw Error('unknown synthetic endpoint')}
 const count=table==='encyclopedia_entities'?1500:table==='campaigns_public'?1:0;
 if(init?.method==='HEAD')return new Response(null,{headers:{'content-range':`0-0/${count}`}});
 if(table==='encyclopedia_entities'&&harness.mode==='hang'){
  harness.entered++;
  return new Promise((_resolve,reject)=>{const abort=()=>{harness.aborted++;reject(new DOMException('retired','AbortError'))};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});
 }
 const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??100);
 const rows=table==='encyclopedia_entities'?Array.from({length:Math.max(0,Math.min(limit,count-offset))},(_,i)=>({id:String(i+offset),title:'updated',enabled:true,body:'synthetic '.repeat(1024)})):table==='campaigns_public'?[{id:'campaign',slug:'campaign',status:'published',data:{chapters:[]}}]:[];
 return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}});
};
void (async()=>{
 const {App}=await import('@capacitor/app');
 const lifecycle:boolean[]=[];
 await App.addListener('appStateChange',event=>lifecycle.push(event.isActive));
 Object.assign(window,{nativeApp:App,nativeLifecycle:lifecycle});
 await import('./content-runtime-fixture');
})();
