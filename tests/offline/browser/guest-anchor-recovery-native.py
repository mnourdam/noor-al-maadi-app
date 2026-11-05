"""Actual anchor + recovery adapters with native browser stores/locks and mock Auth only."""
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
def check(v,message):
    if not v:raise AssertionError(message)
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass
async def run(directory,origin):
    cases=[];errors=[];denied=[]
    async with async_playwright() as pw:
        async def launch():
            ctx=await pw.chromium.launch_persistent_context(str(directory/'profile'),executable_path='/usr/bin/chromium',headless=True,args=['--disable-background-networking'])
            async def route(r):
                if r.request.url.startswith(origin+'/'):await r.continue_()
                else:denied.append(r.request.url);await r.abort()
            await ctx.route('**/*',route);return ctx
        async def tab(ctx):
            p=await ctx.new_page();p.set_default_timeout(10000);p.on('pageerror',lambda e:errors.append(str(e)));await p.goto(origin);await p.wait_for_function('window.ready===true');return p
        ctx=await launch();version=ctx.browser.version
        try:
            a=await tab(ctx);info=await a.evaluate('api.info()');check(info['locks'] and info['secure'],'native capabilities missing')
            await a.evaluate('api.seed()');initial=await a.evaluate('api.raw()')
            check((await a.evaluate('api.prepare()'))['state']=='awaiting_auth','prepare failed')
            check((await a.evaluate('api.anchor()'))['target'] is None,'target inferred before auth')
            cases.append('positive one-use synthetic enrollment + real anchor captured before login')
            await a.evaluate('api.finishAuth()');check((await a.evaluate('api.resume()'))['state']=='awaiting_consent','real recovery adapters failed during bind')
            check((await a.evaluate('api.exact()'))['value']==initial,'wrong exact source bytes')
            check(await a.evaluate('api.raw()')==initial,'capture/bind changed source')
            cases.append('actual adapters + actual coordinator: Guest -> mock Alice, no consent/transfer/source mutation')
            wrong=await a.evaluate('api.forged()');check(not wrong['ok'] and wrong['reason']=='source_conflict','physical key substitution accepted')
            cases.append('correct handoff ID with foreign physical key is refused')
            b=await tab(ctx);await a.evaluate('api.startHold()');await a.wait_for_function('api.held()')
            await b.evaluate('api.startWriter()')
            await a.wait_for_function("navigator.locks.query().then(s=>s.pending.some(l=>l.name.includes('campaign_progress_buffer')))" )
            check(not await b.evaluate('api.writerDone()'),'real Guest writer escaped lock');check(await b.evaluate('api.raw()')==initial,'source changed during recovery')
            await a.evaluate('api.release()');check((await a.evaluate('api.finish()'))['value']==initial,'callback saw changed snapshot')
            check(await b.evaluate('api.writerResult()')=={'saved':True},'cooperating writer failed after release')
            cases.append('two tabs: actual buffer writer waits until complete recovery callback and validation')
            await a.evaluate('api.seedSource()')
            await a.evaluate('api.startHold()');await a.wait_for_function('api.held()')
            await b.evaluate("api.seedSource('uncooperative-old-writer')")
            await a.evaluate('api.release()');bad=await a.evaluate('api.finish()')
            check(not bad['ok'] and bad['reason']=='snapshot_conflict','old writer change not detected')
            check(await a.evaluate('api.raw()')=='uncooperative-old-writer','adapter rewrote old-writer bytes')
            cases.append('noncooperating writer is detected but never claimed excluded or rolled back')
            await a.evaluate('api.seedSource()')
            # Restore b local user identity without replacing its mock session lineage (test setup only).
            await b.evaluate("api.manualOwner('user:alice')")
            await a.evaluate("""()=>{const p=JSON.parse(localStorage.getItem('test-only:auth-receipt'));localStorage.setItem('test-only:auth-session',JSON.stringify({uid:p.uid,attemptId:p.attemptId}));}""")
            revision=(await a.evaluate('api.anchor()'))['revision']
            writes=await asyncio.gather(a.evaluate('(r)=>api.bump(r)',revision),b.evaluate('(r)=>api.bump(r,true)',revision))
            check(writes[0]['ok'] and not writes[1]['ok'],'conflicting native anchor write accepted')
            check((await a.evaluate('api.anchor()'))['target']['uid']=='alice','anchor rebound')
            cases.append('two native anchor ports serialize revisions and refuse conflicting Bob binding')
            await a.evaluate('api.close()');await b.evaluate('api.close()');anchor=await a.evaluate('api.anchorBytes()')
        finally:await ctx.close()
        ctx=await launch()
        try:
            a=await tab(ctx)
            check((await a.evaluate('api.resume()'))['state']=='awaiting_consent','persistent browser reopen failed')
            check(await a.evaluate('api.anchorBytes()')==anchor,'restart changed anchor');check(await a.evaluate('api.raw()')==initial,'restart changed source')
            cases.append('orderly persistent browser close/reopen: exact anchor/journal/source recovery')
            await a.evaluate("api.manualOwner('user:bob')");check(not (await a.evaluate('api.exact()'))['ok'],'Bob read Alice source')
            cases.append('Bob session cannot use Alice evidence')
            await a.evaluate("api.manualOwner('user:alice')");check(not (await a.evaluate('api.exact()'))['ok'],'Alice roundtrip reused old session')
            cases.append('Alice -> Bob -> Alice with replaced session lineage is blocked')
            await a.evaluate("""()=>{const p=JSON.parse(localStorage.getItem('test-only:auth-receipt'));localStorage.setItem('test-only:auth-session',JSON.stringify({uid:p.uid,attemptId:p.attemptId}));}""")
            await a.evaluate('api.corruptJournal()');check((await a.evaluate('api.resume()'))['state']=='blocked','corrupt journal accepted')
            await a.evaluate('api.restoreJournal()');cases.append('corrupt native journal is not source authority')
            await a.evaluate("api.restoreAnchor('{bad')");check((await a.evaluate('api.resume()'))['state']=='blocked','corrupt anchor accepted');check(await a.evaluate('api.anchorBytes()')=='{bad','corrupt anchor overwritten')
            await a.evaluate('(v)=>api.restoreAnchor(v)',anchor);cases.append('corrupt native anchor retained and refused')
            await a.evaluate('api.loseJournal()');check((await a.evaluate('api.resume()'))['state']=='blocked','missing journal reminted intent')
            check(await a.evaluate('api.anchorBytes()')==anchor,'missing journal changed anchor');cases.append('missing native journal preserves anchor and refuses remint')
            await a.evaluate('api.removeAnchor()');check((await a.evaluate('api.resume()'))['reason']=='anchor_missing','missing anchor treated as new')
            check(await a.evaluate('api.raw()')==initial,'negative cases changed buffer');cases.append('missing anchor never triggers automatic enrollment')
            check(not errors,'page errors: '+str(errors));check(not denied,'external page requests: '+str(denied))
            print(json.dumps({'result':'PASS','sameActualAdapters':True,'nativeChromium':version,'cases':cases,'count':len(cases),'externalPageRequests':len(denied),'forceStopTested':False,'android':'PENDING_NOT_TESTED'},ensure_ascii=False))
        finally:await ctx.close()
with tempfile.TemporaryDirectory(prefix='irth-anchor-recovery-') as temp:
    directory=Path(temp);output=directory/'site'
    subprocess.run(['node','tests/offline/browser/build-guest-anchor-recovery.mjs',str(output)],cwd=ROOT,check=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(output)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:asyncio.run(run(directory,f'http://127.0.0.1:{server.server_port}'))
    finally:server.shutdown()
