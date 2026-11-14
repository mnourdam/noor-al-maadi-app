"""Fresh Chromium origin: native WebStorage quota, synthetic retained player bytes only."""
import asyncio, functools, http.server, json, os, subprocess, tempfile, threading, sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[3]
STAGE='initial'
def admitted(url,origin,paths,redirected=False):
    u=urlsplit(url);o=urlsplit(origin)
    return not redirected and u.scheme=='http' and u.hostname=='127.0.0.1' and u.netloc==o.netloc and not u.username and not u.password and not u.query and not u.fragment and '%' not in u.path and u.path in paths

def asset_paths(assets):
    result={'/','/favicon.ico','/arabesque-pattern.png'}
    for p in assets.rglob('*'):
        if p.is_symlink():raise ValueError('symlink asset')
        if p.is_file():result.add('/'+p.relative_to(assets).as_posix())
    return result

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path not in self.server.allowed_paths:self.send_error(404);return
        if self.path in ('/favicon.ico','/arabesque-pattern.png'):
            self.send_response(204);self.end_headers();return
        super().do_GET()

def cleanup_all(actions,primary):
    failures=[]
    for action in actions:
        errors=[]
        def run(action=action,errors=errors):
            try:action()
            except BaseException:errors.append(True)
        worker=threading.Thread(target=run,daemon=True);worker.start();worker.join(timeout=5)
        if worker.is_alive() or errors:failures.append(True)
    if failures and not primary:raise RuntimeError('cleanup incomplete')

async def close_context(context,primary):
    try:await asyncio.wait_for(context.close(),timeout=5)
    except Exception:
        if not primary:raise

async def acceptance(directory,origin,paths):
    from playwright.async_api import async_playwright,expect
    global STAGE
    blocked=[];errors=[];failed=[]
    STAGE='launch'
    async with async_playwright() as p:
        context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'],headless=True,service_workers='block',args=['--disable-background-networking'])
        try:
            async def route(r):
                if admitted(r.request.url,origin,paths,r.request.redirected_from is not None) and r.request.method=='GET':await r.continue_()
                else:blocked.append('request');await r.abort()
            async def ws(socket):blocked.append('websocket');await socket.close()
            await context.route('**/*',route);await context.route_web_socket('**/*',ws)
            page=await context.new_page();page.set_default_timeout(15000)
            page.on('pageerror',lambda _:errors.append('pageerror'))
            page.on('requestfailed',lambda _:failed.append('requestfailed'))
            page.on('console',lambda msg:errors.append('consoleerror') if msg.type=='error' else None)
            STAGE='hydrate'
            await page.goto(origin);await page.wait_for_function('window.quotaFixture?.snapshot().hydrated')
            await expect(page.get_by_role('heading',name='Synthetic player remains mounted')).to_be_visible()
            assert await page.get_by_role('status').count()==0
            baseline=await page.evaluate('quotaFixture.snapshot()')
            assert baseline['retained'] and baseline['writes']==0 and baseline['removes']==0 and baseline['clears']==0
            STAGE='native-fill'
            fill=await page.evaluate('quotaFixture.fill()')
            assert fill['nativeFillQuota'] and 0<fill['fillerCharacters']<8*1024*1024 and fill['fillAttempts']<=40
            STAGE='profile-quota-warning'
            await page.evaluate('quotaFixture.grow()')
            await expect(page.get_by_role('status')).to_be_visible()
            await expect(page.get_by_role('status')).to_contain_text('تعذّر حفظ بعض التغييرات')
            STAGE='interaction-retention'
            await page.get_by_role('button',name='Interact 0',exact=True).click()
            await expect(page.get_by_role('button',name='Interact 1',exact=True)).to_be_visible()
            fault=await page.evaluate('quotaFixture.snapshot()')
            assert fault['outcome']=='failed' and fault['quotaFailures']==1 and fault['writes']==1
            assert fault['retained'] and fault['savedProfile']==baseline['savedProfile'] and fault['removes']==0 and fault['clears']==0
            # Separate harness action; the app does not purge any key or retry.
            STAGE='harness-free-only-filler'
            await page.evaluate('quotaFixture.freeOwnFiller()')
            await page.wait_for_timeout(500)
            after_free=await page.evaluate('quotaFixture.snapshot()')
            assert after_free['retained'] and after_free['writes']==1 and after_free['outcome']=='failed'
            await expect(page.get_by_role('status')).to_be_visible()
            STAGE='explicit-recovery'
            await page.evaluate('quotaFixture.recover()')
            await page.wait_for_function('quotaFixture.snapshot().outcome==="written"')
            assert await page.get_by_role('status').count()==0
            recovered=await page.evaluate('quotaFixture.snapshot()')
            assert recovered['writes']==2 and recovered['quotaFailures']==1 and recovered['removes']==0 and recovered['clears']==0
            assert json.loads(recovered['savedProfile'])['points']==101
            assert await page.evaluate("['irth.daily-challenges.2026-11-14','irth.daily-quest.history','irth.outbox.fallback.v1','irth_campaign_grants_v2','irth.reflections'].every(k=>JSON.parse(localStorage.getItem(k)).retained==='x'.repeat(256))")
            cdp=await context.new_cdp_session(page);version=(await cdp.send('Browser.getVersion'))['product'];await cdp.detach()
            assert not blocked and not errors and not failed
            return {'result':'PASS','chromium':version,'fill':fill,'checks':['actual native quota reached within cap','actual profile quota failure retains seeded bytes and mounted interactive shell','no app deletion or clear','no automatic retry observed for 500ms after harness frees only filler','explicit later verified write clears warning; history/outbox retained'],'profile_write_attempts':recovered['writes'],'native_profile_quota_failures':recovered['quotaFailures'],'blocked_requests':len(blocked),'page_errors':len(errors),'failed_requests':len(failed),'limits':'Fresh synthetic Chromium origin; actual Provider/writer/AppShell/warning, unrelated router/HUD/SDK stubbed. No actual partition adapter, all-app surfaces, Android, player boot, backend, or device pressure acceptance. 500ms bounded no-retry observation, not indefinite proof.'}
        finally:await close_context(context,sys.exc_info()[0] is not None)

def main():
    global STAGE
    STAGE='build'
    with tempfile.TemporaryDirectory(prefix='irth-profile-quota-') as temp:
        directory=Path(temp);assets=directory/'assets';assets.mkdir()
        result=subprocess.run(['node','tests/offline/browser/build-profile-quota.mjs',str(assets)],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120,env={k:v for k,v in os.environ.items() if not k.startswith('VITE_')})
        if result.returncode:raise RuntimeError('fixture build failed')
        paths=asset_paths(assets)
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets)));server.allowed_paths=paths;server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def join_server():
            thread.join(timeout=4)
            if thread.is_alive():raise RuntimeError('server thread did not stop')
        try:return asyncio.run(asyncio.wait_for(acceptance(directory,f'http://127.0.0.1:{server.server_port}',paths),timeout=90))
        finally:cleanup_all([server.shutdown,server.server_close,join_server],sys.exc_info()[0] is not None)
if __name__=='__main__':
    try:result=main();code=0
    except Exception:result={'result':'FAIL','reason':'isolated native quota acceptance incomplete','stage':STAGE};code=1
    print(json.dumps(result,indent=2));raise SystemExit(code)
