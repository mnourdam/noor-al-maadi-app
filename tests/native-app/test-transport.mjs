import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const source=fs.readFileSync(new URL('./transport.js',import.meta.url),'utf8');
function fixture(breakage=null){
 const calls=[];let click;
 const window={location:{origin:'https://localhost',href:'https://localhost/'},fetch:async req=>{calls.push(req.url);return new Response('asset')},navigator:{},document:{addEventListener:(name,fn)=>{click=fn}},Capacitor:{nativePromise:(...a)=>{calls.push(a);return Promise.resolve('native')},nativeCallback:(...a)=>calls.push(a)},__IRTH_NATIVE_FIXTURE__:{origin:'https://irth-fixture.invalid',assets:['/offline-snapshot.json'],responses:[{method:'POST',path:'/rest/v1/rpc/get_content_manifest',query:'',body:'{}',status:200,json:[]}]}};
 if(breakage==='bridge')delete window.Capacitor;
 if(breakage==='config')delete window.__IRTH_NATIVE_FIXTURE__;
 if(breakage==='assignment')Object.defineProperty(window.Capacitor,'nativePromise',{value:window.Capacitor.nativePromise,writable:false});
 let installationError;try{vm.runInNewContext(source,{window,Request,Response,URL});}catch(error){if(!breakage)throw error;installationError=error;}
 return {window,calls,click,installationError};
}
test('actual packaged fetch and exact synthetic response only',async()=>{
 const {window:w,calls}=fixture();assert.equal(await (await w.fetch('https://localhost/offline-snapshot.json')).text(),'asset');
 assert.deepEqual(await (await w.fetch('https://irth-fixture.invalid/rest/v1/rpc/get_content_manifest',{method:'POST',body:'{}'})).json(),[]);
 for(const url of ['https://production.invalid/rest/v1/x','https://localhost/not-listed','https://irth-fixture.invalid/rest/v1/rpc/other','https://irth-fixture.invalid/rest/v1/rpc/get_content_manifest?x=1'])await assert.rejects(w.fetch(url));
 await assert.rejects(w.fetch('https://irth-fixture.invalid/rest/v1/rpc/get_content_manifest',{method:'POST',body:'{"unexpected":true}'}));
 assert.equal(calls.length,1);assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().matched,1);assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().unexpected,5);
});
test('external transports/intents reject; actual local plugin calls preserved',async()=>{
 const {window:w,calls,click}=fixture();assert.equal(await w.Capacitor.nativePromise('Preferences','get',{key:'synthetic'}),'native');
 for(const name of ['Browser','Share','PushNotifications'])assert.throws(()=>w.Capacitor.nativePromise(name,'open',{}));
 assert.throws(()=>w.Capacitor.nativePromise('Filesystem','downloadFile',{}));
 for(const name of ['XMLHttpRequest','WebSocket','EventSource','Worker'])assert.throws(()=>new w[name]('https://example.invalid'));
 assert.throws(()=>w.navigator.sendBeacon('https://example.invalid'));assert.throws(()=>w.open('https://example.invalid'));
 let prevented=false;assert.throws(()=>click({target:{closest:()=>({href:'https://example.invalid'})},preventDefault:()=>{prevented=true}}));assert.equal(prevented,true);assert.equal(calls.length,1);
 assert.equal(w.__IRTH_NATIVE_FIXTURE__,undefined);
});

test('actual entry admission fails when complete transport guards never install',async()=>{
 const {startActualApp}=await import('./loader.mjs');let imports=0;
 for(const scope of [{},{__IRTH_NATIVE_GUARDS_INSTALLED__:false}])await assert.rejects(startActualApp(()=>{imports++},scope));
 for(const broken of ['bridge','config','assignment']){const f=fixture(broken);assert.ok(f.installationError);await assert.rejects(startActualApp(()=>{imports++},f.window));}
 assert.equal(imports,0);
 const {window:w}=fixture();await startActualApp(()=>{imports++},w);assert.equal(imports,1);
 assert.throws(()=>Object.defineProperty(w,'__IRTH_NATIVE_GUARDS_INSTALLED__',{value:false}));
});

test('postboot bridge guard replacement is detectable',()=>{const {window:w}=fixture();assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().bridgeGuardsIntact,true);w.Capacitor.nativePromise=()=>{};assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().bridgeGuardsIntact,false);});

test('wholesale Capacitor replacement fails integrity',()=>{const {window:w}=fixture();w.Capacitor={...w.Capacitor};assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().bridgeGuardsIntact,false);});

test('registered probe refuses prior unexpected traffic before plugin import',async()=>{
 const {startActualApp}=await import('./loader.mjs');const {window:w}=fixture();await startActualApp(()=>{},w);
 assert.throws(()=>w.open('https://example.invalid'));
 await assert.rejects(w.__IRTH_NATIVE_REGISTERED_PLUGIN_PROBE__(),/fixture_bridge_guard_lost/);
 assert.equal(w.__IRTH_NATIVE_OBSERVATIONS__().unexpected,1);
});
