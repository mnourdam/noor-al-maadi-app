"""Local disposable PostgreSQL 17.6 only. Never read remote credentials/URLs."""
import importlib.util,json,uuid,hashlib,time,threading
from pathlib import Path
import psycopg
ROOT=Path(__file__).resolve().parents[3]
DB='v18_investigation_fixture'
def connect(db=DB):
 return psycopg.connect(host='127.0.0.1',port=55439,user='postgres',dbname=db,sslmode='disable',client_encoding='UTF8',connect_timeout=5,autocommit=True,options='-c statement_timeout=10000 -c lock_timeout=5000')
def run():
 checks=[]
 def check(ok,label):
  if not ok:raise AssertionError(label)
  checks.append(label)
 with connect('postgres') as admin:
  check(admin.execute('show data_directory').fetchone()[0]=='/tmp/irth-pg-conflict-data','fixed newly initialized local data directory')
  check(admin.execute("select current_setting('server_version_num')::int,inet_server_addr()::text,inet_server_port()").fetchone()==(170006,'127.0.0.1/32',55439),'fixed PostgreSQL17.6 loopback target')
  check(admin.execute('select count(*) from pg_database where datname=%s',(DB,)).fetchone()[0]==0,'fresh database required')
  admin.execute('create database '+DB)
 with connect() as c:
  c.execute('create schema fixture_boundary; create table fixture_boundary.marker(marker text primary key)')
  c.execute("insert into fixture_boundary.marker values('v18-investigation-provenance-only-v1')")
  spec=importlib.util.spec_from_file_location('baseline',ROOT/'tests/sql/v18-investigation-provenance/fixture.py');f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
  sql,source_evidence=f.build();c.execute(sql)
  def user(profile=True):
   uid=uuid.uuid4();c.execute('insert into auth.users values(%s)',(uid,))
   if profile:c.execute('insert into public.profiles values(%s,100,50,4,null)',(uid,))
   return uid
  def inv(reward=None):
   key=uuid.uuid4();c.execute('insert into public.investigations values(%s,%s,true,%s::jsonb)',(key,str(key),json.dumps(reward or {'xp':10,'dinars':3,'hearts':0,'artifact':'artifact-'+str(key)})));return key
  def call(conn,uid,key,delta):
   conn.execute('set local role authenticated');conn.execute("select set_config('request.jwt.claim.sub',%s,true)",(str(uid),))
   return conn.execute('select public.complete_investigation_v2(%s,%s,2,1)',(key,delta)).fetchone()[0]
  def complete(uid,key,delta):
   with c.transaction():return call(c,uid,key,delta)
  def balance(uid):return c.execute('select xp,dinars,hearts from public.profiles where id=%s',(uid,)).fetchone()
  def snapshot():
   return {t:c.execute('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\'::jsonb) from public.'+t+' t').fetchone()[0] for t in ('profiles','user_investigation_progress','applied_profile_deltas','user_collection')}
  # Unchanged checked-in producer reproduces the reported bug first.
  u=user();i=inv();d=uuid.uuid4();c.execute("insert into applied_profile_deltas(delta_id,user_id,xp,source) values(%s,%s,777,'unrelated')",(d,u))
  out=complete(u,i,d)
  check(out['ok'] and out['applied'] and not out['reward_granted'] and balance(u)==(100,50,4),'baseline reproduces stamped completion without wallet grant')
  candidate=Path(__file__).with_name('candidate.sql').read_text();c.execute(candidate)
  u=user();i=inv();d=uuid.uuid4();out=complete(u,i,d)
  check(out['reward_granted'] and balance(u)==(110,53,4),'fresh grant exact once')
  before=snapshot();replay=complete(u,i,uuid.uuid4())
  check(replay['already_completed'] and snapshot()==before,'replay different delta id leaves all state unchanged')
  for label,other_owner,exact in [('mismatched',False,False),('exact-looking',False,True),('cross-owner',True,False)]:
   u=user();i=inv();d=uuid.uuid4();owner=user() if other_owner else u
   c.execute('insert into applied_profile_deltas(delta_id,user_id,xp,dinars,hearts,source) values(%s,%s,%s,%s,0,%s)',(d,owner,10 if exact else 777,3 if exact else 888,'investigation_complete:'+str(i) if exact else 'unrelated'))
   before=snapshot();out=complete(u,i,d)
   check(out=={'ok':False,'applied':False,'reward_granted':False,'reason':'investigation_delta_conflict'},label+' conflict rejected without adopting evidence')
   check(snapshot()==before,label+' conflict rolls back completion/snapshot/collection and preserves wallets/ledger')
   check(complete(u,i,d)==out and snapshot()==before,label+' repeated conflict remains no-op')
  u=user(False);i=inv();d=uuid.uuid4();before=snapshot();out=complete(u,i,d)
  check(out['reason']=='investigation_profile_missing' and snapshot()==before,'missing wallet rolls back progress delta collectible')
  u=user();i=inv({'xp':999,'dinars':999,'hearts':99});out=complete(u,i,uuid.uuid4())
  check(balance(u)==(250,100,5) and out['xp_earned']==150 and out['dinars_earned']==50,'catalog caps and wallet heart ceiling preserved')
  c.execute("create function fixture_boundary.fail_collection() returns trigger language plpgsql as $$begin if new.item_id='fault-artifact' then raise exception 'fixture fault'; end if; return new; end$$; create trigger fault before insert on user_collection for each row execute function fixture_boundary.fail_collection()")
  u=user();i=inv({'xp':10,'dinars':3,'hearts':0,'artifact':'fault-artifact'});before=snapshot()
  try:complete(u,i,uuid.uuid4())
  except psycopg.Error:pass
  else:raise AssertionError('fault not raised')
  check(snapshot()==before,'late artifact failure rolls back completion ledger wallet and collection')
  # True overlapping transactions, not sequential replay or an assumed sleep race.
  def race(same_investigation):
   uid=user();first=inv();second=first if same_investigation else inv();delta=uuid.uuid4();other_delta=uuid.uuid4() if same_investigation else delta
   errors=[];results=[];started=threading.Event();pid=[]
   with connect() as a,connect() as b:
    with a.transaction():
     one=call(a,uid,first,delta)
     def worker():
      try:
       with b.transaction():pid.append(b.info.backend_pid);started.set();results.append(call(b,uid,second,other_delta))
      except Exception as error:errors.append(type(error).__name__)
     thread=threading.Thread(target=worker);thread.start();assert started.wait(2)
     deadline=time.monotonic()+4;blocked=False
     while time.monotonic()<deadline:
      if c.execute('select %s=any(pg_blocking_pids(%s))',(a.info.backend_pid,pid[0])).fetchone()[0]:blocked=True;break
      time.sleep(.02)
     check(blocked,'concurrency '+str(same_investigation)+' observed competing backend blocked')
    thread.join(8);check(not thread.is_alive() and not errors,'concurrency '+str(same_investigation)+' both transactions resolved')
   check(balance(uid)==(110,53,4),'concurrency '+str(same_investigation)+' exactly one wallet reward')
   check(c.execute('select count(*) from user_investigation_progress where user_id=%s',(uid,)).fetchone()[0]==1,'concurrency '+str(same_investigation)+' exactly one completion')
   check(results[0].get('already_completed') is True if same_investigation else results[0].get('reason')=='investigation_delta_conflict','concurrency '+str(same_investigation)+' loser safely replays or rejects')
  race(True);race(False)
  return {'result':'PASS_LOCAL_CANDIDATE','scope':'fresh-grant atomicity only; synthetic dependencies and SQL identity shim; no historical repair or production authorization','checks':checks,'source_evidence':source_evidence,'candidate_sha256':hashlib.sha256(candidate.encode()).hexdigest()}
if __name__=='__main__':
 try:r=run()
 except Exception as error:
  r={'result':'FAIL','type':type(error).__name__,'detail':str(error) if isinstance(error,AssertionError) else None}
 Path(__file__).with_name('acceptance.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2));raise SystemExit(0 if r['result']=='PASS_LOCAL_CANDIDATE' else 1)
