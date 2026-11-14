"""Actual component + actor SDK + live disposable worker bytes; never full-app/native."""
import functools,http.server,json,os,re,subprocess,tempfile,threading
from pathlib import Path
from urllib.parse import urlsplit

def allowed(url,method,origin,assets,api,key):
 u=urlsplit(url)
 if u.username or u.password or u.fragment:return False
 target=u.scheme+'://'+u.netloc
 if target==origin:return method=='GET' and not u.query and u.path in assets
 if target!=api:return False
 rules={('/auth/v1/token','grant_type=password'):'POST',('/auth/v1/user',''):'GET',('/rest/v1/rpc/fixture_canonical_descriptor',''):'POST',('/storage/v1/object/feedback-images-canonical/'+key,''):'GET'}
 expected=rules.get((u.path,u.query));return expected is not None and method in (expected,'OPTIONS')

def denied(status,body):
 return status in (400,401,403,404) and isinstance(body,dict) and (body.get('code') in ('AccessDenied','Unauthorized','NoSuchKey') or (body.get('error')=='not_found' and str(body.get('statusCode'))=='404' and body.get('message')=='Object not found'))

def run(h,actor,credentials,mid,a,digest,dimensions):
 from playwright.sync_api import sync_playwright
 h.isolation();h.require(h.endpoints_verified and h.fields['api']=='http://127.0.0.1:55541','browser local endpoint')
 report={'result':'FAIL','stage':'build','blocked':0,'page_errors':0,'failed_requests':0,'storage_gets':0,'retired_denials':0,'cleanup':False};h.report['canonical_browser']=report
 server=browser=context=pw=None;primary=None
 with tempfile.TemporaryDirectory(prefix='irth-canonical-browser-',dir='/tmp') as temp:
  try:
   assets=Path(temp)/'assets';home=Path(temp)/'home';home.mkdir()
   env={'PATH':os.environ.get('PATH',''),'HOME':str(home),'LANG':'C'}
   subprocess.run(['node','tests/sql/feedback-media-promotion/build-browser.mjs',str(assets)],cwd=Path(__file__).resolve().parents[3],env=env,capture_output=True,check=True,timeout=45)
   files={'/','/index.html'}|{'/'+str(p.relative_to(assets)) for p in assets.rglob('*.js')}
   class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_):pass
    def do_GET(self):
     if self.path not in files:self.send_error(403);return
     super().do_GET()
   server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets)));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
   report['stage']='browser';pw=sync_playwright().start();browser=pw.chromium.launch(headless=True,env=env);version=browser.version;h.require(bool(re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,3}',version)),'browser version shape');report['chromium_version']=version;context=browser.new_context(service_workers='block');context.set_default_timeout(15000)
   def route(r):
    if not allowed(r.request.url,r.request.method,origin,files,h.fields['api'],a['key']):report['blocked']+=1;r.abort();return
    if r.request.redirected_from is not None:report['blocked']+=1;r.abort();return
    if urlsplit(r.request.url).path.startswith('/storage/') and r.request.method=='GET':report['storage_gets']+=1
    r.continue_()
   context.route('**/*',route)
   def socket(ws):report['blocked']+=1;ws.close()
   context.route_web_socket('**/*',socket);page=context.new_page();page.on('pageerror',lambda _:report.__setitem__('page_errors',report['page_errors']+1));page.on('requestfailed',lambda _:report.__setitem__('failed_requests',report['failed_requests']+1))
   page.goto(origin,wait_until='load');page.wait_for_function('!!globalThis.canonicalBrowser');report['stage']='actor_login'
   page.evaluate('(p)=>{globalThis.__canonicalStart="pending";void canonicalBrowser.start(p).then(()=>{globalThis.__canonicalStart="done"},()=>{globalThis.__canonicalStart="failed"});}',{'api':h.fields['api'],'anon':h.fields['anon'],'email':credentials[0],'password':credentials[1],'uid':actor[0],'mid':mid})
   page.wait_for_function('globalThis.__canonicalStart!=="pending"');h.require(page.evaluate('globalThis.__canonicalStart')=='done','browser actor setup failed')
   button=page.get_by_role('button',name='عرض الصورة المرفقة');button.wait_for(state='visible');h.require(report['storage_gets']==0,'browser eager Storage fetch');report['stage']='explicit_decode';button.click()
   page.wait_for_function('(x)=>{const e=canonicalBrowser.evidence();return e.complete&&e.width===x.w&&e.height===x.h&&e.exactCurrentOwned&&e.sha256===x.sha}',arg={'w':dimensions[0],'h':dimensions[1],'sha':digest});h.require(page.get_by_role('img').is_visible(),'decoded image not visible');h.require(report['storage_gets']==1 and page.evaluate('canonicalBrowser.evidence().created')==1,'browser fetch count');report['pixel_decode']=True;report['decoded_dimensions']=dimensions
   report['stage']='identity_retirement';page.evaluate('canonicalBrowser.retireIdentity()');page.wait_for_function('!document.querySelector("img")&&canonicalBrowser.evidence().revoked===1');report['identity_revoke']=True
   h.require(h.worker('retire',a) is True,'server retirement receipt');page.evaluate('canonicalBrowser.restoreIdentity()');button=page.get_by_role('button',name='عرض الصورة المرفقة');button.wait_for(state='visible');report['stage']='retired_storage_denial'
   with page.expect_response(lambda r:urlsplit(r.url).path=='/storage/v1/object/feedback-images-canonical/'+a['key'] and r.request.method=='GET') as response:button.click()
   observed=response.value;h.require(denied(observed.status,observed.json()),'unrecognized retired Storage result');report['retired_denials']=1
   page.get_by_role('button',name='تعذر التحميل؛ حاول مجدداً').wait_for(state='visible');h.require(page.get_by_role('img').count()==0 and page.evaluate('canonicalBrowser.evidence().created')==1 and report['storage_gets']==2,'retired image leak')
   h.require(report['blocked']==report['page_errors']==report['failed_requests']==0,'browser unexpected traffic/error');report['result']='PASS_ACTUAL_COMPONENT_DISPOSABLE_STORAGE_ONLY'
  except BaseException as e:primary=e
  finally:
   clean=True
   for action in ([context.close] if context else [])+([browser.close] if browser else [])+([pw.stop] if pw else [])+([server.shutdown,server.server_close] if server else []):
    try:action()
    except Exception:clean=False
   report['cleanup']=clean
  if primary is not None:raise RuntimeError('canonical browser failed; sanitized stage retained') from None
  h.require(report['cleanup'],'browser cleanup uncertain')
 return report
