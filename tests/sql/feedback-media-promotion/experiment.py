"""Real disposable SQL/Auth/Storage worker prototype; never a deployment."""
import importlib.util,hashlib,json,os,secrets,sys,uuid
from pathlib import Path

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
base=module('decode_boundary',Path(__file__).parents[1]/'feedback-media-decode/experiment.py')
w=module('promotion_worker',Path(__file__).with_name('worker.py'))
b=base.b
class Experiment(base.Experiment):
 Q,C=base.Q,base.C
 require=staticmethod(b.require);bound_decode=staticmethod(base.bound_decode)
 def __init__(self):
  super().__init__();self.evidence=Path(os.environ['RUNNER_TEMP'])/'v18-feedback-media-promotion';self.evidence.mkdir(mode=0o700,exist_ok=True)
 def call(self,name,token,payload,service=False):
  b.require(name in ('fixture_worker','fixture_finalize'),'unexpected fixture RPC')
  return self.decoded(self.request('/rest/v1/rpc/'+name,token,payload,'POST',service=service))
 def worker(self,op,p):
  status,result=self.call('fixture_worker',self.fields['service'],{'op':op,'p':p},True)
  b.require(status==200,'worker RPC failed');return result
 def finalize(self,actor,a,mid=None,body='canonical',inside=None):
  return self.call('fixture_finalize',actor[1],{'mid':mid or str(uuid.uuid4()),'aid':a['aid'],'body':body,'inside':a['internal'] if inside is None else inside})
 def check_denied(self,result,label):
  self.check(result[0]>=400 and result[0]<500 and isinstance(result[1],dict) and result[1].get('code') in ('42501','P0001'),label)
 def decode_probe(self):
  super().decode_probe();self.report['decode_baseline_result']=self.report['result'];self.report['result']='FAIL'
  fixture=Path(__file__).with_name('fixture.sql').read_bytes();self.sql(fixture.decode());self.sql("NOTIFY pgrst,'reload schema';")
  self.report['promotion_fixture_sha256']=hashlib.sha256(fixture).hexdigest()
  self.report['worker_sha256']=hashlib.sha256(Path(__file__).with_name('worker.py').read_bytes()).hexdigest()
  self.report['stage']='actual attestation and publication'
  actors=[]
  for n in range(3):
   email=f'promotion-{uuid.uuid4()}@example.invalid';password=secrets.token_urlsafe(32)
   status,data=self.decoded(self.request('/auth/v1/admin/users',self.fields['service'],{'email':email,'password':password,'email_confirm':True},'POST',service=True));b.require(status in (200,201),'actor create')
   uid=str(uuid.UUID(data['id']));status,data=self.decoded(self.request('/auth/v1/token?grant_type=password',payload={'email':email,'password':password},method='POST'));b.require(status==200,'actor login');actors.append((uid,data['access_token']))
  owner,other,staff=actors;self.sql(f"INSERT INTO public.user_roles VALUES('{staff[0]}','fixture_staff');")
  raw=base.subprocess.run(['node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write(await sharp({create:{width:3,height:2,channels:3,background:'#246810'}}).png().toBuffer());"],cwd=base.ROOT,env={'PATH':os.environ.get('PATH',''),'LANG':'C'},capture_output=True,timeout=8,check=True).stdout
  revision=hashlib.sha256((base.ROOT/'tests/media-decoder/child.mjs').read_bytes()).hexdigest()
  def attempt(internal=False,reservation=None):
   a={'rid':reservation or str(uuid.uuid4()),'aid':str(uuid.uuid4()),'token':str(uuid.uuid4()),'owner':owner[0],'issue':str(uuid.uuid4()),'internal':internal,'input':hashlib.sha256(raw).hexdigest(),'revision':revision}
   if reservation is None:self.worker('reserve',a)
   a['key']=self.worker('claim',a);a['source']=owner[0]+'/'+str(uuid.uuid4())
   self.check(self.storage(self.Q,a['source'],owner[1],'POST',raw)[0] in (200,201),'owner upload positive')
   return a
  def unreadable(actor,a,label):
   result=self.storage(self.C,a['key'],actor[1]);self.check(base.permission(result) or self.object_absent(result),label)
  a=attempt();self.check_denied(self.finalize(owner,a),'unattested finalize denied')
  for actor in actors:
   self.check_denied(self.call('fixture_worker',actor[1],{'op':'terminal','p':a}),'actor worker RPC denied')
   for method in ('POST','PATCH'):
    status,data=self.decoded(self.request('/rest/v1/fixture_promotion_receipts',actor[1],{'id':a['aid'],'output_digest':'0'*64},method))
    self.check(status==403 and data.get('code')=='42501','actor direct receipt mutation denied')
  self.check(w.process(self,a) is True,'actual worker attested canonical')
  self.check_denied(self.finalize(other,a),'other owner publication denied')
  unreadable(owner,a,'attestation alone unreadable')
  mid=str(uuid.uuid4());self.check(self.finalize(owner,a,mid)==(200,mid),'owner publishes attested output')
  self.check(self.finalize(owner,a,mid)==(200,mid),'identical publication idempotent')
  self.check_denied(self.finalize(owner,a,mid,'changed'),'changed message replay denied')
  expected=self.storage(self.C,a['key'],self.fields['service']);self.check(expected[0]==200,'service canonical positive')
  for actor in (owner,staff):self.check(self.storage(self.C,a['key'],actor[1])==expected,'published intended actor exact canonical bytes')
  unreadable(other,a,'other owner canonical denied')
  self.check(self.worker('cleanup',dict(a,key=a['key'])) is None,'published cleanup forbidden')
  self.worker('retire',a)
  for actor in actors:unreadable(actor,a,'retired canonical denied')
  self.check_denied(self.finalize(owner,a,mid),'retired replay denied')
  self.check(self.worker('cleanup',a)==a['key'],'retired exact cleanup claim')
  status,_=self.request('/storage/v1/object/'+self.C,self.fields['service'],{'prefixes':[a['key']]},'DELETE',service=True);self.check(status==200,'exact canonical delete')
  self.check(self.object_absent(self.storage(self.C,a['key'],self.fields['service'])),'canonical recognized absence')
  self.check(self.worker('removed',a) is True,'removal observation retained')
  self.check(self.sql(f"SELECT cleanup_due AND cleaning AND removal_observed FROM promotion_model.attempt WHERE id='{a['aid']}';")=='t','durable cleanup intent not erased')
  internal=attempt(True);self.check(w.process(self,internal) is True,'internal canonical attested')
  self.check_denied(self.finalize(owner,internal),'owner internal publication denied');mid=str(uuid.uuid4());self.check(self.finalize(staff,internal,mid)==(200,mid),'staff internal publishes')
  self.check(self.storage(self.C,internal['key'],staff[1])==self.storage(self.C,internal['key'],self.fields['service']),'staff internal exact read')
  for actor in (owner,other):unreadable(actor,internal,'player internal denied')
  stale=attempt();self.check(w.process(self,stale,lambda:self.worker('retire',stale)) is False,'retire after terminal PUT fences attestation')
  self.check_denied(self.finalize(owner,stale),'stale finalize denied')
  crash=attempt()
  class Crash(Exception):pass
  try:w.process(self,crash,lambda:(_ for _ in ()).throw(Crash()))
  except Crash:pass
  else:raise b.Failure('crash control missing')
  self.check(self.sql(f"SELECT state='WRITING' AND cleanup_due FROM promotion_model.attempt WHERE id='{crash['aid']}';")=='t','observed PUT crash retains unresolved intent')
  self.check(self.worker('cleanup',dict(crash,abandon=True)) is None,'unresolved writer cannot clean')
  self.worker('retire',crash)
  self.request('/storage/v1/object/'+self.C,self.fields['service'],{'prefixes':[crash['key']]},'DELETE',service=True)
  self.check(self.object_absent(self.storage(self.C,crash['key'],self.fields['service'])),'crash object absence sampled')
  self.check(self.worker('removed',crash) is False,'404 cannot acknowledge unresolved writer')
  self.check(self.sql(f"SELECT cleanup_due AND NOT removal_observed FROM promotion_model.attempt WHERE id='{crash['aid']}';")=='t','unknown intent survives404')
  # Terminal success without attestation: challenge each bound field before publication.
  candidate=attempt();output=self.bound_decode(raw,candidate['input']);self.check(self.worker('start',candidate) is True,'candidate start')
  self.check(self.storage(self.C,candidate['key'],self.fields['service'],'POST',output)[0] in (200,201),'candidate PUT')
  self.check(self.storage(self.C,candidate['key'],self.fields['service'])==(200,output),'candidate verified bytes')
  receipt=dict(candidate,success=True,output=hashlib.sha256(output).hexdigest(),bytes=len(output))
  self.check(self.worker('terminal',receipt) is True,'candidate terminal')
  for field,value in (('token',str(uuid.uuid4())),('owner',other[0]),('issue',str(uuid.uuid4())),('internal',True),('input','0'*64),('output','0'*64),('revision','wrong'),('bytes',len(output)+1)):
   self.check(self.worker('attest',dict(receipt,**{field:value})) is False,'mismatched attestation denied')
  self.check(self.worker('cleanup',dict(candidate,key=internal['key'],abandon=True)) is None,'cleanup wrong key denied')
  self.check(self.worker('cleanup',dict(candidate,abandon=True))==candidate['key'],'cleanup first irreversible claim')
  self.check(self.worker('attest',receipt) is False,'cleanup first fences later publication')
  self.check(self.storage(self.C,internal['key'],staff[1])==self.storage(self.C,internal['key'],self.fields['service']),'unrelated successor bytes unaffected')
  replacement=attempt();new=dict(replacement,aid=str(uuid.uuid4()),token=str(uuid.uuid4()))
  self.worker('claim',new)
  self.check(w.process(self,replacement) is False,'new generation prevents stale output write')
  self.report['result']='LOCAL STACK PASS; SYNTHETIC WORKER PUBLICATION ONLY; ACTIVATION BLOCKED'
if __name__=='__main__':
 try:
  h=Experiment()
  if sys.argv[1:]==['run']:sys.exit(h.run())
  elif sys.argv[1:]==['cleanup']:h.cleanup()
  else:raise b.Failure('invalid action')
 except Exception:print('Disposable promotion preflight failed; details withheld',file=sys.stderr);sys.exit(1)
