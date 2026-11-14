// Real actor SDK / inactive app adapter. No service credential, UI or pixel claim.
import {createClient} from '@supabase/supabase-js';
import {downloadCanonical,parseCanonicalImage} from '../../../src/lib/feedback/canonical-image-contract.ts';
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>16384)throw Error('input limit');}
const p=JSON.parse(input);const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;if(p.api!=='http://127.0.0.1:55541' || !uuid.test(p.mid) || !uuid.test(p.uid))throw Error('scope');
const allowed=new Set(['/rest/v1/rpc/fixture_canonical_descriptor','/auth/v1/user']);
let requests=0,storageDenial=false,allowedKey=null;
const guardedFetch=async(url,options={})=>{
 const u=new URL(String(url));if(u.origin!==p.api || u.username || u.password || u.search || u.hash || !(allowed.has(u.pathname)||(allowedKey!==null && u.pathname==='/storage/v1/object/feedback-images-canonical/'+allowedKey)))throw Error('route');
 const expectedMethod=u.pathname==='/rest/v1/rpc/fixture_canonical_descriptor'?'POST':'GET';if((options.method||'GET').toUpperCase()!==expectedMethod)throw Error('method');
 if(++requests>4)throw Error('request limit');
 const response=await fetch(u,{...options,redirect:'error',signal:AbortSignal.timeout(5000)});const reader=response.body?.getReader();let length=0;const chunks=[];
 if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2097152)throw Error('body limit');chunks.push(value);}}finally{await reader.cancel();}
 if(u.pathname.startsWith('/storage/') && [400,401,403,404].includes(response.status)){try{const e=JSON.parse(Buffer.concat(chunks).toString());storageDenial=['AccessDenied','Unauthorized','NoSuchKey'].includes(e.code) || (e.error==='not_found' && String(e.statusCode)==='404' && e.message==='Object not found');}catch{}}
 return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});
};
try{
 const sdk=createClient(p.api,p.anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${p.token}`},fetch:guardedFetch}});
 const {data,error}=await sdk.rpc('fixture_canonical_descriptor',{mid:p.mid});if(error)throw Error('descriptor RPC');
 if(p.expect==='denied'){if(data!==null)throw Error('descriptor exposed');process.stdout.write(JSON.stringify({result:'descriptor_denied'}));}
 else {
  const descriptor=p.stale || data;if(!parseCanonicalImage(descriptor) || descriptor.message_id!==p.mid)throw Error('descriptor invalid');allowedKey=descriptor.key;
  const client={scope:()=>`user:${p.uid}:1`,user:()=>p.uid,session:async()=>{const r=await sdk.auth.getUser(p.token);return {data:{session:r.data.user?{user:{id:r.data.user.id}}:null},error:r.error};},download:(bucket,key)=>sdk.storage.from(bucket).download(key)};
  if(p.expect==='retired'){
   if(data!==null)throw Error('retired descriptor exposed');let rejected=false;try{await downloadCanonical(descriptor,client);}catch{rejected=true;}if(!rejected || !storageDenial)throw Error('retired denial unverified');process.stdout.write(JSON.stringify({result:'retired_denied'}));
  }else{const blob=await downloadCanonical(descriptor,client);if(descriptor.sha256!==p.expected || blob.size!==descriptor.bytes)throw Error('expected worker bytes');process.stdout.write(JSON.stringify({result:'canonical_verified',descriptor}));}
 }
}catch{process.stderr.write('canonical client failure\n');process.exitCode=1;}
