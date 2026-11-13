"""Selected real React surfaces/CSS in Chromium; no native Back, full app or backend."""
import asyncio, functools, http.server, json, os, subprocess, tempfile, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright, expect
ROOT=Path(__file__).resolve().parents[3]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path in ('/favicon.ico','/arabesque-pattern.png'):
            # Decorative texture deliberately excluded; no production public assets.
            self.send_response(204); self.end_headers(); return
        super().do_GET()
async def acceptance(directory,origin):
    checks=[]; blocked=[]; errors=[]
    async with async_playwright() as p:
        async def launch():
            context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'],headless=True,service_workers='block',args=['--disable-background-networking'])
            async def route(r):
                u=urlsplit(r.request.url)
                if u.scheme=='http' and u.netloc==urlsplit(origin).netloc and not u.username and not u.password and (u.path in ('/','/fixture.js','/favicon.ico','/arabesque-pattern.png') or u.path.startswith('/assets/')):
                    await r.continue_()
                else: blocked.append('request'); await r.abort()
            async def ws(socket): blocked.append('websocket'); await socket.close()
            await context.route('**/*',route); await context.route_web_socket('**/*',ws)
            context.on('page',lambda page:page.on('pageerror',lambda _:errors.append('pageerror')))
            return context
        context=await launch()
        try:
            page=await context.new_page(); await page.goto(origin); await page.wait_for_function('window.rereadShell !== undefined'); await page.evaluate('document.fonts.ready')
            cdp=await context.new_cdp_session(page); version=(await cdp.send('Browser.getVersion'))['product']; await cdp.detach()
            assert await page.evaluate('Array.from(document.fonts).some(face=>face.status==="loaded")')
            assert await page.locator('nav a').count()==6
            assert await page.locator('select').input_value()=='ar'
            await page.locator('#unsent').fill('synthetic unsent response')
            await page.evaluate('window.savedInput=document.querySelector("#unsent")')
            await page.locator('select').focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
            await expect(page.locator('select')).to_have_value('en')
            await expect(page.locator('nav')).to_have_attribute('dir','ltr')
            assert await page.locator('nav a').all_text_contents()==['Home','Campaigns','Encyclopedia','Atlas','Museum','My account']
            assert await page.locator('#arabic-page').evaluate('(el)=>getComputedStyle(el).direction')=='rtl'
            assert await page.evaluate('window.savedInput===document.querySelector("#unsent") && rereadShell.metrics.mounts===1 && rereadShell.metrics.unmounts===0')
            checks.append('keyboard English preview: six real nav labels, LTR island, Arabic page and unchanged activity DOM')
            trigger=page.get_by_role('button',name='إعادة قراءة نص الفصل',exact=True)
            for width in [360,390,768]:
                await page.set_viewport_size({'width':width,'height':900})
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                assert await page.locator('nav').evaluate('(el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1}')
                assert await page.locator('nav a').evaluate_all('(links)=>links.length===6&&links.every(el=>{const b=el.getBoundingClientRect();return b.width>0&&el.textContent.trim()&&el.scrollWidth<=el.clientWidth+1})')
                await trigger.click(); dialog=page.get_by_role('dialog'); await expect(dialog).to_be_visible()
                assert await dialog.evaluate('(el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1}')
                await expect(dialog).to_contain_text('مقدمة عربية تجريبية.')
                for _ in range(5):
                    await page.keyboard.press('Tab'); assert await dialog.evaluate('(el)=>el.contains(document.activeElement)')
                await page.keyboard.press('Escape'); await expect(dialog).not_to_be_visible(); await expect(trigger).to_be_focused()
                assert await page.evaluate('window.savedInput===document.querySelector("#unsent") && savedInput.value==="synthetic unsent response" && rereadShell.metrics.mounts===1')
                checks.append(f'{width}px: real styled nav/dialog fit, focus trap/Escape/restore and unsent input retained')
            await trigger.click(); await expect(page.get_by_role('dialog')).to_be_visible(); await page.evaluate('rereadShell.changeChapter()'); await expect(page.get_by_role('dialog')).not_to_be_visible()
            await trigger.click(); await expect(page.get_by_role('dialog')).to_be_visible(); await page.evaluate('rereadShell.changeOwner()'); await expect(page.get_by_role('dialog')).not_to_be_visible()
            checks.append('keyed chapter replacement and real owner change retire open reading overlay')
            assert await page.evaluate('localStorage.getItem("irth.device.uiLanguage.v1")')=='en'
        finally: await context.close()
        context=await launch()
        try:
            page=await context.new_page(); await page.goto(origin); await page.wait_for_function('window.rereadShell !== undefined')
            await expect(page.locator('select')).to_have_value('en'); await expect(page.locator('nav')).to_have_attribute('dir','ltr')
            assert await page.evaluate('localStorage.getItem("irth.device.uiLanguage.v1")')=='en'
            checks.append('clean browser restart retains local English preference with real store readback')
        finally: await context.close()
    assert not blocked and not errors and len(checks)==6
    return {'result':'PASS','chromium':version,'checks':checks,'blocked_requests':len(blocked),'page_errors':len(errors),'limits':'Selected real widgets/shell/CSS/fonts with router/HUD/poller/diagnostic/overlay-bridge stubs. Decorative texture omitted. No full app, native Back, native device, backend, historical translation or arbitrary crash proof.'}
def main():
    with tempfile.TemporaryDirectory(prefix='irth-reread-shell-') as temp:
        directory=Path(temp); assets=directory/'assets'; assets.mkdir()
        subprocess.run(['node','tests/offline/browser/build-reread-shell.mjs',str(assets)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets))); server.daemon_threads=True
        thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        try: print(json.dumps(asyncio.run(acceptance(directory,f'http://127.0.0.1:{server.server_port}')),indent=2))
        finally: server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__': main()
