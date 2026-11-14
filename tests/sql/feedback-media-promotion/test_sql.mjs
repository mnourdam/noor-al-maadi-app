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
 await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'changed']));
 assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),true);assert.equal(await worker('cleanup',a),null);
 assert.equal(await worker('input_cleanup',{...a,source:'wrong'}),false);assert.equal(await worker('input_cleanup',a),true);assert.equal(await worker('input_admit',a),false);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),true);assert.equal(await worker('input_removed',a),false);assert.equal(await worker('input_positive',a),true);assert.equal(await worker('input_removed',a),true);assert.equal(await worker('input_retry_absence',a),true);
 await worker('retire',a);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),false);
 assert.equal(await worker('cleanup',a),a.key);assert.equal(await worker('attest',a),false);assert.equal(await worker('removed',a),true);
 assert.equal(await one('SELECT count(*)::int FROM promotion_model.attempt'),1);
 const unknown={...a,rid:randomUUID(),aid:randomUUID(),token:randomUUID(),source_id:randomUUID()};unknown.source=owner+'/'+unknown.source_id;await worker('reserve',unknown);unknown.key=await worker('claim',unknown);assert.equal(await worker('input_begin',unknown),true);assert.equal(await worker('input_begin',unknown),false);await worker('retire',unknown);assert.equal(await worker('input_cleanup',unknown),false);assert.equal(await worker('input_removed',unknown),false);
 await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");
 await assert.rejects(()=>worker('terminal',a),/permission denied/);
 await assert.rejects(()=>db.exec('SELECT * FROM promotion_model.attempt'),/permission denied/);
 await assert.rejects(()=>db.query('INSERT INTO public.fixture_promotion_receipts(id,output_digest) VALUES($1,$2)',[a.aid,'0'.repeat(64)]),e=>e.code==='42501');
 await assert.rejects(()=>db.query('UPDATE public.fixture_promotion_receipts SET output_digest=$1 WHERE id=$2',['0'.repeat(64),a.aid]),e=>e.code==='42501');
 console.log('PASS real PostgreSQL fixture publication, binding, retirement, cleanup and ACL controls');
} finally {await db.close();}
