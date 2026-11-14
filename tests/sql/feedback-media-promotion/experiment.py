"""Real disposable SQL/Auth/Storage worker prototype; never a deployment."""
import importlib.util,hashlib,json,os,secrets,sys,uuid
from pathlib import Path

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
base=module('decode_boundary',Path(__file__).parents[1]/'feedback-media-decode/experiment.py')
w=module('promotion_worker',Path(__file__).with_name('worker.py'))
c=module('promotion_concurrency',Path(__file__).with_name('concurrency.py'))
b=base.b
def receipt_request(method,aid):
 b.require(method in ('POST','PATCH'),'invalid receipt method')
 b.require(str(uuid.UUID(aid))==aid,'invalid receipt identity')
 path='/rest/v1/fixture_promotion_receipts'
 if method=='PATCH':path+='?id=eq.'+aid
 return path,{'id':aid,'output_digest':'0'*64}

def receipt_diagnostic(actor_index,method,status,data):
 b.require(type(actor_index) is int and 0<=actor_index<=2 and method in ('POST','PATCH'),'invalid receipt diagnostic scope')
 code=data.get('code') if isinstance(data,dict) else None
 return {'actor_index':actor_index,'method':method,'http_status':status if type(status) is int and 100<=status<=599 else None,
         'code':code if code in ('42501','21000','P0001','PGRST100','PGRST102','PGRST204','PGRST205') else 'OTHER'}

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
 def remove_input(self,source):
  b.require(len(source.split('/'))==2 and all(str(uuid.UUID(x))==x for x in source.split('/')),'invalid cleanup key')
  status,_=self.request('/storage/v1/object/'+self.Q,self.fields['service'],{'prefixes':[source]},'DELETE',service=True)
  b.require(status==200,'input removal failed')
 def input_metadata_absent(self,source):
  b.require(len(source.split('/'))==2 and all(str(uuid.UUID(x))==x for x in source.split('/')),'invalid cleanup key')
  return self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='{self.Q}' AND name='{source}';")=='0'
 def storage(self,bucket,path,token,method='GET',raw=None):
  if bucket!='feedback-images-canonical':return super().storage(bucket,path,token,method,raw)
  b.require(len(path.split('/'))==2 and all(str(uuid.UUID(x))==x for x in path.split('/')),'invalid canonical key')
  self.isolation();b.require(self.endpoints_verified,'unverified local services')
  route='/storage/v1/object/'+('authenticated/' if method=='GET' else '')+bucket+'/'+path
  def request():
   req=base.urllib.request.Request(self.fields['api']+route,data=raw,headers={'apikey':self.fields['anon'],'Authorization':'Bearer '+token,'Content-Type':'image/jpeg'},method=method)
   try:
    with self.http.open(req,timeout=5) as response:status,body=response.status,response.read(base.MAX+1)
   except base.urllib.error.HTTPError as error:status,body=error.code,error.read(base.MAX+1)
   b.require(len(body)<=base.MAX,'canonical response limit');return status,body
  return base.bounded(request)
 def client(self,actor,mid,expect,expected=None,stale=None):
  self.isolation();b.require(self.endpoints_verified,'unverified client endpoint')
  data={'api':self.fields['api'],'anon':self.fields['anon'],'token':actor[1],'uid':actor[0],'mid':mid,'expect':expect,'expected':expected,'stale':stale}
  r=base.subprocess.run(['node',str(Path(__file__).with_name('client.mjs'))],input=json.dumps(data).encode(),cwd=base.ROOT,env={'PATH':os.environ.get('PATH',''),'LANG':'C'},capture_output=True,timeout=20)
  b.require(r.returncode==0 and len(r.stdout)<2048,'actual canonical client failed');result=json.loads(r.stdout)
  self.check(result['result']=={'valid':'canonical_verified','denied':'descriptor_denied','retired':'retired_denied'}[expect],'actual actor SDK canonical contract '+expect)
  return result.get('descriptor')
 def decode_probe(self):
  super().decode_probe();self.report['decode_baseline_result']=self.report['result'];self.report['result']='FAIL'
  self.C='feedback-images-canonical'
  self.sql("INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('feedback-images-canonical','feedback-images-canonical',false,2097152);")
  fixture=Path(__file__).with_name('fixture.sql').read_bytes();self.sql(fixture.decode());self.sql("NOTIFY pgrst,'reload schema';")
  self.report['promotion_fixture_sha256']=hashlib.sha256(fixture).hexdigest()
  self.report['canonical_client_sources']={p:hashlib.sha256((base.ROOT/p).read_bytes()).hexdigest() for p in ('src/lib/feedback/canonical-image-contract.ts','tests/sql/feedback-media-promotion/client.mjs')}
  self.report['worker_sha256']=hashlib.sha256(Path(__file__).with_name('worker.py').read_bytes()).hexdigest()
  self.report['stage']='actual attestation and publication'
  actors=[];credentials={}
  for n in range(3):
   email=f'promotion-{uuid.uuid4()}@example.invalid';password=secrets.token_urlsafe(32)
   status,data=self.decoded(self.request('/auth/v1/admin/users',self.fields['service'],{'email':email,'password':password,'email_confirm':True},'POST',service=True));b.require(status in (200,201),'actor create')
   uid=str(uuid.UUID(data['id']));status,data=self.decoded(self.request('/auth/v1/token?grant_type=password',payload={'email':email,'password':password},method='POST'));b.require(status==200,'actor login');actors.append((uid,data['access_token']));credentials[uid]=(email,password)
  owner,other,staff=actors;self.sql(f"INSERT INTO public.user_roles VALUES('{staff[0]}','fixture_staff');")
  raw=base.subprocess.run(['node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write(await sharp({create:{width:3,height:2,channels:3,background:'#246810'}}).png().toBuffer());"],cwd=base.ROOT,env={'PATH':os.environ.get('PATH',''),'LANG':'C'},capture_output=True,timeout=8,check=True).stdout
  revision=hashlib.sha256((base.ROOT/'tests/media-decoder/child.mjs').read_bytes()).hexdigest()
  def attempt(internal=False,reservation=None,input_bytes=None,terminal=True):
   content=raw if input_bytes is None else input_bytes
   a={'rid':reservation or str(uuid.uuid4()),'aid':str(uuid.uuid4()),'token':str(uuid.uuid4()),'owner':owner[0],'issue':str(uuid.uuid4()),'internal':internal,'input':hashlib.sha256(content).hexdigest(),'revision':revision}
   if reservation is None:self.worker('reserve',a)
   a['key']=self.worker('claim',a);a['source_id']=str(uuid.uuid4());a['source']=owner[0]+'/'+a['source_id']
   self.check(self.worker('input_begin',a) is True,'durable exact input intent before upload')
   self.check(self.storage(self.Q,a['source'],owner[1],'POST',content)[0] in (200,201),'owner upload positive')
   if terminal:
    self.check(self.storage(self.Q,a['source'],self.fields['service'])==(200,content),'testbench terminal PUT plus exact service read')
    self.check(self.worker('input_terminal',a) is True,'testbench terminal writer receipt')
   return a
  def unreadable(actor,a,label):
   result=self.storage(self.C,a['key'],actor[1]);self.check(base.permission(result) or self.object_absent(result),label)
  a=attempt();self.client(owner,str(uuid.uuid4()),'denied')
  for actor in actors:self.check(base.permission(self.storage(self.C,actor[0]+'/'+str(uuid.uuid4()),actor[1],'POST',raw)),'v1 canonical actor write denied')
  self.check_denied(self.finalize(owner,a),'unattested finalize denied')
  for actor_index,actor in enumerate(actors):
   self.check_denied(self.call('fixture_worker',actor[1],{'op':'terminal','p':a}),'actor worker RPC denied')
   for method in ('POST','PATCH'):
    self.check(self.sql(f"SELECT count(*) FROM promotion_model.attempt WHERE id='{a['aid']}';")=='1','exact target receipt exists before actor mutation')
    path,payload=receipt_request(method,a['aid'])
    before=self.sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'[]')) FROM promotion_model.attempt a;")
    status,data=self.decoded(self.request(path,actor[1],payload,method))
    diagnostic=receipt_diagnostic(actor_index,method,status,data)
    diagnostic['receipts_unchanged']=self.sql("SELECT md5(coalesce(jsonb_agg(to_jsonb(a) ORDER BY id)::text,'[]')) FROM promotion_model.attempt a;")==before
    self.report.setdefault('receipt_mutations',[]).append(diagnostic)
    self.check(diagnostic['receipts_unchanged'],'receipt state unchanged after denied actor mutation')
    self.check(status==403 and data.get('code')=='42501','actor direct receipt mutation denied')
  self.check(w.process(self,a) is True,'actual worker attested canonical')
  self.check_denied(self.finalize(other,a),'other owner publication denied')
  unreadable(owner,a,'attestation alone unreadable')
  mid=str(uuid.uuid4());self.check(self.finalize(owner,a,mid)==(200,mid),'owner publishes attested output')
  self.check(self.finalize(owner,a,mid)==(200,mid),'identical publication idempotent')
  self.check_denied(self.finalize(owner,a,mid,'changed'),'changed message replay denied')
  expected=self.storage(self.C,a['key'],self.fields['service']);self.check(expected[0]==200,'service canonical positive')
  for actor in (owner,staff):self.check(self.storage(self.C,a['key'],actor[1])==expected,'published intended actor exact canonical bytes')
  digest=hashlib.sha256(expected[1]).hexdigest()
  descriptor=self.client(owner,mid,'valid',digest)
  self.client(staff,mid,'valid',digest);self.client(other,mid,'denied')
  unreadable(other,a,'other owner canonical denied')
  self.check(w.cleanup_input(self,a) is True,'published original quarantine removed')
  self.check(self.storage(self.C,a['key'],owner[1])==expected,'canonical remains readable after original cleanup')
  self.check(base.permission(self.storage(self.Q,a['source'],owner[1],'POST',raw)),'cleaned original reupload denied')
  self.check(self.worker('cleanup',dict(a,key=a['key'])) is None,'published cleanup forbidden')
  self.worker('retire',a)
  self.client(owner,mid,'retired',stale=descriptor)
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
  for actor in (owner,other):
   unreadable(actor,internal,'player internal denied');self.client(actor,mid,'denied')
  self.client(staff,mid,'valid',hashlib.sha256(self.storage(self.C,internal['key'],self.fields['service'])[1]).hexdigest())
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
  bad=attempt(input_bytes=b'not-a-png')
  self.check(w.process(self,bad) is False,'trusted validation rejection retires input')
  self.check(w.cleanup_input(self,bad) is True,'rejected original exact cleanup')
  retired=attempt();self.worker('retire',retired)
  try:w.cleanup_input(self,retired,lambda:(_ for _ in ()).throw(Crash()))
  except Crash:pass
  else:raise b.Failure('cleanup crash control missing')
  self.check(self.sql(f"SELECT positive_seen AND cleaning AND NOT removal_observed FROM promotion_model.input_intent WHERE aid='{retired['aid']}';")=='t','delete response crash retains intent')
  self.check(w.cleanup_input(self,retired) is True,'recognized absence retry uses durable positive receipt')
  self.check(w.cleanup_input(self,retired) is True,'completed original cleanup repeat idempotent')
  unknown=attempt(terminal=False);self.worker('retire',unknown)
  self.remove_input(unknown['source']) # Deliberate fixture cut, not cleanup-worker eligibility.
  self.check(self.object_absent(self.storage(self.Q,unknown['source'],self.fields['service'])),'unknown writer fixture absence sampled')
  self.check(w.cleanup_input(self,unknown) is False,'unknown writer404 not cleanup eligible')
  self.check(self.worker('input_removed',unknown) is False,'unknown writer404 no acknowledgement')
  self.check(self.sql(f"SELECT writer_state='WRITING' AND NOT removal_observed FROM promotion_model.input_intent WHERE aid='{unknown['aid']}';")=='t','unknown writer intent retained')
  held=attempt()
  def retire_and_clean():
   self.worker('retire',held);self.check(w.cleanup_input(self,held) is True,'cleanup during prefetched decode')
  self.check(w.process(self,held,after_decode=retire_and_clean) is False,'prefetched decode cannot start after cleanup')
  self.check(self.object_absent(self.storage(self.C,held['key'],self.fields['service'])),'no stale canonical output after input cleanup')
  wrong=attempt();self.worker('retire',wrong)
  self.check(w.cleanup_input(self,dict(wrong,source=internal['key'])) is False,'canonical key cannot substitute input cleanup key')
  self.check(self.storage(self.C,internal['key'],staff[1])==self.storage(self.C,internal['key'],self.fields['service']),'wrong input cleanup leaves canonical unchanged')
  self.report['stage']='two contender canonical transaction ordering'
  def ready_candidate():
   item=attempt();output=self.bound_decode(raw,item['input'])
   self.check(self.worker('start',item) is True,'concurrent candidate admitted')
   self.check(self.storage(self.C,item['key'],self.fields['service'],'POST',output)[0] in (200,201),'concurrent candidate PUT terminal')
   self.check(self.storage(self.C,item['key'],self.fields['service'])==(200,output),'concurrent candidate exact service bytes')
   item=dict(item,output=hashlib.sha256(output).hexdigest(),bytes=len(output),success=True)
   self.check(self.worker('terminal',item) is True,'concurrent candidate terminal receipt')
   return item,output
  def publication_sql(item):
   values=[item[k] for k in ('aid','token','input','output','revision','owner','issue')]
   return 'SELECT promotion_model.publish('+','.join(c.quote(v) for v in values)+',false)'
  def cleanup_sql(item):
   return 'SELECT promotion_model.claim_cleanup('+c.quote(item['aid'])+','+c.quote(item['key'])+',true)'
  first,first_bytes=ready_candidate()
  c.run_order(self,publication_sql(first),'t',cleanup_sql(first),'')
  self.check(self.sql(f"SELECT r.accepted=a.id AND r.generation=a.generation AND NOT a.cleaning AND NOT a.cleanup_due FROM promotion_model.reservation r JOIN promotion_model.attempt a ON a.reservation_id=r.id WHERE a.id='{first['aid']}';")=='t','publish first persists accepted candidate without cleanup mutation')
  mid=str(uuid.uuid4());self.check(self.finalize(owner,first,mid)==(200,mid),'publish first actor finalization')
  self.check(self.storage(self.C,first['key'],owner[1])==(200,first_bytes),'publish first actual owner byte read')
  second,second_bytes=ready_candidate()
  c.run_order(self,cleanup_sql(second),second['key'],publication_sql(second),'f')
  self.check(self.sql(f"SELECT a.cleaning AND a.cleanup_due AND r.accepted IS NULL AND r.generation>a.generation AND NOT EXISTS(SELECT 1 FROM promotion_model.publication WHERE attempt_id=a.id) FROM promotion_model.reservation r JOIN promotion_model.attempt a ON a.reservation_id=r.id WHERE a.id='{second['aid']}';")=='t','cleanup first persists irreversible unpublished fence')
  self.check(self.storage(self.C,second['key'],self.fields['service'])==(200,second_bytes),'cleanup first same service positive before delete')
  status,_=self.request('/storage/v1/object/'+self.C,self.fields['service'],{'prefixes':[second['key']]},'DELETE',service=True);self.check(status==200,'cleanup first exact canonical remove')
  self.check(self.object_absent(self.storage(self.C,second['key'],self.fields['service'])),'cleanup first recognized canonical absence')
  self.check(self.sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='{self.C}' AND name='{second['key']}';")=='0','cleanup first canonical metadata absent')
  self.check(self.storage(self.C,first['key'],owner[1])==(200,first_bytes),'cleanup first unrelated published canonical preserved')
  browser_case=attempt();self.check(w.process(self,browser_case) is True,'browser actual worker attested')
  browser_mid=str(uuid.uuid4());self.check(self.finalize(owner,browser_case,browser_mid)==(200,browser_mid),'browser canonical publication')
  status,canonical=self.storage(self.C,browser_case['key'],self.fields['service']);b.require(status==200,'browser canonical source')
  dimensions=json.loads(base.subprocess.run(['node','--input-type=module','-e',"import sharp from 'sharp';const chunks=[];for await(const c of process.stdin)chunks.push(c);const m=await sharp(Buffer.concat(chunks)).metadata();process.stdout.write(JSON.stringify([m.width,m.height]));"],input=canonical,cwd=base.ROOT,env={'PATH':os.environ.get('PATH',''),'LANG':'C'},capture_output=True,check=True,timeout=8).stdout)
  browser_module=module('canonical_browser',Path(__file__).with_name('browser.py'))
  browser_module.run(self,owner,credentials[owner[0]],browser_mid,browser_case,hashlib.sha256(canonical).hexdigest(),dimensions)
  self.check(self.report['canonical_browser']['result']=='PASS_ACTUAL_COMPONENT_DISPOSABLE_STORAGE_ONLY','actual component click decode revoke retired denial')
  self.report['input_terminality']='Explicit harness-observed terminal PUT plus exact service read; not a production writer/lease guarantee'
  self.report['result']='LOCAL STACK PASS; SYNTHETIC WORKER PUBLICATION ONLY; ACTIVATION BLOCKED'
if __name__=='__main__':
 try:
  h=Experiment()
  if sys.argv[1:]==['run']:sys.exit(h.run())
  elif sys.argv[1:]==['cleanup']:h.cleanup()
  else:raise b.Failure('invalid action')
 except Exception:print('Disposable promotion preflight failed; details withheld',file=sys.stderr);sys.exit(1)
