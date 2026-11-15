"""Supplementary local test; catalog definitions only, never live rows or connections."""
import json,uuid,hashlib
from pathlib import Path
from harness import connect
HERE=Path(__file__).parent
catalog=Path('/workspace/shared/irth-investigation-live-catalog.json')
j=json.loads(catalog.read_text());checks=[]
def check(ok,label):
 assert ok,label
 checks.append(label)
with connect() as c:
 check(c.execute('show data_directory').fetchone()[0]=='/tmp/irth-pg-conflict-data','exact disposable loopback cluster')
 check(c.execute('select marker from fixture_boundary.marker').fetchone()[0]=='v18-investigation-provenance-only-v1','fixture marker')
 with c.transaction():
  c.execute('alter table profiles add column hearts_at timestamptz, add column level integer default 0, add column streak integer default 0, add column longest_streak integer default 0, add column investigations_completed integer default 0, add column updated_at timestamptz, add column hearts_full_notified_at timestamptz')
  # A dependency not retrieved from live metadata is fail-closed, never simulated success.
  c.execute("create function public.grant_level5_reward(uuid) returns void language plpgsql as $$begin raise exception 'uncaptured level5 dependency'; end$$")
  selected=[t for t in j[3]['rows'] if t['relname'] in ('profiles','user_investigation_progress')]
  for t in selected:
   name=t['triggerdef'].split()[2]
   c.execute('drop trigger if exists '+name+' on public.'+t['relname'])
   c.execute(t['functiondef']);c.execute(t['triggerdef'])
  check(len(selected)==5,'five exact catalog triggers on written tables installed')
  # Record actual profile-update trigger ordering without changing the copied functions.
  c.execute('create table fixture_boundary.events(seq bigserial, name text, completed int)')
  c.execute("create function fixture_boundary.observe() returns trigger language plpgsql as $$begin insert into fixture_boundary.events(name,completed) values(TG_NAME,NEW.investigations_completed); return NEW; end$$")
  c.execute('create trigger aaa_observe before update on profiles for each row execute function fixture_boundary.observe(); create trigger zzz_observe before update on profiles for each row execute function fixture_boundary.observe()')
  def setup():
   u=uuid.uuid4();i=uuid.uuid4();c.execute('insert into auth.users values(%s)',(u,));c.execute('insert into profiles(id,xp,dinars,hearts) values(%s,100,50,4)',(u,));c.execute('insert into investigations values(%s,%s,true,%s::jsonb)',(i,str(i),json.dumps({'xp':10,'dinars':3,'hearts':1})));return u,i
  def call(u,i,d):
   c.execute("select set_config('request.jwt.claim.sub',%s,true)",(str(u),));return c.execute('select complete_investigation_v2(%s,%s,2,1)',(i,d)).fetchone()[0]
  def snap():
   return {t:c.execute("select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from "+t+' t').fetchone()[0] for t in ('public.profiles','public.user_investigation_progress','public.applied_profile_deltas','public.user_collection','fixture_boundary.events')}
  u,i=setup();d=uuid.uuid4();o=call(u,i,d)
  check(o['reward_granted'],'successful reward with copied live triggers')
  p=c.execute('select xp,dinars,hearts,investigations_completed,hearts_at is not null,hearts_full_notified_at is not null,updated_at is not null from profiles where id=%s',(u,)).fetchone()
  check(p==(110,53,5,1,True,True,True),'count, timestamps, hearts anchor and wallet updated')
  events=c.execute('select name,completed from fixture_boundary.events order by seq').fetchall()
  check(events==[('aaa_observe',1),('zzz_observe',1),('aaa_observe',1),('zzz_observe',1)],'progress-trigger profile update precedes wallet profile update')
  before=snap();check(call(u,i,uuid.uuid4())['already_completed'] and snap()==before,'replay no trigger side effects')
  u,i=setup();d=uuid.uuid4();c.execute("insert into applied_profile_deltas(delta_id,user_id,xp,source) values(%s,%s,777,'unrelated')",(d,u));before=snap();o=call(u,i,d)
  check(o['reason']=='investigation_delta_conflict' and snap()==before,'conflict rolls back nested profile counter/time/observer changes')
  u,i=setup();c.execute("create function fixture_boundary.fail_wallet() returns trigger language plpgsql as $$begin if NEW.xp<>OLD.xp then raise exception 'late wallet failure'; end if; return NEW; end$$; create trigger zzzz_fail_wallet before update on profiles for each row execute function fixture_boundary.fail_wallet()")
  before=snap()
  try:
   with c.transaction():call(u,i,uuid.uuid4())
  except Exception:pass
  else:raise AssertionError('late failure absent')
  check(snap()==before,'late wallet trigger failure rolls back earlier completion counter and ledger')
  c.execute('rollback')
report={'result':'PASS_LOCAL_TRIGGER_SUPPLEMENT','checks':checks,'catalog_sha256':hashlib.sha256(catalog.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256((HERE/'candidate.sql').read_bytes()).hexdigest(),'limits':['Only five triggers on written tables copied exactly; investigation-only write triggers cannot fire in completion read path.','Fixture owner remains local superuser, not deployed nonsuperuser BYPASSRLS. No live acceptance.','Level remains zero. grant_level5_reward dependency is fail-closed stub; level crossing NOT tested.','Synthetic schemas/SQL identity shim. Existing historical repair out of scope.','Observer sequence numbers intentionally excluded from state equivalence; sequences are nontransactional.']}
(HERE/'trigger-acceptance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
