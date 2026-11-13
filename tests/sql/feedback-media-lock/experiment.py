"""Disposable completion-lock characterization. No production or deletion guarantee."""
import importlib.util,json,hashlib,uuid,secrets,base64,time,subprocess,selectors,sys,os
from pathlib import Path
import multiprocessing
spec=importlib.util.spec_from_file_location('observation',Path(__file__).parents[1]/'feedback-media-provenance/provenance.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
b=p.base
COMPILED={'storage/uploader':'ca2d0c3c5ebfcc87288bbce37e964caead2fd6910db405a5618ff3425a54b702','storage/database/pg':'5dd19ee62c62810fe0468434473beaeeb96af0ea54c0e31f2e7a49de8e717b7c','internal/hashing/string-to-int':'608f76b3aca24e7e17395e5dd0b8857919a60f82e90813057b967b41b0f3d630'}
def object_key(path):
 b.require(isinstance(path,str) and len(path.split('/'))==3 and all(str(uuid.UUID(x))==x for x in path.split('/')),'invalid synthetic path')
 h=5381
 for c in 'feedback-images/'+path:h=((h*33)^ord(c))&0xffffffff
 return h

def correspondence(rows):
 return all(any(r.get('path')=='/app/dist/'+name+'.js' and r.get('sha256')==sha for r in rows) for name,sha in COMPILED.items())

def upload_category(result):
 if result is None:return 'TRANSPORT_OR_REQUEST_TIMEOUT'
 status,body=result
 if status in (200,201):return 'ACCEPTED'
 try:data=json.loads(body)
 except (ValueError,UnicodeError):return 'OTHER_HTTP_FAILURE'
 # Native lock timeout and unknown 4xx MUST NOT become policy-denial evidence.
 if isinstance(data,dict) and data.get('code') in ('LockTimeout','DatabaseTimeout'):return 'NATIVE_LOCK_OR_DATABASE_TIMEOUT'
 if isinstance(data,dict) and data.get('code') in ('AccessDenied','Unauthorized') and status in (400,401,403):return 'KNOWN_PERMISSION_FAILURE'
 return 'OTHER_HTTP_FAILURE'

def response_diagnostic(result):
 if result is None:return {}
 try:data=json.loads(result[1])
 except (ValueError,UnicodeError):return {}
 if not isinstance(data,dict):return {}
 allowed={'AccessDenied','Unauthorized','LockTimeout','DatabaseTimeout','InternalError','NoSuchKey','InvalidRequest','not_found','Forbidden','Bad Request','UnauthorizedError'}
 safe={}
 for field in ('code','error'):
  value=data.get(field)
  if isinstance(value,str) and value in allowed:safe[field]=value
 value=data.get('statusCode')
 if type(value) is int and 100<=value<=599:safe['statusCode']=value
 elif isinstance(value,str) and len(value)==3 and value.isascii() and value.isdigit() and 100<=int(value)<=599:safe['statusCode']=int(value)
 return safe

class BoundedRequest:
 """Linux disposable child; parent owns total wall deadline and kill/reap."""
 def __init__(self,call,seconds=22,context=None,clock=time.monotonic):
  self.clock=clock;self.deadline=clock()+seconds
  ctx=context or multiprocessing.get_context('fork')
  self.reader,writer=ctx.Pipe(duplex=False)
  def run():
   self.reader.close()
   try:
    status,body=call()
    # IPC/evidence cap only: inherited HTTP read can allocate more before this cap.
    writer.send((status,body[:4096]) if len(body)<=4096 else None)
   except Exception:writer.send(None)
   finally:writer.close()
  self.process=ctx.Process(target=run,daemon=True);self.process.start();writer.close()
 def pending(self):return not self.reader.poll() and self.process.is_alive() and self.clock()<self.deadline
 def finish(self):
  try:
   if self.reader.poll(max(0,self.deadline-self.clock())):
    try:return self.reader.recv()
    except EOFError:return None
   return None
  finally:self.close()
 def close(self):
  try:
   if self.process.is_alive():self.process.kill()
   self.process.join(timeout=2)
   b.require(not self.process.is_alive(),'request child failed to retire')
  finally:self.reader.close()

def finalize_resources(release,request):
 # Always retire request; retain first cleanup failure if both fail.
 primary=None;released=False;terminal=None
 try:released=release()
 except Exception as error:primary=error
 try:terminal=request.finish() if request is not None else None
 except Exception:
  if primary is None:raise
 if primary is not None:raise primary
 return released,terminal

def observation_result(e):
 ordered=e['post_retirement_waiter'] and e['controller_released'] and e['retirement']=='COMMITTED'
 if ordered and e['upload']=='ACCEPTED':return 'COUNTEREXAMPLE; UPLOAD ACCEPTED AFTER ORDERED RETIREMENT; ACTIVATION BLOCKED'
 if ordered and e['upload']=='KNOWN_PERMISSION_FAILURE' and e['service_visibility']=='RECOGNIZED_ABSENCE' and e['metadata_count']==0 and e['reservation_count']==0 and e['queue_count']==1:
  return 'LOCAL STACK PASS; BOUNDED POLICY DENIAL OBSERVATION ONLY; ACTIVATION BLOCKED'
 return 'UNSUPPORTED; LOCK OBSERVATION INCONCLUSIVE; ACTIVATION BLOCKED'

def terminate_controller_sql(pid,marker,key):
 b.require(type(pid) is int and pid>0 and marker.startswith('irth_lock_') and len(marker)==42 and all(c in '0123456789abcdef' for c in marker[10:]),'invalid controller marker')
 b.require(type(key) is int and 0<=key<2**32,'invalid controller key')
 return f"SELECT pg_terminate_backend(a.pid) FROM pg_stat_activity a WHERE a.pid={pid} AND a.application_name='{marker}' AND a.datname=current_database() AND a.usename='supabase_admin' AND EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.granted AND l.classid=0 AND l.objid={key} AND l.objsubid=1);"

def exact_waiter(rows,expected_pid=None):
 if len(rows)!=1:return None
 row=rows[0]
 if row.get('role')!='supabase_storage_admin' or not all(row.get(k) is True for k in ('waiting','blocked','query','holder')):return None
 pid=row.get('pid')
 if type(pid) is not int or pid<=0 or (expected_pid is not None and pid!=expected_pid):return None
 return pid

class Experiment(p.Observation):
 def __init__(self):
  super().__init__();self.evidence=self.evidence.parent/'v18-feedback-media-lock';self.evidence.mkdir(mode=0o700,exist_ok=True)
 def admin_args(self):
  container=self.verify_admin_container()
  b.require(self.admin_socket in ('/tmp','/var/run/postgresql'),'unsupported admin route')
  script=('set -eu; test -n "${POSTGRES_PASSWORD:-}"; unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGUSER PGHOST PGPORT PGPASSFILE PGSSLMODE; export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -qAt -w -h '+self.admin_socket+' -p 5432 -U supabase_admin -d postgres -v ON_ERROR_STOP=1')
  return ['docker','exec','-i',container,'/bin/sh','-c',script]
 def bounded_sql(self,sql,timeout=3):
  try:
   result=subprocess.run(self.fixed_admin_args,input="SET statement_timeout='1200ms'; SET lock_timeout='600ms'; "+sql,text=True,capture_output=True,env=self.env,cwd=self.work,timeout=timeout)
   return result.returncode==0,result.stdout.strip()
  except subprocess.TimeoutExpired:return False,''
 def probe(self):
  # Keep original 44-case test unmodified, including terminal PUT-only cleanup.
  b.Harness.probe(self)
  self.report['terminal_contract_result']=self.report['result']
  self.report['result']='UNSUPPORTED; LOCK EXPERIMENT NOT COMPLETE'
  p.Observation.probe(self)
  b.require(correspondence(self.report['provenance']['files']),'named compiled correspondence mismatch')
  self.report['named_module_correspondence']='MATCHED: uploader, pg, string-to-int only'
  self.report['result']='UNSUPPORTED; LOCK EXPERIMENT NOT COMPLETE'
  self.report['not_proven']=['physical byte commit/erasure','full image or entrypoint attestation','late upload safety universally','retention SLA','trusted decode','production activation']
  email=f'lock-{uuid.uuid4()}@example.invalid';password=secrets.token_urlsafe(32)
  status,user=self.decoded(self.request('/auth/v1/admin/users',self.fields['service'],{'email':email,'password':password,'email_confirm':True},'POST',service=True));b.require(status in (200,201),'synthetic actor create failed')
  uid=str(uuid.UUID(user['id']))
  status,auth=self.decoded(self.request('/auth/v1/token?grant_type=password',payload={'email':email,'password':password},method='POST'));b.require(status==200,'synthetic actor login failed');token=auth['access_token']
  issue=str(uuid.uuid4());aid=str(uuid.uuid4());self.sql(f"INSERT INTO feedback_issues VALUES('{issue}','{uid}');")
  png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=')
  status,path=self.rpc('reserve_feedback_image',token,{'p_id':aid,'p_issue_id':issue,'p_internal':False,'p_mime':'image/png','p_bytes':len(png)})
  b.require(status==200 and path==f'{uid}/{issue}/{aid}','synthetic reservation mismatch');key=object_key(path)
  # A bigint advisory key has classid=high32=0, objid=unsigned32, objsubid=1.
  b.require(self.sql(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid={key} AND objsubid=1;")=='0','lock key collision')
  self.fixed_admin_args=self.admin_args() # verified once before the timed interval
  controller=None;pid=None;request=None;waiter_pid=None;controller_marker='irth_lock_'+uuid.uuid4().hex
  evidence={'waiter_observed':False,'post_retirement_waiter':False,'controller_released':False,'retirement':'NOT_ATTEMPTED','upload':'NOT_STARTED'};self.report['completion_lock']=evidence
  try:
   controller=subprocess.Popen(self.fixed_admin_args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,env=self.env,cwd=self.work)
   controller.stdin.write(f"SET application_name='{controller_marker}'; SET idle_in_transaction_session_timeout='7000ms'; SET statement_timeout='1000ms'; BEGIN; SELECT pg_advisory_xact_lock({key}::bigint); SELECT 'LOCK:'||pg_backend_pid();\n");controller.stdin.flush()
   deadline=time.monotonic()+3
   buffer=b''
   with selectors.DefaultSelector() as selector:
    selector.register(controller.stdout,selectors.EVENT_READ)
    while time.monotonic()<deadline:
     if not selector.select(max(0,deadline-time.monotonic())):break
     buffer+=os.read(controller.stdout.fileno(),4096)
     lines=buffer.decode('ascii').splitlines()
     found=[line[5:] for line in lines if line.startswith('LOCK:') and line[5:].isdigit()]
     if found:pid=int(found[0]);break
   b.require(pid is not None,'controller lock not reached')
   ok,held=self.bounded_sql(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted AND pid={pid} AND classid=0 AND objid={key} AND objsubid=1;")
   b.require(ok and held=='1','exact controller lock not held')
   start=time.monotonic()
   request=BoundedRequest(lambda:self.request('/storage/v1/object/feedback-images/'+path,token,method='POST',raw=png,mime='image/png'))
   waiter_sql=f"SELECT coalesce(json_agg(json_build_object('pid',l.pid,'role',a.usename,'waiting',a.wait_event_type='Lock' AND a.wait_event='advisory','blocked', {pid}=ANY(pg_blocking_pids(l.pid)),'holder',EXISTS(SELECT 1 FROM pg_locks h WHERE h.locktype='advisory' AND h.granted AND h.pid={pid} AND h.classid=0 AND h.objid={key} AND h.objsubid=1),'query',position('pg_advisory_xact_lock' in a.query)>0)), '[]'::json)::text FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND NOT l.granted AND l.classid=0 AND l.objid={key} AND l.objsubid=1 AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database());"
   while time.monotonic()-start<2.0 and request.pending():
    ok,raw=self.bounded_sql(waiter_sql,timeout=2)
    if not ok:break
    waiter_pid=exact_waiter(json.loads(raw))
    if waiter_pid is not None:
     evidence['waiter_observed']=True;break
    time.sleep(.02) # Poll observable predicate, never time-as-proof.
   if evidence['waiter_observed']:
    ok,_=self.bounded_sql(f"DELETE FROM feedback_issues WHERE id='{issue}';")
    evidence['retirement']='COMMITTED' if ok else 'BLOCKED_OR_SQL_TIMEOUT'
    if ok:
     checked,raw=self.bounded_sql(waiter_sql,timeout=2)
     evidence['post_retirement_waiter']=bool(checked and exact_waiter(json.loads(raw),waiter_pid) is not None and request.pending())
   else:evidence['retirement']='UNREACHED'
  finally:
   def release():
    try:
     if controller is not None and controller.poll() is None:
      try:controller.communicate('ROLLBACK;\n\\q\n',timeout=2)
      except (subprocess.TimeoutExpired,BrokenPipeError):
       if pid is not None:self.bounded_sql(terminate_controller_sql(pid,controller_marker,key),timeout=2)
       controller.kill();controller.communicate(timeout=2)
    finally:
     if controller is not None and controller.poll() is None:
      controller.kill()
      try:controller.wait(timeout=2)
      except subprocess.TimeoutExpired:pass
    if pid is None:return False
    ok,remaining=self.bounded_sql(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted AND pid={pid} AND classid=0 AND objid={key} AND objsubid=1;",timeout=2)
    return ok and remaining=='0'
   released,terminal=finalize_resources(release,request)
   evidence['controller_released']=released
   evidence['upload']=upload_category(terminal)
   evidence['http_status']=terminal[0] if terminal else None
   evidence['native_response']=response_diagnostic(terminal)
  visibility=BoundedRequest(lambda:self.request('/storage/v1/object/authenticated/feedback-images/'+path,self.fields['service']),seconds=5).finish()
  status,body=visibility or (0,b'')
  evidence['service_visibility']='EXACT_SYNTHETIC_BYTES' if (status,body)==(200,png) else ('RECOGNIZED_ABSENCE' if self.object_absent((status,body)) else 'OTHER_HTTP_RESULT')
  evidence['metadata_count']=int(self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='feedback-images' AND name='{path}';"))
  evidence['metadata_versions']=json.loads(self.sql(f"SELECT coalesce(json_agg(version::text),'[]'::json)::text FROM storage.objects WHERE bucket_id='feedback-images' AND name='{path}';"))
  evidence['reservation_count']=int(self.sql(f"SELECT count(*) FROM feedback_image_uploads WHERE id='{aid}';"))
  evidence['queue_count']=int(self.sql(f"SELECT count(*) FROM feedback_image_delete_queue WHERE id='{aid}' AND object_path='{path}';"))
  evidence['queue_acknowledged']=False
  # Observation completion is not a deletion-safety acceptance claim.
  self.report['result']=observation_result(evidence)


if __name__=='__main__':
 try:
  h=Experiment()
  if sys.argv[1:] == ['cleanup']:h.cleanup()
  elif sys.argv[1:] == ['run']:sys.exit(h.run())
  else:raise b.Failure('invalid action')
 except Exception:
  print('Disposable lock preflight/cleanup failed; details withheld',file=sys.stderr);sys.exit(1)
