"""Browser-only real content runtime acceptance. No APK, production or JWT claims."""
import asyncio,functools,http.server,json,os,subprocess,tempfile,threading,argparse,hashlib,re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[3]
class Service(http.server.SimpleHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    entered=threading.Event();release=threading.Event();drained=threading.Event();interrupt=True;requests=0;transport_requests=0;title="updated"
    def log_message(self,*args):pass
    def reply(self,data,head=False):
        body=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers()
        if not head:self.wfile.write(body)
    def do_POST(self):
        type(self).transport_requests+=1
        n=int(self.headers.get('Content-Length','0'));self.rfile.read(n)
        if self.path.endswith('/get_content_manifest'):return self.reply([])
        if self.path.endswith('/stories_snapshot_manifest_v2'):return self.reply({'ok':True,'stories':[],'story_scenes':[],'story_media':[],'story_collections':[]})
        self.send_error(404)
    def do_HEAD(self):return self.dispatch(True)
    def do_GET(self):return self.dispatch(False)
    def dispatch(self,head):
        type(self).transport_requests+=1
        parsed=urlparse(self.path)
        if parsed.path=='/health':return self.reply({'ok':True},head)
        if not parsed.path.startswith('/api/rest/v1/'):
            return super().do_HEAD() if head else super().do_GET()
        type(self).requests+=1
        table=parsed.path.rsplit('/',1)[-1];count=1500 if table=='encyclopedia_entities' else 1 if table=='campaigns_public' else 0
        if head:
            self.send_response(200);self.send_header('Content-Range',f'0-0/{count}');self.send_header('Content-Length','0');self.end_headers();return
        query=parse_qs(parsed.query);offset=int(query.get('offset',['0'])[0]);limit=int(query.get('limit',['100'])[0])
        rows=[{'id':str(i),'title':type(self).title,'enabled':True,'body':'synthetic '*1024} for i in range(offset,min(offset+limit,count))] if table=='encyclopedia_entities' else [{'id':'campaign','slug':'campaign','status':'published','data':{'chapters':[]}}] if table=='campaigns_public' else []
        if table=='encyclopedia_entities' and type(self).interrupt:
            type(self).interrupt=False
            body=json.dumps(rows).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body[:128]);self.wfile.flush();type(self).entered.set()
            if not type(self).release.wait(60):
                self.close_connection=True;return
            try:self.wfile.write(body[128:])
            except (BrokenPipeError,ConnectionResetError):pass
            finally:type(self).drained.set()
            return
        self.reply(rows)
def static_boot_inventory(assets):
    rows=json.loads((assets/'static-boot.json').read_text());result={}
    for row in rows:
        name=row['file']
        if name!='index.html' and name!='fixture.js' and not re.fullmatch(r'assets/[A-Za-z0-9_-]+\.js',name):raise ValueError('invalid static file')
        key='/offline-reopen.html' if name=='index.html' else '/'+name
        if key in result or (assets/name).is_symlink():raise ValueError('duplicate or symlink static file')
        body=(assets/name).read_bytes()
        if hashlib.sha256(body).hexdigest()!=row['sha256']:raise ValueError('static hash mismatch')
        result[key]=(body,'text/html' if name=='index.html' else 'text/javascript')
    if '/offline-reopen.html' not in result or '/fixture.js' not in result:raise ValueError('missing static entry')
    return result

async def finish_launch(context,origin,offline,route,deny_socket,errors):
    try:
        if offline:await context.set_offline(True)
        await context.route('**/*',route)
        await context.route_web_socket('**/*',deny_socket)
        page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        await page.goto(origin+('/offline-reopen.html' if offline else ''))
        await page.wait_for_function('window.ready===true')
        return context,page
    except BaseException as primary:
        try:await context.close()
        except BaseException:
            primary.add_note("owned browser context cleanup incomplete")
        raise

async def run(directory,origin,counterfactual=False):
    async with async_playwright() as p:
        executable=os.environ.get('CHROMIUM_EXECUTABLE_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
        external=[];errors=[];checks=[]
        offline_attempts=[];static_boot=[];boot_files=static_boot_inventory(directory/'assets')
        async def launch(offline=False):
            context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=executable,headless=True,service_workers='block',args=['--disable-background-networking'])
            async def route(r):
                if offline:
                    parsed=urlparse(r.request.url)
                    if r.request.method=='GET' and not parsed.query and r.request.url==origin+parsed.path and parsed.path in boot_files:
                        body,mime=boot_files[parsed.path];static_boot.append(parsed.path)
                        await r.fulfill(status=200,content_type=mime,body=body);return
                    offline_attempts.append(parsed.path if r.request.url.startswith(origin+'/') else 'external')
                    if not r.request.url.startswith(origin+'/'):external.append('offline external request')
                    await r.abort('internetdisconnected');return
                if r.request.url.startswith(origin+'/'):await r.continue_()
                else:external.append(r.request.url);await r.abort()
            async def deny_socket(socket):
                external.append('blocked-websocket');await socket.close()
            return await finish_launch(context,origin,offline,route,deny_socket,errors)
        context,page=await launch()
        try:
            assert await page.evaluate('runtime.local().title')=='baseline';checks.append('actual local store hydrated baseline')
            first_request=[];failed=asyncio.Event();failure=[]
            def capture(request):
                if not first_request and request.method=='GET' and urlparse(request.url).path=='/api/rest/v1/encyclopedia_entities':
                    first_request.append(request)
            def request_failed(request):
                if first_request and request is first_request[0]:
                    failure.append(request.failure);failed.set()
            page.on('request',capture);page.on('requestfailed',request_failed)
            await page.evaluate('void (window.first=runtime.apply(1200).then(v=>window.firstResult=v))')
            assert await asyncio.to_thread(Service.entered.wait,10)
            await page.wait_for_function('window.firstResult===false',timeout=10000)
            assert len(first_request)==1
            if counterfactual:
                try:await asyncio.wait_for(failed.wait(),3)
                except asyncio.TimeoutError:
                    assert not Service.release.is_set() and not external and not errors
                    assert await page.evaluate('runtime.state().applying') is False
                    print(json.dumps({'result':'EXPECTED_MISSING_TRANSPORT_ABORT','checks':['original timeout reached with partial response pending','no requestfailed for identified held GET after removal of query signal forwarding'],'android':'NOT_TESTED'}))
                    return
                raise AssertionError('counterfactual unexpectedly aborted held transport')
            await asyncio.wait_for(failed.wait(),10)
            assert len(failure)==1 and 'ERR_ABORTED' in (failure[0] or '')
            checks.append('identified partial GET emits browser requestfailed ERR_ABORTED before retry')
            assert await page.evaluate('runtime.state().applying') is False
            assert (await page.evaluate('runtime.durable()'))['version']==1;checks.append('partial HTTP body timeout preserves baseline and releases controller')
            assert await page.evaluate('runtime.apply(15000)') is True
            before=await page.evaluate('runtime.durable()');assert before['title']=='updated' and before['count']==1500 and before['checksum'];checks.append('same runtime retry persists complete large snapshot')
            Service.release.set();assert await asyncio.to_thread(Service.drained.wait,10)
            assert await page.evaluate('runtime.durable()')==before
            assert await page.evaluate("fetch('/health').then(r=>r.json()).then(x=>x.ok)") is True;checks.append('late stream cannot overwrite retry; ordinary HTTP works without restart')
            cdp=await context.new_cdp_session(page);await cdp.send('Page.setWebLifecycleState',{'state':'frozen'});await cdp.send('Page.setWebLifecycleState',{'state':'active'})
            assert await page.evaluate('runtime.local().title')=='updated';checks.append('CDP browser freeze/resume retains local content; not Android lifecycle')
            # Same live page/context: actual useOnline must recover independently
            # of controller results; no reload, reinitialization or replacement.
            same_page=page;same_context=context
            token=await page.evaluate("window.sameContextToken=crypto.randomUUID()")
            await page.wait_for_function('window.observedOnline===true')
            await context.set_offline(True)
            await page.wait_for_function('navigator.onLine===false && window.observedOnline===false')
            assert await page.evaluate("fetch('/health').then(()=>false,()=>true)") is True
            assert await page.evaluate('runtime.durable()')==before
            active_before=await page.evaluate('runtime.active()')
            assert active_before=={'version':before['version'],'titles':['updated']}
            assert await page.evaluate('runtime.local()')=={'count':1500,'title':'updated'}
            requests_before=Service.requests
            assert await page.evaluate('runtime.apply(15000)') is False
            state=await page.evaluate('runtime.state()')
            assert state['applying'] is False and isinstance(state['error'],str) and state['error']
            assert await page.evaluate('runtime.durable()')==before
            assert await page.evaluate('runtime.active()')==active_before
            assert Service.requests==requests_before
            checks.append('offline actual update fails and settles without changing durable or active content')
            Service.title='reconnected'
            await context.set_offline(False)
            await page.wait_for_function('navigator.onLine===true && window.observedOnline===true')
            assert page is same_page and context is same_context
            assert await page.evaluate('window.sameContextToken')==token
            assert await page.evaluate('runtime.apply(15000)') is True
            reconnected=await page.evaluate('runtime.durable()')
            assert reconnected['title']=='reconnected' and reconnected['count']==1500
            assert reconnected['checksum'] and reconnected['checksum']!=before['checksum']
            assert await page.evaluate('runtime.local()')=={'count':1500,'title':'reconnected'}
            assert await page.evaluate('runtime.active()')=={'version':reconnected['version'],'titles':['reconnected']}
            assert (await page.evaluate('runtime.state()'))['error'] is None
            assert Service.requests>requests_before
            assert await page.evaluate("fetch('/health').then(r=>r.json()).then(x=>x.ok)") is True
            assert await page.evaluate('window.sameContextToken')==token
            assert page is same_page and context is same_context
            before=reconnected
            checks.append('same page actual useOnline recovers; real SDK update retry activates exact new content and subsequent HTTP works without reload')
            await context.close();context,page=await launch()
            assert await page.evaluate('runtime.durable()')==before;assert await page.evaluate('runtime.local().title')=='reconnected';checks.append('orderly browser close/reopen same profile and origin retains content')
            previous_boot=await page.evaluate('runtime.boot().nonce')
            await context.close()
            server_requests=Service.requests;server_transport=Service.transport_requests
            context,page=await launch(offline=True)
            await page.wait_for_function('navigator.onLine===false && window.observedOnline===false')
            boot=await page.evaluate('runtime.boot()')
            assert boot['nonce']!=previous_boot and boot['offlineBoot'] is True
            assert boot['seedCalls']==0 and boot['applyCalls']==0
            assert await page.evaluate('typeof window.sameContextToken')=='undefined'
            assert await page.evaluate('runtime.durable()')==before
            assert await page.evaluate('runtime.local()')=={'count':1500,'title':'reconnected'}
            assert await page.evaluate('runtime.active()')=={'version':before['version'],'titles':['reconnected']}
            assert await page.evaluate("fetch('/health').then(()=>false,()=>true)") is True
            assert '/health' in offline_attempts and Service.requests==server_requests
            assert Service.transport_requests==server_transport
            assert set(offline_attempts)<= {'/health','/offline-snapshot.json','/favicon.ico'}
            assert '/offline-reopen.html' in static_boot and '/fixture.js' in static_boot
            assert len(static_boot)==len(set(static_boot)) and set(static_boot)<=set(boot_files)
            assert not any(path.startswith('/api/') for path in offline_attempts)
            checks.append('fresh offline JS context hydrates exact persisted updated snapshot without seed/apply; only static test boot fulfilled')
            assert not external and not errors
            print(json.dumps({'result':'PASS_BROWSER_ONLY','browser':(await (await context.new_cdp_session(page)).send('Browser.getVersion'))['product'],'checks':checks,'offlineStaticBootRequests':len(static_boot),'offlineDeniedRequests':len(offline_attempts),'offlineBundledDenied':offline_attempts.count('/offline-snapshot.json'),'offlineServerContentRequests':Service.requests-server_requests,'offlineServerAllRequests':Service.transport_requests-server_transport,'externalRequests':len(external),'pageErrors':len(errors),'android':'NOT_TESTED','forceStop':'NOT_TESTED'}))
        finally:Service.release.set();await context.close()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--counterfactual-no-query-abort',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='irth-content-runtime-') as temp:
        directory=Path(temp);assets=directory/'assets';assets.mkdir()
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Service,directory=str(assets)));server.daemon_threads=True
        origin=f'http://127.0.0.1:{server.server_port}'
        subprocess.run(['node','tests/offline/browser/build-content-runtime.mjs',str(assets),origin]+(['--counterfactual-no-query-abort'] if args.counterfactual_no_query_abort else []),cwd=ROOT,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:asyncio.run(run(directory,origin,args.counterfactual_no_query_abort))
        finally:Service.release.set();server.shutdown();server.server_close()
if __name__=='__main__':main()
