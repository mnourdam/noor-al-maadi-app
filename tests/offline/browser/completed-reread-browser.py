"""Actual completed chapter routes with memory routing. Synthetic boundaries; no native/full-app claim."""
import asyncio, functools, http.server, json, os, re, subprocess, tempfile, threading, sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[3]

STAGES=frozenset(('initial','build','assets','server','launch','setup','review-start','review-link','review-link-count','review-href','snapshot-invariant','metrics-invariant','review-enter','review-invariants','forged-start','forged-invariants','normal-start','normal-invariants','active-start','input-fill','reading-open','reading-close','reading-invariants','answer-submit','answer-next','completion-invariants','browser-version','final-invariants'))
DIAGNOSTICS={'stage':'initial','blocked_requests':0,'page_errors':0,'failed_requests':0,'completed_checks':0}
def stage(value):
    if value not in STAGES:raise ValueError('unknown diagnostic stage')
    DIAGNOSTICS['stage']=value

def failure_result(error):
    name=type(error).__name__
    category=name if name in ('AssertionError','TimeoutError','RuntimeError','ValueError','KeyError','OSError') else 'OtherError'
    return {'result':'FAIL','reason':'isolated completed reread acceptance did not complete','category':category,**DIAGNOSTICS}

async def close_preserving_primary(close, primary):
    try:await close()
    except Exception:
        if not primary:raise

def report(run):
    try:result=run();code=0
    except Exception as error:result=failure_result(error);code=1
    print(json.dumps(result,indent=2))
    return code

def admitted(url,origin,paths):
    u=urlsplit(url);o=urlsplit(origin)
    return u.scheme=='http' and u.hostname=='127.0.0.1' and u.netloc==o.netloc and not u.username and not u.password and not u.query and not u.fragment and u.path in paths

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


async def acceptance(directory,origin,paths):
    from playwright.async_api import async_playwright,expect
    blocked=[];errors=[];failed=[];checks=[]
    stage('launch')
    async with async_playwright() as p:
        context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'],headless=True,service_workers='block',args=['--disable-background-networking'])
        try:
            stage('setup')
            async def route(r):
                if admitted(r.request.url,origin,paths) and r.request.method=='GET':await r.continue_()
                else:blocked.append('request');await r.abort()
            async def ws(socket):blocked.append('websocket');await socket.close()
            await context.route('**/*',route);await context.route_web_socket('**/*',ws)
            page=await context.new_page()
            page.on('requestfailed',lambda _:failed.append('requestfailed'))
            page.on('pageerror',lambda _:errors.append('pageerror'))
            page.on('console',lambda msg:errors.append('consoleerror') if msg.type=='error' else None)
            async def start(mode):
                await page.goto(origin)
                await page.evaluate('localStorage.clear()')
                await page.wait_for_function('window.completedReread !== undefined')
                await page.evaluate('(mode)=>completedReread.start(mode)',mode)
            async def unchanged():
                stage('snapshot-invariant')
                assert await page.evaluate('JSON.stringify(completedReread.snapshot())===JSON.stringify(completedReread.before)')
                stage('metrics-invariant')
                assert await page.evaluate('Object.values(completedReread.metrics).every(n=>n===0)')
            stage('review-start')
            await start('review')
            stage('review-link')
            link=page.get_by_role('link',name='أعد القراءة',exact=False)
            stage('review-link-count')
            await expect(link).to_have_count(1)
            href=await link.get_attribute('href')
            stage('review-href')
            assert href=='/campaigns/imported/synthetic-reread/chapter/one?review=chapter'
            await unchanged()
            stage('review-enter')
            await link.click()
            await expect(page.get_by_text('أنهيتَ هذا الفصل — راجع الأنشطة المكتملة دون أثر على تقدمك.',exact=True)).to_be_visible()
            await expect(page.get_by_text('جواب مكتمل',exact=False)).to_be_visible()
            assert await page.evaluate('completedReread.location()')==href
            await expect(page.locator('[data-testid="hearts-modal"]')).to_have_count(0)
            await unchanged()
            checks.append('actual overview Link enters actual chapter through memory router, validated review intent; completed partial answer key with zero hearts and no personal writes')
            stage('forged-start')
            await start('forged')
            await expect(page.get_by_role('heading',name='حملة تجريبية',exact=True)).to_be_visible()
            assert await page.evaluate('completedReread.location()') in ['/campaigns/imported/synthetic-reread','/campaigns/imported/synthetic-reread/']
            await expect(page.get_by_text('جواب مكتمل',exact=False)).to_have_count(0)
            await expect(page.locator('[data-testid="hearts-modal"]')).to_have_count(0)
            await unchanged()
            checks.append('forged incomplete review redirects through real router with no answer key, plan, harvest, save, reward or storage mutation')
            stage('normal-start')
            await start('normal')
            await expect(page.get_by_text('أتممتَ هذا الفصل',exact=True)).to_be_visible()
            await expect(page.get_by_text('أنهيتَ هذا الفصل — راجع الأنشطة المكتملة دون أثر على تقدمك.',exact=True)).to_have_count(0)
            await expect(page.get_by_role('link',name='الفصل التالي',exact=False)).to_have_attribute('href','/campaigns/imported/synthetic-reread/chapter/two')
            assert await page.evaluate('(completedReread.metrics.unexpected??0)===0')
            checks.append('ordinary completed chapter URL preserves completion panel and normal next-chapter navigation')
            stage('active-start')
            await start('active')
            answer=page.get_by_placeholder('اكتب إجابتك…')
            assert await page.evaluate('(completedReread.metrics.unexpected??0)===0')
            stage('input-fill')
            await answer.fill('إجابة غير مرسلة')
            await page.evaluate('window.savedAnswer=document.querySelector("input");window.readBaseline=JSON.stringify(completedReread.snapshot());window.readMetrics=JSON.stringify(completedReread.metrics)')
            trigger=page.get_by_role('button',name='إعادة قراءة نص الفصل',exact=True)
            stage('reading-open')
            await trigger.click()
            dialog=page.get_by_role('dialog')
            await expect(dialog).to_be_visible()
            await expect(dialog.get_by_text('قراءة تاريخية تجريبية محفوظة.',exact=True)).to_be_visible()
            stage('reading-close')
            await dialog.get_by_role('button',name='العودة إلى النشاط',exact=True).click()
            await expect(dialog).not_to_be_visible()
            stage('reading-invariants')
            await expect(answer).to_have_value('إجابة غير مرسلة')
            await expect(trigger).to_be_focused()
            assert await page.evaluate('savedAnswer===document.querySelector("input")')
            assert await page.evaluate('readBaseline===JSON.stringify(completedReread.snapshot())&&readMetrics===JSON.stringify(completedReread.metrics)')
            checks.append('actual activity input survives real in-play reading dialog open/close without save, reward or personal storage mutation')
            stage('answer-submit')
            await answer.fill('جواب مكتمل')
            await page.get_by_role('button',name='تحقق',exact=True).click()
            stage('answer-next')
            await page.get_by_role('button',name='التالي',exact=True).click()
            await expect(page.get_by_text('أتممتَ هذا الفصل',exact=True)).to_be_visible()
            await expect(page.get_by_text('أنهيتَ هذا الفصل — راجع الأنشطة المكتملة دون أثر على تقدمك.',exact=True)).to_have_count(0)
            await expect(page.get_by_role('link',name='الفصل التالي',exact=False)).to_have_attribute('href','/campaigns/imported/synthetic-reread/chapter/two')
            stage('completion-invariants')
            assert await page.evaluate('completedReread.metrics.save===1 && (completedReread.metrics.unexpected??0)===0')
            checks.append('actual activity answer then Next preserves ordinary chapter completion, with only explicit synthetic save boundary')
            stage('browser-version')
            cdp=await context.new_cdp_session(page);version=(await cdp.send('Browser.getVersion'))['product'];await cdp.detach()
        finally:
            DIAGNOSTICS.update(blocked_requests=len(blocked),page_errors=len(errors),failed_requests=len(failed),completed_checks=len(checks))
            primary=sys.exc_info()[0] is not None
            await close_preserving_primary(context.close, primary)
    stage('final-invariants')
    assert len(checks)==5 and not blocked and not errors and not failed
    return {'result':'PASS','chromium':version,'checks':checks,'blocked_requests':len(blocked),'page_errors':len(errors),'failed_requests':len(failed),'limits':'Actual overview/chapter routes, memory router, activity/input/reading components, identity/partition/progress/ledger. Synthetic content, profile/save/memory boundaries and ancillary shells. Not browser history/deep-link reload, native, backend, full-app or release acceptance.'}

def main():
    with tempfile.TemporaryDirectory(prefix='irth-completed-reread-') as temp:
        directory=Path(temp);assets=directory/'assets';assets.mkdir()
        stage('build')
        result=subprocess.run(['node','tests/offline/browser/build-completed-reread.mjs',str(assets)],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:raise RuntimeError('fixture build failed')
        stage('assets')
        paths=asset_paths(assets)
        stage('server')
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets)));server.allowed_paths=paths;server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:return asyncio.run(acceptance(directory,f'http://127.0.0.1:{server.server_port}',paths))
        finally:server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__':
    raise SystemExit(report(main))
