"""Disposable native Storage / real decoder boundary, not an attachment worker."""
import importlib.util,hashlib,json,os,secrets,subprocess,sys,uuid,multiprocessing,time,signal,urllib.request,urllib.error
from pathlib import Path
spec=importlib.util.spec_from_file_location('base_media',Path(__file__).parents[1]/'feedback-private-images-local-supabase/harness.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
MAX=2097152
Q='fixture-decode-quarantine';C='fixture-decode-canonical'
ROOT=Path(__file__).resolve().parents[3]
def permission(result):
 status,body=result
 try:data=json.loads(body)
 except (ValueError,UnicodeError):return False
 return status in (400,401,403) and isinstance(data,dict) and data.get('code') in ('AccessDenied','Unauthorized')
def finish_child(process):
 errors=[]
 try:
  if process.is_alive():process.kill()
 except Exception:errors.append('kill')
 try:process.join(timeout=2)
 except Exception:errors.append('join')
 try:
  if process.is_alive():errors.append('reap')
 except Exception:errors.append('state')
 return not errors

def bounded(call,seconds=8):
 # Fixed shared memory avoids Pipe.poll() followed by a blocking partial-frame recv.
 ctx=multiprocessing.get_context('fork')
 payload=ctx.RawArray('B',MAX);length=ctx.RawValue('i',-1);status=ctx.RawValue('i',0)
 def child():
  try:
   code,body=call()
   if type(code) is not int or not 100<=code<=599 or type(body) is not bytes or len(body)>MAX:return
   payload[:len(body)]=body;status.value=code;length.value=len(body)
  except Exception:pass
 process=ctx.Process(target=child,daemon=True)
 primary=None;result=None
 try:
  process.start();process.join(timeout=seconds)
  b.require(not process.is_alive(),'bounded local request deadline')
  b.require(process.exitcode==0 and 0<=length.value<=MAX and 100<=status.value<=599,'bounded local request failed')
  result=(status.value,bytes(payload[:length.value]))
 except BaseException as error:primary=error
 finally:
  clean=finish_child(process)
 if not clean:
  if primary is not None:
   primary.cleanup_uncertain=True
   raise primary
  raise b.Failure('bounded local request cleanup uncertain')
 if primary is not None:raise primary
 return result

def bound_decode(raw,expected_sha):
 b.require(type(raw) is bytes and isinstance(expected_sha,str) and hashlib.sha256(raw).hexdigest()==expected_sha,'trusted input digest mismatch')
 return decode(raw)

def finish_decoder(process):
 errors=[]
 try:os.killpg(process.pid,signal.SIGKILL)
 except ProcessLookupError:pass
 except Exception:errors.append('kill')
 try:process.wait(timeout=2)
 except Exception:errors.append('reap')
 for stream in (process.stdin,process.stdout):
  try:
   if stream:stream.close()
  except Exception:errors.append('close')
 return not errors

def decode(raw):
 b.require(type(raw) is bytes and 0<len(raw)<=MAX,'decoder input invalid')
 process=subprocess.Popen(['node',str(Path(__file__).with_name('decode.mjs'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
  env={'PATH':os.environ.get('PATH',''),'LANG':'C'},cwd=ROOT,start_new_session=True)
 primary=None;result=None
 try:
  output,_=process.communicate(raw,timeout=8)
  b.require(process.returncode in (0,2),'decoder infrastructure failed')
  if process.returncode==0:
   b.require(0<len(output)<=MAX,'decoder output invalid');result=output
 except BaseException as error:primary=error
 finally:clean=finish_decoder(process)
 if not clean:
  if primary is not None:
   primary.cleanup_uncertain=True
   raise primary
  raise b.Failure('decoder cleanup uncertain')
 if primary is not None:raise primary
 return result

class Experiment(b.Harness):
 def __init__(self):
  super().__init__();self.evidence=Path(os.environ['RUNNER_TEMP'])/'v18-feedback-media-decode';self.evidence.mkdir(mode=0o700,exist_ok=True)
 def probe(self):
  try:self.decode_probe()
  except BaseException as error:
   if getattr(error,'cleanup_uncertain',False):self.report['probe_cleanup_uncertain']=True
   raise
 def storage(self,bucket,path,token,method='GET',raw=None):
  b.require(bucket in (Q,C),'unexpected bucket')
  b.require(len(path.split('/'))==2 and all(str(uuid.UUID(x))==x for x in path.split('/')),'unexpected object path')
  self.isolation();b.require(self.endpoints_verified,'unverified local services')
  route='/storage/v1/object/'+('authenticated/' if method=='GET' else '')+bucket+'/'+path
  headers={'apikey':self.fields['anon'],'Authorization':'Bearer '+token,'Content-Type':'image/png' if bucket==Q else 'image/jpeg'}
  def request():
   req=urllib.request.Request(self.fields['api']+route,data=raw,headers=headers,method=method)
   try:
    with self.http.open(req,timeout=5) as response:status,body=response.status,response.read(MAX+1)
   except urllib.error.HTTPError as error:status,body=error.code,error.read(MAX+1)
   b.require(len(body)<=MAX,'local response over limit');return status,body
  return bounded(request)
 def decode_probe(self):
  super().probe();self.report['baseline_result']=self.report['result'];self.report['result']='FAIL; DECODE BOUNDARY PENDING'
  self.report['stage']='synthetic decode buckets'
  self.sql(f"INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('{Q}','{Q}',false,{MAX}),('{C}','{C}',false,{MAX}); CREATE POLICY fixture_decode_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='{Q}' AND (storage.foldername(name))[1]=auth.uid()::text); ")
  actors=[]
  for n in range(3):
   email=f'decode-{uuid.uuid4()}@example.invalid';password=secrets.token_urlsafe(32)
   status,body=self.decoded(self.request('/auth/v1/admin/users',self.fields['service'],{'email':email,'password':password,'email_confirm':True},'POST',service=True));b.require(status in (200,201),'synthetic actor create')
   uid=str(uuid.UUID(body['id']))
   status,body=self.decoded(self.request('/auth/v1/token?grant_type=password',payload={'email':email,'password':password},method='POST'));b.require(status==200,'synthetic actor login')
   actors.append((uid,body['access_token']))
  self.sql(f"INSERT INTO public.user_roles VALUES('{actors[2][0]}','fixture_staff');")
  self.report['stage']='real decoder positive fixture'
  # Generate a valid synthetic PNG through installed Sharp, not authored/user media.
  raw=subprocess.run(['node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write(await sharp({create:{width:3,height:2,channels:3,background:'#123456'}}).png().toBuffer());"],cwd=ROOT,env={'PATH':os.environ.get('PATH',''),'LANG':'C'},capture_output=True,timeout=8,check=True).stdout
  decoded=decode(raw);b.require(decoded is not None,'valid synthetic decode failed')
  uid,token=actors[0];path=uid+'/'+str(uuid.uuid4());service=self.fields['service']
  self.check(self.storage(Q,path,token,'POST',raw)[0] in (200,201),'owner quarantine upload')
  result=self.storage(Q,path,token);self.check(permission(result) or self.object_absent(result),'owner quarantine unreadable')
  fetched=self.storage(Q,path,service);self.check(fetched==(200,raw),'service quarantine exact bytes')
  self.check(hashlib.sha256(fetched[1]).digest()==hashlib.sha256(raw).digest(),'trusted fixture input digest binding')
  canonical=bound_decode(fetched[1],hashlib.sha256(raw).hexdigest());self.check(canonical==decoded and canonical!=raw,'real decoder canonical bytes')
  target=uid+'/'+str(uuid.uuid4())
  self.report['stage']='canonical service write and actor isolation'
  self.check(self.storage(C,target,service,'POST',canonical)[0] in (200,201),'service immutable canonical upload')
  self.check(self.storage(C,target,service)==(200,canonical),'service canonical exact byte read')
  for actor,actor_token in actors:
   ownpath=actor+'/'+str(uuid.uuid4())
   self.check(self.storage(Q,ownpath,actor_token,'POST',raw)[0] in (200,201),'actor quarantine route positive')
   result=self.storage(Q,ownpath,actor_token);self.check(permission(result) or self.object_absent(result),'actor quarantine unreadable')
   self.check(permission(self.storage(C,ownpath,actor_token,'POST',canonical)),'actor canonical creation permission denied')
   self.check(permission(self.storage(C,target,actor_token,'PUT',canonical)),'actor canonical overwrite permission denied')
   result=self.storage(C,target,actor_token)
   self.check(permission(result) or self.object_absent(result),'actor canonical content not exposed')
  self.check(self.storage(C,target,service)==(200,canonical),'canonical unchanged after actor probes')
  self.report['stage']='malformed quarantine real decoder rejection'
  before=self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='{C}';")
  for invalid in (b'not-a-png',raw[:20]):
   bad=uid+'/'+str(uuid.uuid4())
   self.check(self.storage(Q,bad,token,'POST',invalid)[0] in (200,201),'MIME matching malformed quarantine accepted as bytes')
   status,body=self.storage(Q,bad,service);self.check(status==200 and body==invalid,'malformed service fetch exact')
   self.check(bound_decode(body,hashlib.sha256(invalid).hexdigest()) is None,'actual decoder rejects malformed quarantine')
  self.check(self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='{C}';")==before,'rejected decodes add no canonical object')
  self.report['decoder_sources']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'tests/media-decoder/runner.mjs',ROOT/'tests/media-decoder/child.mjs',Path(__file__).with_name('decode.mjs'))}
  self.report['result']='LOCAL STACK PASS; DECODED BYTE ISOLATION ONLY; ACTIVATION BLOCKED'
if __name__=='__main__':
 try:
  h=Experiment()
  if sys.argv[1:]==['run']:sys.exit(h.run())
  elif sys.argv[1:]==['cleanup']:h.cleanup()
  else:raise b.Failure('invalid action')
 except Exception:print('Disposable decode preflight failed; details withheld',file=sys.stderr);sys.exit(1)
