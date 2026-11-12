"""Browser-only real content runtime acceptance. No APK, production or JWT claims."""
import asyncio,functools,http.server,json,os,subprocess,tempfile,threading,argparse
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[3]
class Service(http.server.SimpleHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    entered=threading.Event();release=threading.Event();drained=threading.Event();interrupt=True;requests=0
    def log_message(self,*args):pass
    def reply(self,data,head=False):
        body=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers()
        if not head:self.wfile.write(body)
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0'));self.rfile.read(n)
        if self.path.endswith('/get_content_manifest'):return self.reply([])
        if self.path.endswith('/stories_snapshot_manifest_v2'):return self.reply({'ok':True,'stories':[],'story_scenes':[],'story_media':[],'story_collections':[]})
        self.send_error(404)
    def do_HEAD(self):return self.dispatch(True)
    def do_GET(self):return self.dispatch(False)
    def dispatch(self,head):
        parsed=urlparse(self.path)
        if parsed.path=='/health':return self.reply({'ok':True},head)
        if not parsed.path.startswith('/api/rest/v1/'):
            return super().do_HEAD() if head else super().do_GET()
        type(self).requests+=1
        table=parsed.path.rsplit('/',1)[-1];count=1500 if table=='encyclopedia_entities' else 1 if table=='campaigns_public' else 0
        if head:
            self.send_response(200);self.send_header('Content-Range',f'0-0/{count}');self.send_header('Content-Length','0');self.end_headers();return
        query=parse_qs(parsed.query);offset=int(query.get('offset',['0'])[0]);limit=int(query.get('limit',['100'])[0])
        rows=[{'id':str(i),'title':'updated','enabled':True,'body':'synthetic '*1024} for i in range(offset,min(offset+limit,count))] if table=='encyclopedia_entities' else [{'id':'campaign','slug':'campaign','status':'published','data':{'chapters':[]}}] if table=='campaigns_public' else []
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
async def run(directory,origin,counterfactual=False):
    async with async_playwright() as p:
        executable=os.environ.get('CHROMIUM_EXECUTABLE_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
        external=[];errors=[];checks=[]
        async def launch():
            context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=executable,headless=True,service_workers='block',args=['--disable-background-networking'])
            async def route(r):
                if r.request.url.startswith(origin+'/'):await r.continue_()
                else:external.append(r.request.url);await r.abort()
            await context.route('**/*',route)
            async def deny_socket(socket):
                external.append('blocked-websocket');await socket.close()
            await context.route_web_socket('**/*',deny_socket)
            page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(origin);await page.wait_for_function('window.ready===true')
            return context,page
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
            await context.set_offline(True);assert await page.evaluate("fetch('/health').then(()=>false,()=>true)") is True;assert await page.evaluate('runtime.durable()')==before;assert await page.evaluate('runtime.local().count')==1500;checks.append('browser offline retains IDB and local reads')
            await context.close();context,page=await launch()
            assert await page.evaluate('runtime.durable()')==before;assert await page.evaluate('runtime.local().title')=='updated';checks.append('orderly browser close/reopen same profile and origin retains content')
            assert not external and not errors
            print(json.dumps({'result':'PASS_BROWSER_ONLY','browser':(await (await context.new_cdp_session(page)).send('Browser.getVersion'))['product'],'checks':checks,'externalRequests':len(external),'pageErrors':len(errors),'android':'NOT_TESTED','forceStop':'NOT_TESTED'}))
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
