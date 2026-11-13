import assert from 'node:assert/strict';
const {PGlite} = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import fs from 'node:fs/promises';
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE FUNCTION public.is_feedback_staff(_uid uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=_uid AND r.role IN('owner','admin','editor')) $$;
CREATE TABLE public.feedback_issues(id uuid PRIMARY KEY,reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL);
CREATE TABLE public.feedback_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),issue_id uuid NOT NULL REFERENCES public.feedback_issues(id) ON DELETE CASCADE,author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,author_role text NOT NULL,body text NOT NULL,is_internal boolean NOT NULL,attachments jsonb NOT NULL DEFAULT '[]');
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name)); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
`);
await db.exec(await fs.readFile(new URL('../../../docs/proposals/v18-feedback-private-images.sql',import.meta.url),'utf8'));

const u='11111111-1111-4111-8111-111111111111',i='22222222-2222-4222-8222-222222222222',a='33333333-3333-4333-8333-333333333333',m='44444444-4444-4444-8444-444444444444';
const bob='55555555-5555-4555-8555-555555555555',staff='66666666-6666-4666-8666-666666666666';
const staffImage='77777777-7777-4777-8777-777777777777',staffMessage='88888888-8888-4888-8888-888888888888';
let checks=0;
async function check(name,work){await work();checks++;console.log('PASS',name);}
async function as(uid){await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${uid}'; SET ROLE authenticated;`);}
async function count(table){const r=await db.query(`SELECT count(*)::int n FROM ${table}`);return r.rows[0].n;}
async function reserve(id,internal=false){return (await db.query("SELECT reserve_feedback_image($1,$2,$3,'image/jpeg',5) path",[id,i,internal])).rows[0].path;}
async function upload(path){await db.query(`INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('feedback-images',$1,'{"mimetype":"image/jpeg","size":5}')`,[path]);}
async function finalize(mid,aid,internal=false,body='hello'){return db.query('SELECT reply_with_feedback_images($1,$2,$3,$4,ARRAY[$5::uuid]) id',[mid,i,body,internal,aid]);}
await db.exec(`INSERT INTO auth.users VALUES('${u}'),('${bob}'),('${staff}'); INSERT INTO feedback_issues VALUES('${i}','${u}'); INSERT INTO user_roles VALUES('${staff}','editor');`);
await as(bob);
await check('unrelated player cannot reserve',()=>assert.rejects(()=>reserve(a),/forbidden/));
await as(u);
await check('player cannot reserve internal note',()=>assert.rejects(()=>reserve(a,true),/forbidden/));
let path;
await check('owner reserves and uploads immutable private image',async()=>{path=await reserve(a);await upload(path);assert.equal(path,`${u}/${i}/${a}`);});
await check('unattached object is not readable',async()=>assert.equal(await count('storage.objects'),0));
await check('owner cannot overwrite object',async()=>{const r=await db.query("UPDATE storage.objects SET metadata='{}' RETURNING id");assert.equal(r.rows.length,0);});
await check('attached object becomes readable to its owner',async()=>{await finalize(m,a);assert.equal(await count('storage.objects'),1);});
await check('exact final response retry returns same message',async()=>assert.equal((await finalize(m,a)).rows[0].id,m));
await check('changed-body replay is rejected',()=>assert.rejects(()=>finalize(m,a,false,'changed'),/message_conflict/));
await as(bob);
await check('other player cannot read attached image',async()=>assert.equal(await count('storage.objects'),0));
await check('other player cannot use owner reservation',()=>assert.rejects(()=>finalize(staffMessage,a),/forbidden/));
await as(staff);
await check('staff can read owner image',async()=>assert.equal(await count('storage.objects'),1));
await check('staff can attach internal image',async()=>{await upload(await reserve(staffImage,true));await finalize(staffMessage,staffImage,true);assert.equal(await count('storage.objects'),2);});
await as(u);
await check('player cannot read staff internal image',async()=>assert.equal(await count('storage.objects'),1));
await check('cleanup queue is not accessible to ordinary user',()=>assert.rejects(()=>count('feedback_image_delete_queue'),/permission denied/));
await db.exec('RESET ROLE');
// This is the relevant unchanged sequence from purge_user_account_data, not
// an invocation/proof of the entire deployed account deletion service.
await check('existing purge first message deletion no longer blocked',async()=>{await db.query('DELETE FROM feedback_messages WHERE author_id=$1',[u]);assert.equal(await count('feedback_image_delete_queue'),1);assert.equal(await count('feedback_image_uploads'),1);});
await as(u);
await check('metadata retirement immediately denies retained object bytes',async()=>assert.equal(await count('storage.objects'),0));
await check('retired random ID cannot be reused for later bytes',()=>assert.rejects(()=>reserve(a),/retired_image_id/));
await db.exec('RESET ROLE');
await check('issue cascade queues staff attachments without deleting staff',async()=>{await db.query('DELETE FROM feedback_issues WHERE reporter_id=$1',[u]);assert.equal(await count('feedback_image_uploads'),0);assert.equal(await count('feedback_image_delete_queue'),2);assert.equal(await count('auth.users'),3);});
await check('auth deletion succeeds after original purge sequence',async()=>{await db.query('DELETE FROM auth.users WHERE id=$1',[u]);assert.equal(await count('auth.users'),2);});
await check('SQL does NOT pretend to remove retained object bytes',async()=>assert.equal(await count('storage.objects'),2));
// New synthetic issue tests an abandoned uploader whose account is removed.
await db.exec(`INSERT INTO feedback_issues VALUES('${i}','${bob}')`);
await as(staff);
const orphan='99999999-9999-4999-8999-999999999999';
await upload(await reserve(orphan));
await db.exec('RESET ROLE');
await check('uploader account cascade queues orphan instead of blocking auth deletion',async()=>{await db.query('DELETE FROM auth.users WHERE id=$1',[staff]);assert.equal(await count('feedback_image_uploads'),0);assert.equal(await count('feedback_image_delete_queue'),3);});
await check('random tombstones contain no user/thread/path columns',async()=>{const r=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='feedback_image_ids' ORDER BY ordinal_position");assert.deepEqual(r.rows.map(x=>x.column_name),['id']);assert.equal(await count('feedback_image_ids'),3);});
console.log(JSON.stringify({checks,engine:'PGlite PostgreSQL',storage:'metadata fixture only; no byte API',production:false}));
await db.close();
