"""Same real adapter on a temporary loopback origin; native LS/IDB/Web Locks, synthetic data.
Run: python3 tests/offline/browser/guest-source-adapter-native.py. No browser download.
"""
import asyncio
import functools
import http.server
import json
from pathlib import Path
import subprocess
import tempfile
import threading
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[3]
def check(value,message):
    if not value: raise AssertionError(message)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args): pass
async def run(directory,origin):
    cases=[];denied=[];errors=[]
    async with async_playwright() as pw:
        async def launch():
            ctx=await pw.chromium.launch_persistent_context(str(directory/'profile'),executable_path='/usr/bin/chromium',headless=True,args=['--disable-background-networking'])
            async def route(r):
                if r.request.url.startswith(origin+'/'):await r.continue_()
                else:denied.append(r.request.url);await r.abort()
            await ctx.route('**/*',route)
            return ctx
        async def tab(ctx):
            p=await ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.set_default_timeout(10000)
            await p.goto(origin);await p.wait_for_function('window.ready===true');return p
        ctx=await launch();version=ctx.browser.version
        try:
            a=await tab(ctx);b=await tab(ctx)
            capability=await a.evaluate('api.info()');check(capability['secure'] and capability['locks'],'native capability unavailable')
            await a.evaluate('api.seed()')
            initial=await a.evaluate('api.raw()')
            first=await a.evaluate('api.capture()');check(first['ok'],'native capture failed')
            h=first['value'];check(h['snapshot']==initial and h['target'] is None and h['consent'] is None and h['phase']=='awaiting_target','false transfer/bind')
            check(h['sourceAddress'].find('guest:native-source-test')>=0,'wrong physical address')
            check(await a.evaluate('api.raw()')==initial,'capture changed source')
            cases.append('actual adapter + native storage exact snapshot into synthetic journal; no bind/source mutation')
            await a.evaluate("api.globalSeed('legacy-global-marker')")
            check((await a.evaluate('api.read()'))['value']==initial,'wrong physical read')
            check(await a.evaluate('api.globalRaw()')=='legacy-global-marker','adapter migrated global data')
            cases.append('physical read leaves global V17 marker intact')
            # Remove fixture's global marker before browser restart: boot migration is not the adapter.
            await a.evaluate('api.removeGlobal()')
            await a.evaluate('api.startHold()');await a.wait_for_function('api.held()')
            await b.evaluate('api.startWriter()')
            await a.wait_for_function("navigator.locks.query().then(s=>s.pending.some(l=>l.name.includes('campaign_progress_buffer')))" )
            check(not await b.evaluate('api.writerDone()'),'writer escaped source lock')
            check(await b.evaluate('api.raw()')==initial,'writer mutated during callback')
            await a.evaluate('api.release()');check((await a.evaluate('api.finish()'))['value']==initial,'snapshot changed under lock')
            check(await b.evaluate('api.writerResult()')=={'saved':True},'writer failed after release')
            cases.append('two tabs: real buffer writer waits for full adapter callback')
            await a.evaluate('api.seed()');await b.evaluate('api.startHold()');await b.wait_for_function('api.held()')
            await a.evaluate("api.startCapture('waiting-lock')")
            await b.wait_for_function("navigator.locks.query().then(s=>s.pending.some(l=>l.name.includes('campaign_progress_buffer')))" )
            await a.evaluate("api.owner('user:alice')");await b.evaluate('api.release()');await b.evaluate('api.finish()')
            stale=await a.evaluate('api.finish()');check(not stale['ok'] and stale['reason']=='identity_changed','stale lock callback accepted')
            check(await a.evaluate('api.raw()')==initial,'identity race mutated guest source')
            cases.append('Guest to synthetic User while waiting for native lock is fenced')
            await a.evaluate('api.owner(api.guest);api.gateHash()');await a.evaluate("api.startCapture('hash-race')");await a.wait_for_function('api.hashEntered()')
            await a.evaluate("api.owner('user:alice');api.releaseHash()")
            stale=await a.evaluate('api.finish()');check(not stale['ok'] and stale['reason']=='identity_changed','hash race accepted')
            cases.append('Guest to synthetic User during SHA-256 await is fenced')
            await a.evaluate('api.owner(api.guest);api.locks(false)')
            missing=await a.evaluate('api.read()');check(not missing['ok'] and missing['reason']=='coordination_unavailable','unsafe no-lock fallback')
            await a.evaluate('api.locks(true)');check(await a.evaluate('api.raw()')==initial,'no-lock changed source')
            cases.append('absent native Web Locks fails closed without mutation')
            await a.evaluate("api.seed('{broken')")
            corrupt=await a.evaluate('api.read()');check(not corrupt['ok'] and corrupt['reason']=='corrupt','corrupt accepted')
            check(await a.evaluate('api.raw()')=='{broken','corrupt overwritten');await a.evaluate('api.seed()')
            cases.append('corrupt native storage preserved and refused')
            await a.evaluate('api.close()');await b.evaluate('api.close()')
        finally:await ctx.close()
        ctx=await launch()
        try:
            a=await tab(ctx);restored=await a.evaluate('(id)=>api.recover(id)',h['id'])
            check(restored['ok'] and restored['value']==h,'browser restart changed journal')
            check(await a.evaluate('api.raw()')==initial,'browser restart lost source')
            cases.append('persistent browser close/reopen restores identical native IDB journal/source')
            check(not errors,'page errors: '+str(errors));check(not denied,'external page requests: '+str(denied))
            print(json.dumps({'result':'PASS','sameActualAdapter':True,'nativeChromium':version,'cases':cases,'count':len(cases),'externalRequests':len(denied),'android':'PENDING_NOT_TESTED'},ensure_ascii=False))
        finally:await ctx.close()
with tempfile.TemporaryDirectory(prefix='irth-source-adapter-') as temp:
    directory=Path(temp);output=directory/'site'
    subprocess.run(['node','tests/offline/browser/build-guest-source-adapter.mjs',str(output)],cwd=ROOT,check=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(output)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:asyncio.run(run(directory,f'http://127.0.0.1:{server.server_port}'))
    finally:server.shutdown()
