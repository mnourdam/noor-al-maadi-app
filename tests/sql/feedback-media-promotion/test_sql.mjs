// PostgreSQL model guard only, not native Auth/Storage acceptance.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {randomUUID} from 'node:crypto';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL AS $$SELECT nullif(current_setting('fixture.uid',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE SQL AS $$SELECT current_setting('fixture.role',true)$$;
 CREATE FUNCTION public.is_feedback_staff(uuid) RETURNS boolean LANGUAGE SQL AS $$SELECT false$$;
 CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
 await db.exec(await fs.readFile(new URL('./fixture.sql',import.meta.url),'utf8'));
 const owner=randomUUID();await db.exec(`SET fixture.uid='${owner}';SET fixture.role='service_role';`);
 const one=async(sql,params)=>Object.values((await db.query(sql,params)).rows[0])[0];
 const worker=(op,p)=>one('SELECT public.fixture_worker($1,$2::jsonb)',[op,JSON.stringify(p)]);
 const a={rid:randomUUID(),aid:randomUUID(),token:randomUUID(),owner,issue:randomUUID(),internal:false,input:'a'.repeat(64),revision:'fixture',output:'b'.repeat(64),success:true,bytes:10};
 assert.equal(await worker('reserve',a),true);a.key=await worker('claim',a);assert.equal(a.key,owner+'/'+a.aid);
 await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,false)',[randomUUID(),a.aid,'body']));
 assert.equal(await worker('start',a),true);assert.equal(await worker('terminal',a),true);
 for(const delta of [{owner:randomUUID()},{input:'c'.repeat(64)},{bytes:11},{internal:true},{revision:'other'},{token:randomUUID()}])assert.equal(await worker('attest',{...a,...delta}),false);
 assert.equal(await worker('attest',a),true);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),false);
 const mid=randomUUID();assert.equal(await one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'body']),mid);
 assert.equal(await one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'body']),mid);
 await assert.rejects(()=>one('SELECT public.fixture_finalize($1,$2,$3,false)',[mid,a.aid,'changed']));
 assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),true);assert.equal(await worker('cleanup',a),null);
 await worker('retire',a);assert.equal(await one('SELECT public.fixture_canonical_read($1)',[a.key]),false);
 assert.equal(await worker('cleanup',a),a.key);assert.equal(await worker('attest',a),false);assert.equal(await worker('removed',a),true);
 assert.equal(await one('SELECT count(*)::int FROM promotion_model.attempt'),1);
 await db.exec("SET fixture.role='authenticated';SET ROLE authenticated;");
 await assert.rejects(()=>worker('terminal',a),/permission denied/);
 await assert.rejects(()=>db.exec('SELECT * FROM promotion_model.attempt'),/permission denied/);
 console.log('PASS real PostgreSQL fixture publication, binding, retirement, cleanup and ACL controls');
} finally {await db.close();}
