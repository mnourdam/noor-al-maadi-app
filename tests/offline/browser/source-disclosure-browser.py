"""One bounded component-only visual proof. No auth/API/full route/native claim."""
import asyncio,functools,hashlib,http.server,json,os,re,subprocess,tempfile,threading,sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[3]
TEXT='هذه المراجع مسجّلة مع المقال؛ إدراجها هنا لا يعني التحقق من دقة نسبتها أو مطابقتها لكل ما ورد فيه.'
def admitted(url,origin,paths):
 u=urlsplit(url);return u.scheme=='http' and u.netloc==urlsplit(origin).netloc and u.hostname=='127.0.0.1' and not u.username and not u.password and not u.query and not u.fragment and '%' not in u.path and u.path in paths
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path not in self.server.paths:self.send_error(404);return
  super().do_GET()
async def close_owned(context,errors):
 try:await asyncio.wait_for(context.close(),10)
 except BaseException:errors.append('context_cleanup')
async def observe(folder,origin,inventory,evidence):
 from playwright.async_api import async_playwright,expect
 blocked=[];errors=[];failed=[];shots=[]
 async with async_playwright() as p:
  context=await p.chromium.launch_persistent_context(str(folder/'profile'),executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'],headless=True,service_workers='block',args=['--disable-background-networking'])
  try:
   context.set_default_timeout(15000)
   async def route(r):
    if r.request.method=='GET' and r.request.redirected_from is None and admitted(r.request.url,origin,inventory['assets']):await r.continue_()
    else:blocked.append('blocked');await r.abort()
   async def ws(socket):blocked.append('websocket');await socket.close()
   await context.route('**/*',route);await context.route_web_socket('**/*',ws)
   page=await context.new_page();page.on('pageerror',lambda _:errors.append('pageerror'));page.on('requestfailed',lambda _:failed.append('requestfailed'));page.on('console',lambda m:errors.append('consoleerror') if m.type=='error' else None)
   for label,width,height in [('mobile',390,844),('desktop',1280,900)]:
    await page.set_viewport_size({'width':width,'height':height})
    for kind in ['duraid','dinar']:
     await page.goto('about:blank')
     await page.goto(origin+'/index.html#'+kind,wait_until='networkidle',timeout=15000)
     main=page.locator('main');await expect(main).to_have_attribute('data-fixture-kind',kind)
     await page.evaluate('()=>Promise.race([document.fonts.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error("fonts deadline")),10000))])')
     disclosure=page.locator('[data-source-disclosure]');await expect(disclosure).to_have_count(1);await expect(disclosure).to_have_text(TEXT);await expect(disclosure).to_be_visible()
     entries=page.locator('li' if kind=='duraid' else 'aside p:not([data-source-disclosure])');count=await entries.count();assert count==6
     assert await entries.all_text_contents()==inventory['expectedEntries'][kind]
     assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     style=await disclosure.evaluate('(e)=>({fontSize:getComputedStyle(e).fontSize,lineHeight:getComputedStyle(e).lineHeight,color:getComputedStyle(e).color})')
     assert float(style['fontSize'].removesuffix('px'))>=12
     raw=await page.screenshot(full_page=True,type='png',timeout=15000);assert len(raw)<=2*1024*1024
     name=kind+'-'+label+'.png';(evidence/name).write_bytes(raw);shots.append({'file':name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'viewport':{'width':width,'height':height},'entries':count,'disclosureStyle':style})
   cdp=await context.new_cdp_session(page);version=(await cdp.send('Browser.getVersion'))['product'];await cdp.detach()
  finally:await close_owned(context,errors)
 assert not blocked and not errors and not failed
 return {'result':'PASS','chromium':version,'screenshots':shots,'blocked':len(blocked),'pageErrors':len(errors),'failedRequests':len(failed),'cleanup':True,'sourceHashes':inventory['sourceHashes'],'recordHashes':inventory['recordHashes'],'assetInventory':inventory['assets'],'assetInventorySha256':hashlib.sha256(json.dumps(inventory['assets'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),'limits':'Actual source components/CSS with pinned packaged public content; fixture layout, not full route/auth/native or citation verification.'}
def stop_server(server,thread,primary):
 failures=[]
 for action in [server.shutdown,server.server_close,lambda:thread.join(timeout=5)]:
  try:action()
  except BaseException:failures.append('server_cleanup')
 if thread.is_alive():failures.append('server_thread')
 if failures and not primary:raise RuntimeError('server cleanup incomplete')
def main():
 evidence=ROOT/'source-disclosure-evidence';evidence.mkdir(exist_ok=False)
 with tempfile.TemporaryDirectory(prefix='irth-source-disclosure-') as temp:
  folder=Path(temp);assets=folder/'assets';assets.mkdir()
  env={k:v for k,v in os.environ.items() if not k.startswith('VITE_')}
  result=subprocess.run(['node','tests/offline/browser/build-source-disclosure.mjs',str(assets)],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120)
  if result.returncode:raise RuntimeError('build failed')
  inventory=json.loads((folder/'inventory.json').read_text())
  for path,entry in inventory['assets'].items():
   b=(assets/path[1:]).read_bytes();assert len(b)==entry['bytes'] and hashlib.sha256(b).hexdigest()==entry['sha256']
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets)));server.paths=set(inventory['assets']);server.daemon_threads=True
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:receipt=asyncio.run(asyncio.wait_for(observe(folder,f'http://127.0.0.1:{server.server_port}',inventory,evidence),180))
  finally:stop_server(server,thread,sys.exc_info()[0] is not None)
  commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,timeout=5,text=True).strip();tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,timeout=5,text=True).strip()
  assert re.fullmatch('[a-f0-9]{40}',commit) and re.fullmatch('[a-f0-9]{40}',tree)
  receipt.update(sourceCommit=commit,sourceTree=tree)
  return receipt
if __name__=='__main__':
 try:receipt=main();code=0
 except Exception as error:receipt={'result':'FAIL','category':type(error).__name__ if type(error).__name__ in ['AssertionError','TimeoutError','RuntimeError','ValueError','OSError'] else 'OtherError','limits':'No visual acceptance'};code=1
 (ROOT/'source-disclosure-evidence'/'receipt.json').write_text(json.dumps(receipt,indent=2));sys.exit(code)
