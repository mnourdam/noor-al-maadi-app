"""Actual selected Profile route, isolated synthetic reads. No native/full-app claim."""
import asyncio, functools, http.server, json, os, re, subprocess, tempfile, threading, sys
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[3]

STAGES=frozenset(('initial','build','assets','server','launch','setup','page-load','font-check','detail-open','ownership-refresh','en-dialog','ar-dialog','en-360','en-390','en-768','ar-360','ar-390','ar-768','owner-retirement','claimed-owner','final-invariants'))
DIAGNOSTICS={'stage':'initial','blocked_requests':0,'page_errors':0,'failed_requests':0,'completed_checks':0}
def stage(value):
    if value not in STAGES:raise ValueError('unknown diagnostic stage')
    DIAGNOSTICS['stage']=value

def failure_result(error):
    name=type(error).__name__
    category=name if name in ('AssertionError','TimeoutError','RuntimeError','ValueError','KeyError','OSError') else 'OtherError'
    return {'result':'FAIL','reason':'isolated Profile acceptance did not complete','category':category,**DIAGNOSTICS}

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
            page=await context.new_page();page.on('pageerror',lambda _:errors.append('pageerror'))
            page.on('requestfailed',lambda _:failed.append('requestfailed'))
            page.on('console',lambda msg:errors.append('consoleerror') if msg.type=='error' else None)
            stage('page-load')
            await page.goto(origin);await page.wait_for_function('window.profileAchievement !== undefined');await page.evaluate('document.fonts.ready')
            stage('font-check')
            assert await page.evaluate('Array.from(document.fonts).some(face=>face.status==="loaded")')
            cdp=await context.new_cdp_session(page);version=(await cdp.send('Browser.getVersion'))['product'];await cdp.detach()
            title='جامع الآثار';description='اكتشف 10 آثار.'
            stage('detail-open')
            await page.get_by_role('button',name=title,exact=True).click()
            dialog=page.get_by_role('dialog',name=title,exact=True)
            await expect(dialog.get_by_text('90%',exact=True)).to_be_visible()
            count=page.get_by_text(re.compile(r'^\d+ من \d+ مفتوحة$'))
            before=int((await count.text_content()).split()[0])
            stage('ownership-refresh')
            await page.evaluate('profileAchievement.collectTen()')
            await expect(dialog.get_by_text('100%',exact=True)).to_be_visible()
            assert int((await count.text_content()).split()[0])==before+1
            await expect(dialog.get_by_text('تحقق شرط الاقتناء. لم يُؤكد صرف مكافأة هذا الإنجاز بعد.',exact=True)).to_be_visible()
            assert await dialog.get_by_text(re.compile('فُتح في')).count()==0
            assert await page.evaluate('profileAchievement.snapshot().museum===0 && profileAchievement.snapshot().receipts===0 && profileAchievement.state.reads>=2')
            checks.append('actual Profile nine-to-ten ownership increments count by one; detail warns reward unconfirmed without receipt')
            await page.evaluate('window.savedAchievementDialog=document.querySelector(\'[role="dialog"]\')')
            for lang,title,description,close in [('en','Artifact Collector','Discover 10 artifacts.','Close'),('ar','جامع الآثار','اكتشف 10 آثار.','إغلاق')]:
                stage(lang+'-dialog')
                await page.evaluate('(lang)=>profileAchievement.setLanguage(lang)',lang)
                dialog=page.get_by_role('dialog',name=title,exact=True)
                await expect(dialog).to_have_attribute('lang',lang);await expect(dialog).to_have_attribute('dir','ltr' if lang=='en' else 'rtl')
                await expect(dialog.get_by_role('button',name=close,exact=True)).to_be_visible()
                assert await page.evaluate('savedAchievementDialog===document.querySelector(\'[role="dialog"]\')')
                for width in [360,390,768]:
                    stage(lang+'-'+str(width))
                    await page.set_viewport_size({'width':width,'height':900})
                    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                    assert await dialog.evaluate('(el)=>{const b=el.children[0].getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1&&b.top>=-1&&b.bottom<=innerHeight+1&&el.children[0].scrollWidth<=el.children[0].clientWidth+1}')
                    for element,expected in [(dialog.get_by_role('heading'),title),(dialog.get_by_text(description,exact=True),description)]:
                        await expect(element).to_be_visible();assert await element.text_content()==expected
                        assert await element.evaluate('''el=>{const s=getComputedStyle(el),b=el.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(el);const lines=Array.from(r.getClientRects()).filter(x=>x.width>0&&x.height>0);return b.width>0&&b.height>0&&lines.length>0&&s.webkitLineClamp==='none'&&s.textOverflow!=='ellipsis'&&el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1&&lines.every(x=>x.left>=b.left-1&&x.right<=b.right+1&&x.top>=b.top-1&&x.bottom<=b.bottom+1)}''')
                    checks.append(f'{lang} {width}px: same real named dialog, full canonical title/description and no horizontal overflow')
            # Owner retirement means old evidence disappears, not a fabricated dialog-close contract.
            stage('owner-retirement')
            await page.evaluate('profileAchievement.changeOwner()')
            await expect(dialog.get_by_text('0%',exact=True)).to_be_visible()
            assert await dialog.get_by_text(re.compile('لم يُؤكد صرف')).count()==0
            assert await page.evaluate('profileAchievement.snapshot().receipts===0 && profileAchievement.snapshot().museum===0')
            checks.append('real owner-scoped projection retires prior ownership while selected ID remains')
            stage('claimed-owner')
            await page.evaluate('profileAchievement.claimedOwner()')
            await expect(dialog.get_by_text(re.compile('فُتح في'))).to_be_visible()
            assert await dialog.get_by_text(re.compile('لم يُؤكد صرف')).count()==0
            assert await page.evaluate('profileAchievement.snapshot().receipts===1 && profileAchievement.snapshot().museum===0 && profileAchievement.snapshot().mutations===0')
            checks.append('distinct synthetic claimed-owner receipt uses real mirror hydration; no grant or mutation call')
        finally:
            DIAGNOSTICS.update(blocked_requests=len(blocked),page_errors=len(errors),failed_requests=len(failed),completed_checks=len(checks))
            await close_preserving_primary(context.close,sys.exc_info()[0] is not None)
    stage('final-invariants')
    assert len(checks)==9 and not blocked and not errors and not failed
    return {'result':'PASS','chromium':version,'checks':checks,'blocked_requests':len(blocked),'page_errors':len(errors),'failed_requests':len(failed),'limits':'Actual selected Profile route/AppShell/achievement projection/dialog/styles/fonts. Synthetic router/account/SDK and unrelated HUD/poller/component stubs. No full app, effective Auth/RLS, reward granting, native Back/Escape/focus-trap/TalkBack, or release acceptance.'}

def main():
    with tempfile.TemporaryDirectory(prefix='irth-profile-achievement-') as temp:
        directory=Path(temp);assets=directory/'assets';assets.mkdir()
        stage('build')
        result=subprocess.run(['node','tests/offline/browser/build-profile-achievement.mjs',str(assets)],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
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
