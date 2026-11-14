import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const cwd=fileURLToPath(new URL('.',import.meta.url));
const source=readFileSync(new URL('./client.mjs',import.meta.url),'utf8');
const uid='11111111-1111-4111-8111-111111111111',id='33333333-3333-4333-8333-333333333333',mid='22222222-2222-4222-8222-222222222222';
const bytes=await sharp({create:{width:1,height:1,channels:3,background:'#123456'}}).jpeg().toBuffer();
const descriptor={version:1,id,message_id:mid,key:`${uid}/${id}`,mime:'image/jpeg',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
function run(code,mode='valid'){
 const prelude=`import assert from 'node:assert/strict';
 let calls=0;globalThis.fetch=async(url,options)=>{
 const u=new URL(String(url));const headers=new Headers(options.headers);assert.equal(u.origin,'http://127.0.0.1:55541');assert.equal(headers.get('authorization'),'Bearer synthetic-actor');assert.equal(options.redirect,'error');
 calls++;if(u.pathname==='/rest/v1/rpc/fixture_canonical_descriptor'){assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{mid:${JSON.stringify(mid)}});return Response.json(${mode==='valid'?JSON.stringify(descriptor):'null'});}
 if(u.pathname==='/auth/v1/user'){assert.equal(options.method,'GET');return Response.json({id:${JSON.stringify(uid)},aud:'authenticated'});}
 assert.equal(u.pathname,${JSON.stringify('/storage/v1/object/feedback-images-canonical/'+descriptor.key)});assert.equal(options.method,'GET');
 ${mode==='transport'?"throw new TypeError('synthetic transport');":mode==='retired'?"return Response.json({code:'AccessDenied'},{status:403});":`return new Response(Buffer.from('${bytes.toString('base64')}','base64'),{headers:{'Content-Type':'image/jpeg'}});`}
 };
 process.on('beforeExit',()=>{if(!process.exitCode)assert.equal(calls,${mode==='valid'?4:3});});`;
 const p={api:'http://127.0.0.1:55541',anon:'synthetic-anon',token:'synthetic-actor',uid,mid,expect:mode==='valid'?'valid':'retired',expected:descriptor.sha256,...(mode==='valid'?{}:{stale:descriptor})};
 return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(prelude),'--input-type=module','-e',code],{cwd,input:JSON.stringify(p),encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'},timeout:10000,maxBuffer:8192});
}
test('actual SDK and full client use exact actor GET object route and verify worker bytes',()=>{const r=run(source);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).result,'canonical_verified');});
test('old authenticated-route guard rejects actual SDK: concrete counterfactual',()=>{const old=source.replace("u.pathname==='/storage/v1/object/feedback-images-canonical/'","u.pathname==='/storage/v1/object/authenticated/feedback-images-canonical/'");assert.notEqual(old,source);const r=run(old);assert.equal(r.status,1);assert.equal(r.stdout,'');});
test('recognized Storage denial is required: transport error is not retirement proof',()=>{const denied=run(source,'retired');assert.equal(denied.status,0,denied.stderr);assert.equal(JSON.parse(denied.stdout).result,'retired_denied');const failed=run(source,'transport');assert.equal(failed.status,1);assert.equal(failed.stdout,'');});
