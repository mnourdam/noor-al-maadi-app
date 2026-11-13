/* TEST ONLY. Executes before the actual Android entry; no root/provider replacement. */
(function install(global) {
 'use strict';
 const cfg=global.__IRTH_NATIVE_FIXTURE__;
 if(!cfg || cfg.origin!=='https://irth-fixture.invalid' || !Array.isArray(cfg.assets) || !Array.isArray(cfg.responses))throw Error('fixture_config');
 const stats={unexpected:0,matched:0,nativeBlocked:0};
 const reject=()=>{stats.unexpected++;throw Error('fixture_unexpected_transport');};
 const originalFetch=global.fetch.bind(global),localOrigin=global.location.origin;
 const assets=new Set(cfg.assets);
 const requests=new Map(cfg.responses.map(r=>[JSON.stringify([r.method,r.path,r.query,r.body]),r]));
 global.fetch=async function(input,init={}){
  const req=new Request(input,init),url=new URL(req.url,global.location.href);
  if(url.origin===localOrigin && req.method==='GET' && !url.search && assets.has(url.pathname))return originalFetch(req);
  if(url.origin!==cfg.origin || url.username || url.password || url.hash)return reject();
  const body=await req.text(),key=JSON.stringify([req.method,url.pathname,url.search,body]);
  const response=requests.get(key);if(!response)return reject();stats.matched++;
  return new Response(JSON.stringify(response.json),{status:response.status,headers:{'content-type':'application/json',...(response.headers||{})}});
 };
 // Current full app SDK uses fetch. No permissive fallback for unreviewed transports.
 global.XMLHttpRequest=class {constructor(){reject();}};
 global.WebSocket=class {constructor(){reject();}};
 global.EventSource=class {constructor(){reject();}};
 global.Worker=class {constructor(){reject();}};
 if(global.navigator){Object.defineProperty(global.navigator,'sendBeacon',{value:()=>reject(),configurable:false});}
 global.open=()=>reject();
 global.document.addEventListener('click',event=>{
  const link=event.target?.closest?.('a[href]');if(!link)return;
  const url=new URL(link.href,global.location.href);
  if(url.origin!==localOrigin){event.preventDefault();reject();}
 },true);
 const cap=global.Capacitor;
 if(!cap || typeof cap.nativePromise!=='function')throw Error('fixture_native_bridge_missing');
 const denied=new Set(['Browser','Share','PushNotifications']);
 const installed={};
 for(const name of ['nativePromise','nativeCallback']){
  const original=cap[name];if(typeof original!=='function')throw Error('fixture_native_bridge_missing');
  cap[name]=function(plugin,method,options,...rest){
   if(denied.has(plugin) || (plugin==='App' && method==='openUrl') || (plugin==='Filesystem' && method==='downloadFile')){
    stats.nativeBlocked++;return reject();
   }
   return original.call(cap,plugin,method,options,...rest);
  };
  installed[name]=cap[name];
 }
 // Read-only diagnostics only. Fixture responses cannot be relaxed after boot.
 Object.defineProperty(global,'__IRTH_NATIVE_OBSERVATIONS__',{value:()=>({...stats,bridgeGuardsIntact:global.Capacitor===cap && cap.nativePromise===installed.nativePromise && cap.nativeCallback===installed.nativeCallback}),writable:false});
 delete global.__IRTH_NATIVE_FIXTURE__;
 Object.defineProperty(global,'__IRTH_NATIVE_GUARDS_INSTALLED__',{value:true,writable:false,configurable:false});
})(window);
