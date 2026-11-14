"""Two owned PostgreSQL contenders plus observer; no HTTP concurrency claim."""
import json,os,selectors,subprocess,time,uuid

def require(ok,message):
 if not ok:raise RuntimeError(message)
def category(error):
 if isinstance(error,subprocess.TimeoutExpired):return 'subprocess_timeout'
 if isinstance(error,TimeoutError):return 'deadline'
 if isinstance(error,OSError):return 'os_error'
 if isinstance(error,RuntimeError):return 'validation_or_result'
 if isinstance(error,(ValueError,TypeError,KeyError)):return 'shape'
 return 'unknown'
def quote(value):return "'"+value.replace("'","''")+"'"
def marker():return 'irth_promotion_'+uuid.uuid4().hex

def admin_args(h):
 container=h.verify_admin_container()
 require(h.admin_socket in ('/tmp','/var/run/postgresql'),'admin route')
 script=('set -eu; test -n "${POSTGRES_PASSWORD:-}"; unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGUSER PGHOST PGPORT PGPASSFILE PGSSLMODE; export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -w -h '+h.admin_socket+' -p 5432 -U supabase_admin -d postgres -v ON_ERROR_STOP=1')
 return ['docker','exec','-i',container,'/bin/sh','-c',script]

def exact_wait(rows,holder,waiter,holder_sql,waiter_sql):
 if len(rows)!=2:return False
 by={r.get('marker'):r for r in rows}
 a=by.get(holder['marker']);b=by.get(waiter['marker'])
 if not a or not b:return False
 for observed,expected in ((a,holder),(b,waiter)):
  if any(observed.get(k)!=expected.get(k) for k in ('pid','started','marker')):return False
  if observed.get('role')!='supabase_admin' or observed.get('database')!='postgres':return False
 return (a.get('state')=='idle in transaction' and a.get('query')==holder_sql and b.get('query')==waiter_sql
         and a.get('xid') is not None and b.get('wait')=='transactionid' and b.get('blocking')==[a['pid']]
         and b.get('wait_xid')==a['xid'] and a.get('holds_xid') is True)

class Pair:
 def __init__(self,h):
  self.h=h;self.args=admin_args(h);self.sessions=[];self.identities=[]
 def query(self,sql,seconds=2):
  r=subprocess.run(self.args,input="SET statement_timeout='900ms'; SET lock_timeout='500ms'; "+sql,text=True,capture_output=True,cwd=self.h.work,env=self.h.env,timeout=seconds)
  require(r.returncode==0 and len(r.stdout)<=16384,'observer query failed');return r.stdout.strip()
 def snapshots(self,seconds=2):
  names=','.join(quote(s['marker']) for s in self.sessions)
  return json.loads(self.query("SELECT coalesce(json_agg(json_build_object('pid',a.pid,'started',a.backend_start::text,'marker',a.application_name,'role',a.usename,'database',a.datname,'state',a.state,'query',btrim(a.query,E' \\n\\r\\t;'),'xid',a.backend_xid::text,'wait',a.wait_event,'blocking',pg_blocking_pids(a.pid),'wait_xid',(SELECT l.transactionid::text FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='transactionid' AND NOT l.granted LIMIT 1),'holds_xid',EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='transactionid' AND l.granted AND l.transactionid=a.backend_xid))),'[]'::json)::text FROM pg_stat_activity a WHERE a.application_name IN ("+names+");",seconds))
 def start(self,sql):
  name=marker();p=subprocess.Popen(self.args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=self.h.work,env=self.h.env)
  entry={'process':p,'marker':name,'sql':sql.rstrip(';')};self.sessions.append(entry)
  p.stdin.write(("SET application_name="+quote(name)+"; SET statement_timeout='7000ms'; SET lock_timeout='6000ms'; SET idle_in_transaction_session_timeout='10000ms'; BEGIN; SET LOCAL search_path=promotion_model,pg_temp;\n"+sql+";\n").encode());p.stdin.flush()
  return entry
 def line(self,s,seconds=3):
  end=time.monotonic()+seconds;data=b'';p=s['process']
  with selectors.DefaultSelector() as selector:
   selector.register(p.stdout,selectors.EVENT_READ)
   while time.monotonic()<end:
    if not selector.select(max(0,end-time.monotonic())):break
    chunk=os.read(p.stdout.fileno(),4096)
    if not chunk:break
    data+=chunk;require(len(data)<=4096,'contender output overflow')
    if b'\n' in data:
     require(data.endswith(b'\n') and data.count(b'\n')==1,'contender output shape')
     return data.decode('ascii').strip()
  raise RuntimeError('contender result deadline')
 def identity(self,s):
  # Startup admission is distinct from the later exact contention proof.
  deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   rows=[r for r in self.snapshots(min(2,max(.01,deadline-time.monotonic()))) if r['marker']==s['marker']]
   require(time.monotonic()<=deadline,'contender identity deadline')
   require(len(rows)<=1,'ambiguous contender identity')
   if not rows:
    require(s['process'].poll() is None,'contender exited before identity')
    continue
   row=rows[0]
   require(row['role']=='supabase_admin' and row['database']=='postgres','contender identity')
   require(type(row['pid']) is int and row['pid']>0 and isinstance(row['started'],str),'contender identity shape')
   self.identities.append(row);return row
  raise RuntimeError('contender identity deadline')
 def commit(self,s):
  s['process'].stdin.write(b'COMMIT;\n');s['process'].stdin.close();s['process'].wait(timeout=3)
  require(s['process'].returncode==0,'contender commit failed')
 def cleanup(self):
  errors=[]
  # Even if one release fails, independently try every owned connection.
  for s in self.sessions:
   p=s['process']
   try:
    if p.stdin and not p.stdin.closed:p.stdin.write(b'ROLLBACK;\n');p.stdin.close()
   except Exception:errors.append('rollback')
  for s in self.sessions:
   p=s['process']
   try:p.wait(timeout=2)
   except Exception:
    identity=next((r for r in self.identities if r['marker']==s['marker']),None)
    if identity:
     try:self.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid="+str(identity['pid'])+" AND backend_start::text="+quote(identity['started'])+" AND application_name="+quote(identity['marker'])+" AND datname='postgres' AND usename='supabase_admin';")
     except Exception:errors.append('terminate')
    try:
     if p.poll() is None:p.kill()
    except Exception:errors.append('kill')
    try:p.wait(timeout=2)
    except Exception:errors.append('reap')
   for stream in (p.stdin,p.stdout):
    try:
     if stream and not stream.closed:stream.close()
    except Exception:errors.append('close')
  try:
   require(self.snapshots()==[],'owned backend remains')
   for r in self.identities:
    require(self.query('SELECT count(*) FROM pg_locks WHERE pid='+str(r['pid'])+';')=='0','owned locks remain')
  except Exception:errors.append('verification')
  return not errors

def run_order(h,holder_sql,expected_holder,waiter_sql,expected_waiter):
 pair=Pair(h);primary=None;report={'holder_result_verified':False,'same_waiter_observed':False,'winner_committed':False,'loser_result_verified':False,'cleanup_verified':False}
 phase='holder_start'
 try:
  holder=pair.start(holder_sql);phase='holder_result'
  require(pair.line(holder)==expected_holder,'holder operation failed');report['holder_result_verified']=True
  phase='holder_identity';hi=pair.identity(holder)
  phase='waiter_start';waiter=pair.start(waiter_sql)
  phase='waiter_identity';wi=pair.identity(waiter)
  phase='contention_observation'
  deadline=time.monotonic()+3
  while time.monotonic()<deadline:
   rows=pair.snapshots(min(2,max(.01,deadline-time.monotonic())))
   if time.monotonic()<=deadline and exact_wait(rows,hi,wi,holder['sql'],waiter['sql']):
    require(holder['process'].poll() is None and waiter['process'].poll() is None,'contender not pending');report['same_waiter_observed']=True;break
  require(report['same_waiter_observed'],'exact transaction wait not observed')
  phase='winner_commit';pair.commit(holder);report['winner_committed']=True
  phase='loser_result';require(pair.line(waiter)==expected_waiter,'loser result mismatch')
  phase='loser_commit';pair.commit(waiter);report['loser_result_verified']=True
 except BaseException as error:
  primary=error;report['failure']={'phase':phase,'category':category(error),'sqlstate':'unavailable'}
 finally:
  try:report['cleanup_verified']=pair.cleanup()
  except Exception:report['cleanup_verified']=False
 h.report.setdefault('transaction_orders',[]).append(report)
 if primary is not None:raise primary
 require(report['cleanup_verified'],'owned session cleanup uncertain')
 return report
