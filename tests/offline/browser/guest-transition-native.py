"""Native LS/IDB/Locks with actual coordinator and mock auth only; temporary local origin."""
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
            a=await tab(ctx);info=await a.evaluate('api.info()');check(info['locks'] and info['secure'],'native capabilities unavailable')
            await a.evaluate('api.seed()');initial=await a.evaluate('api.raw()')
            prepared=await a.evaluate('api.prepare()');check(prepared['state']=='awaiting_auth','prepare failed')
            before=await a.evaluate('api.anchor()');check(before['phase']=='captured' and before['target'] is None,'auth inferred at capture')
            check(await a.evaluate('api.raw()')==initial,'source mutated')
            cases.append('actual source adapter and coordinator: native anchor + journal captured before auth')
            await a.evaluate('api.finishAuth()')
            bound=await a.evaluate('api.resume()');check(bound['state']=='awaiting_consent' and not bound['handoffConfirmed'],'verified auth did not stop at consent')
            anchor=await a.evaluate('api.anchor()');check(anchor['target']['uid']=='alice','wrong target')
            check(await a.evaluate('api.raw()')==initial,'target binding changed buffer')
            cases.append('mock auth receipt + actual owner/epoch change -> journal binding only, no consent/grant')
            await a.evaluate('api.close()')
        finally:await ctx.close()
        ctx=await launch()
        try:
            a=await tab(ctx)
            recovered=await a.evaluate('api.resume()');check(recovered['state']=='awaiting_consent','restart recovery failed')
            check(await a.evaluate('api.anchor()')==anchor,'restart replaced anchor')
            check(await a.evaluate('api.raw()')==initial,'restart changed source')
            cases.append('orderly persistent browser close/reopen restores exact anchor/journal, freshly verifies session')
            b=await tab(ctx);check((await b.evaluate('api.resume()'))['state']=='awaiting_consent','second tab recovery failed')
            cases.append('second same-origin execution context resumes same immutable target without duplicate binding')
            await a.evaluate("api.manualOwner('user:bob')")
            denied_bob=await a.evaluate('api.resume()');check(denied_bob['state']=='blocked','Bob took Alice handoff')
            check(await a.evaluate('api.anchor()')==anchor,'Bob changed binding')
            cases.append('synthetic Bob session cannot reuse Alice transition receipt')
            await a.evaluate("api.manualOwner('user:alice')")
            check((await a.evaluate('api.resume()'))['state']=='blocked','Alice/Bob/Alice reused an old session lineage')
            cases.append('Alice -> Bob -> Alice requires original session continuity, not UID equality')
            # b retains its synthetic Alice runtime; shared fake SDK session was replaced, so no new proof.
            await a.evaluate("api.manualOwner('guest:native-transition-device')")
            check((await a.evaluate('api.startDifferent()'))['state']=='blocked','new transition bypassed original binding')
            check(await a.evaluate('api.anchor()')==anchor,'guest return changed claim')
            cases.append('return to Guest + another transition cannot remint/reassign source')
            # Restore original synthetic SDK session using test-owned stored receipt, not player credentials.
            await b.evaluate("""()=>{const receipt=JSON.parse(localStorage.getItem('test-only:auth-receipt'));localStorage.setItem('test-only:auth-session',JSON.stringify({uid:receipt.uid,attemptId:receipt.attemptId}));api.loseJournal();}""")
            missing=await b.evaluate('api.resume()');check(missing['state']=='blocked','missing journal accepted')
            check(await b.evaluate('api.anchor()')==anchor,'missing journal reminted intent')
            cases.append('missing native journal with durable anchor blocks; no replacement intent')
            await b.evaluate('api.removeAnchor()')
            check((await b.evaluate('api.resume()'))['reason']=='anchor_missing','missing anchor treated as fresh source')
            cases.append('missing anchor is never interpreted as first use')
            check(await b.evaluate('api.raw()')==initial,'negative cases changed source')
            check(not errors,'page errors: '+str(errors));check(not denied,'external requests: '+str(denied))
            print(json.dumps({'result':'PASS','sameActualCoordinator':True,'nativeChromium':version,'cases':cases,'count':len(cases),'externalPageRequests':len(denied),'forceStopTested':False,'android':'PENDING_NOT_TESTED'},ensure_ascii=False))
        finally:await ctx.close()
with tempfile.TemporaryDirectory(prefix='irth-transition-prototype-') as temp:
    directory=Path(temp);output=directory/'site'
    subprocess.run(['node','tests/offline/browser/build-guest-transition.mjs',str(output)],cwd=ROOT,check=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(output)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:asyncio.run(run(directory,f'http://127.0.0.1:{server.server_port}'))
    finally:server.shutdown()
