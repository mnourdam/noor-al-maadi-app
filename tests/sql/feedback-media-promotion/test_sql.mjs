// PostgreSQL model guard only, not native Auth/Storage acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$SELECT nullif(current_setting('fixture.uid',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE SQL AS $$SELECT current_setting('fixture.role',true)$$;
 CREATE FUNCTION public.is_feedback_staff(uuid) RETURNS boolean LANGUAGE SQL AS $$SELECT false$$;
 CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;CREATE POLICY fixture_decode_insert ON storage.objects FOR INSERT WITH CHECK(true);`);
 await db.exec(await fs.readFile(new URL('./fixture.sql',import.meta.url),'utf8'));
 const owner=randomUUID();await db.exec(`SET fixture.uid='${owner}';SET fixture.role='service_role';`);
 const one=async(sql,params)=>Object.values((await db.query(sql,params)).rows[0])[0];
 const worker=(op,p)=>one('SELECT public.fixture_worker($1,$2::jsonb)',[op,JSON.stringify(p)]);
 const a={rid:randomUUID(),aid:randomUUID(),token:randomUUID(),owner,issue:randomUUID(),internal:false,input:'a'.repeat(64),revision:'fixture',output:'b'.repeat(64),success:true,bytes:10};
 assert.equal(await worker('reserve',a),true);a.key=await worker('claim',a);assert.equal(a.key,owner+'/'+a.aid);a.source_id=randomUUID();a.source=owner+'/'+a.source_id;assert.equal(await worker('input_begin',a),true);assert.equal(await worker('input_terminal',a),true);
 await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,false)',[randomUUID(),a.aid,'body']));
 assert.equal(await worker('start',a),true);assert.equal(await worker('terminal',a),true);
 for(const delta of [{owner:randomUUID()},{input:'c'.repeat(64)},{bytes:11},{internal:true},{revision:'other'},{token:randomUUID()}])assert.equal(await worker('attest',{...a,...delta}),false);
 // Fresh direct contender sessions do not inherit the SECURITY DEFINER wrapper path.
 const directPublish=()=>one('SELECT promotion_model.publish($1,$2,$3,$4,$5,$6,$7,$8)',[a.aid,a.token,a.input,a.output,a.revision,a.owner,a.issue,a.internal]);
 await db.exec('SET search_path=public;');
 await assert.rejects(directPublish,e=>e.code==='42704');
 await db.exec('BEGIN; SET LOCAL search_path=promotion_model,pg_temp;');
 assert.equal(await directPublish(),true);await db.exec('ROLLBACK;');
 assert.equal(await worker('attest',a),true);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),false);
 const mid=randomUUID();assert.equal(await one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'body']),mid);
 assert.equal(await one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'body']),mid);
 const desc=await one('SELECT public.fixture_canonical_descriptor($1)',[mid]);assert.equal(desc.id,a.aid);assert.equal(desc.message_id,mid);assert.equal(desc.sha256,a.output);assert.equal(desc.bytes,a.bytes);
 await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'changed']));
 assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),true);assert.equal(await worker('cleanup',a),null);
 assert.equal(await worker('input_cleanup',{...a,source:'wrong'}),false);assert.equal(await worker('input_cleanup',a),true);assert.equal(await worker('input_admit',a),false);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),true);assert.equal(await worker('input_removed',a),false);assert.equal(await worker('input_positive',a),true);assert.equal(await worker('input_removed',a),true);assert.equal(await worker('input_retry_absence',a),true);
 await worker('retire',a);assert.equal(await one('SELECT public.fixture_canonical_descriptor($1)',[mid]),null);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),false);
 assert.equal(await worker('cleanup',a),a.key);assert.equal(await worker('attest',a),false);assert.equal(await worker('removed',a),true);
 assert.equal(await one('SELECT count(*)::int FROM promotion_model.attempt'),1);
 const unknown={...a,rid:randomUUID(),aid:randomUUID(),token:randomUUID(),source_id:randomUUID()};unknown.source=owner+'/'+unknown.source_id;await worker('reserve',unknown);unknown.key=await worker('claim',unknown);assert.equal(await worker('input_begin',unknown),true);assert.equal(await worker('input_begin',unknown),false);await worker('retire',unknown);assert.equal(await worker('input_cleanup',unknown),false);assert.equal(await worker('input_removed',unknown),false);
 await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");
 await assert.rejects(()=>worker('terminal',a),/permission denied/);
 await assert.rejects(()=>db.exec('SELECT * FROM promotion_model.attempt'),/permission denied/);
 await assert.rejects(()=>db.query('INSERT INTO public.fixture_promotion_receipts(id,output_digest) VALUES($1,$2)',[a.aid,'0'.repeat(64)]),e=>e.code==='42501');
 await assert.rejects(()=>db.query('UPDATE public.fixture_promotion_receipts SET output_digest=$1 WHERE id=$2',['0'.repeat(64),a.aid]),e=>e.code==='42501');
 await db.exec('RESET ROLE; CREATE TABLE public.feedback_issues(id uuid PRIMARY KEY,reporter_id uuid);');
 await db.exec(await fs.readFile(new URL('./sender.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO promotion_model.client_config VALUES(true,$1)',['fixture']);
 const cmid=randomUUID(),ci=randomUUID(),caid=randomUUID();await db.query('INSERT INTO public.feedback_issues VALUES($1,$2)',[ci,owner]);
 const params=[cmid,ci,'immutable',caid,'a'.repeat(64),10];
 const reserve=()=>one('SELECT public.reserve_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6)',params);
 const finalize=()=>one('SELECT public.finalize_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6)',params);
 await db.exec('SET ROLE authenticated;');
 const reserved=await reserve();assert.deepEqual(reserved,{version:1,image_id:caid,path:owner+'/'+caid,status:'upload'});assert.deepEqual(await reserve(),reserved);
 assert.equal((await finalize()).status,'pending');for(const [index,value] of [[2,'changed'],[3,randomUUID()],[4,'c'.repeat(64)],[5,11]]){const old=params[index];params[index]=value;await assert.rejects(reserve);await assert.rejects(finalize);params[index]=old;}
 await db.exec(`SET fixture.uid='${randomUUID()}';`);await assert.rejects(reserve,e=>e.code==='42501');await assert.rejects(finalize,e=>e.code==='42501');
 await db.exec(`RESET ROLE;SET fixture.uid='${owner}';SET fixture.role='service_role';`);
 const row=(await db.query('SELECT token FROM promotion_model.attempt WHERE id=$1',[caid])).rows[0];
 const ca={rid:cmid,aid:caid,token:row.token,owner,issue:ci,internal:false,input:'a'.repeat(64),revision:'fixture',source:owner+'/'+caid,source_id:caid,success:true,output:'b'.repeat(64),bytes:10};
 assert.equal(await worker('input_terminal',ca),true);assert.equal(await worker('start',ca),true);assert.equal(await worker('terminal',ca),true);assert.equal(await worker('attest',ca),true);
 await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");assert.equal((await reserve()).status,'ready');assert.deepEqual(await finalize(),{status:'published',message_id:cmid});assert.deepEqual(await finalize(),{status:'published',message_id:cmid});
 await db.exec("RESET ROLE;SET fixture.role='service_role';");assert.equal(await one('SELECT count(*)::int FROM promotion_model.publication WHERE id=$1',[cmid]),1);await worker('retire',ca);await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");await assert.rejects(finalize);
 await db.exec("RESET ROLE;SET fixture.role='service_role';");
 const collision=randomUUID(),alien={...ca,rid:randomUUID(),aid:randomUUID(),token:randomUUID(),issue:randomUUID()};
 await worker('reserve',alien);await worker('claim',alien);await db.query('INSERT INTO promotion_model.reservation(id,owner_id,thread_id,internal,generation) VALUES($1,$2,$3,false,1)',[collision,owner,ci]);
 await db.query('INSERT INTO promotion_model.client_request(mid,owner_id,uploader_id,internal,issue_id,body,image_id,digest,bytes) VALUES($1,$2,$2,false,$3,$4,$5,$6,$7)',[collision,owner,ci,'immutable',alien.aid,alien.input,10]);
 const collisionArgs=[collision,ci,'immutable',alien.aid,alien.input,10];const countBefore=await one('SELECT count(*)::int FROM promotion_model.publication');
 await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");
 await assert.rejects(()=>one('SELECT public.reserve_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6)',collisionArgs));await assert.rejects(()=>one('SELECT public.finalize_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6)',collisionArgs));
 await db.exec('RESET ROLE;');assert.equal(await one('SELECT count(*)::int FROM promotion_model.publication'),countBefore);assert.equal(await one('SELECT reservation_id FROM promotion_model.attempt WHERE id=$1',[alien.aid]),alien.rid);
 // Staff uploader is distinct from recipient; roles derive from auth, not request data.
 const staff=randomUUID(),staff2=randomUUID();await db.exec(`CREATE OR REPLACE FUNCTION public.is_feedback_staff(uuid) RETURNS boolean LANGUAGE SQL AS $$SELECT $1 IN ('${staff}'::uuid,'${staff2}'::uuid) AND current_setting('fixture.staff_active',true) IS DISTINCT FROM 'false'$$;SET fixture.staff_active='true';`);
 // Reproduce prior helper mismatch: an owner-upload internal intent is not authorized.
 for(const explicitStaff of [false,true]){
  await db.exec(`SET fixture.uid='${owner}';SET fixture.role='service_role';`);
  const ia={...a,rid:randomUUID(),aid:randomUUID(),token:randomUUID(),internal:true,source_id:randomUUID(),...(explicitStaff?{uploader:staff}:{})};ia.source=(explicitStaff?staff:owner)+'/'+ia.source_id;
  await worker('reserve',ia);ia.key=await worker('claim',ia);assert.equal(ia.key,owner+'/'+ia.aid);assert.equal(await worker('input_begin',ia),true);
  await db.exec(`SET fixture.role='authenticated';SET ROLE authenticated;`);assert.equal(await one('SELECT public.fixture_quarantine_insert($1)',[ia.source]),false);
  await db.exec(`SET fixture.uid='${staff}';`);assert.equal(await one('SELECT public.fixture_quarantine_insert($1)',[ia.source]),explicitStaff);
  await db.exec('RESET ROLE;');const identities=(await db.query('SELECT owner_id,uploader_id FROM promotion_model.attempt WHERE id=$1',[ia.aid])).rows[0];assert.equal(identities.owner_id,owner);assert.equal(identities.uploader_id,explicitStaff?staff:owner);
 }
 for(const inside of [false,true]){
  const smid=randomUUID(),said=randomUUID(),args=[smid,ci,'staff immutable',said,'d'.repeat(64),10,inside];
  const sr=()=>one('SELECT public.reserve_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6,$7)',args),sf=()=>one('SELECT public.finalize_canonical_feedback_image_v1($1,$2,$3,$4,$5,$6,$7)',args);
  await db.exec(`SET fixture.uid='${staff}';SET fixture.role='authenticated';SET ROLE authenticated;`);assert.equal((await sr()).path,staff+'/'+said);assert.equal((await sf()).status,'pending');assert.equal(await one('SELECT public.fixture_quarantine_insert($1)',[staff+'/'+said]),true);
  await db.exec(`SET fixture.uid='${owner}';`);assert.equal(await one('SELECT public.fixture_quarantine_insert($1)',[staff+'/'+said]),false);await assert.rejects(sr);await assert.rejects(sf);
  await db.exec(`SET fixture.uid='${staff2}';`);await assert.rejects(sr);await assert.rejects(sf);
  await db.exec(`RESET ROLE;SET fixture.uid='${staff}';SET fixture.role='service_role';`);const t=(await db.query('SELECT * FROM promotion_model.attempt WHERE id=$1',[said])).rows[0];assert.equal(t.owner_id,owner);assert.equal(t.uploader_id,staff);assert.equal(t.object_key,owner+'/'+said);
  const sa={rid:smid,aid:said,token:t.token,owner,uploader:staff,issue:ci,internal:inside,input:'d'.repeat(64),revision:'fixture',source:staff+'/'+said,source_id:said,success:true,output:'e'.repeat(64),bytes:10};
  assert.equal(await worker('input_terminal',{...sa,uploader:owner}),false);assert.equal(await worker('input_terminal',sa),true);assert.equal(await worker('start',{...sa,uploader:owner}),false);assert.equal(await worker('start',sa),true);assert.equal(await worker('terminal',sa),true);assert.equal(await worker('attest',{...sa,uploader:owner}),false);assert.equal(await worker('attest',sa),true);
  await db.exec(`SET fixture.role='authenticated';SET ROLE authenticated;SET fixture.uid='${owner}';`);await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,$4)',[smid,said,'staff immutable',inside]));
  await db.exec(`SET fixture.uid='${staff}';`);await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,$4)',[randomUUID(),said,'staff immutable',inside]));await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,$4)',[smid,said,'changed',inside]));
  await db.exec("SET fixture.staff_active='false';");await assert.rejects(sf,e=>e.code==='42501');await db.exec("SET fixture.staff_active='true';");
  await db.exec('RESET ROLE;');await db.query('UPDATE public.feedback_issues SET reporter_id=$1 WHERE id=$2',[randomUUID(),ci]);await db.exec('SET ROLE authenticated;');await assert.rejects(sf);await db.exec('RESET ROLE;');await db.query('UPDATE public.feedback_issues SET reporter_id=$1 WHERE id=$2',[owner,ci]);await db.exec('SET ROLE authenticated;');
  assert.equal((await sf()).status,'published');assert.equal((await sf()).status,'published');await db.exec('RESET ROLE;');await db.query('UPDATE public.feedback_issues SET reporter_id=$1 WHERE id=$2',[randomUUID(),ci]);await db.exec('SET ROLE authenticated;');await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,$4)',[smid,said,'staff immutable',inside]));await db.exec('RESET ROLE;');await db.query('UPDATE public.feedback_issues SET reporter_id=$1 WHERE id=$2',[owner,ci]);await db.exec('SET ROLE authenticated;');const previous=args[6];args[6]=!inside;await assert.rejects(sr);await assert.rejects(sf);args[6]=previous;
  assert.equal(await one('SELECT public.fixture_canonical_read($1)',[t.object_key]),true);await db.exec(`SET fixture.uid='${owner}';`);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[t.object_key]),!inside);await db.exec(`SET fixture.uid='${randomUUID()}';`);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[t.object_key]),false);await db.exec('RESET ROLE;');
 }
 console.log('PASS real PostgreSQL fixture publication, binding, retirement, cleanup and ACL controls');
} finally {await db.close();}
