"""Optional native-IDB contract checks. Existing Python Playwright + Chromium only.
Run from repository root: python3 tests/offline/browser/durable-intent-native.py
No installs, app server, production origin, network service or real player data.
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

ROOT = Path(__file__).resolve().parents[3]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def check(condition, message):
    if not condition:
        raise AssertionError(message)


with tempfile.TemporaryDirectory(prefix="irth-native-intent-") as temporary:
    directory = Path(temporary)
    # Transpile the SAME test helper; not an independently reimplemented algorithm.
    script = """
import ts from 'typescript'; import fs from 'node:fs';
const code = fs.readFileSync('tests/offline/helpers/indexeddb-intent-prototype.ts','utf8');
process.stdout.write(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
"""
    javascript = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT)
    (directory / "prototype.js").write_bytes(javascript)
    (directory / "index.html").write_text("<!doctype html><title>Isolated synthetic IDB test</title>")
    handler = functools.partial(QuietHandler, directory=temporary)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    async def main():
        async with async_playwright() as playwright:
            profile = str(directory / "chromium-profile")
            async def launch():
                browser = await playwright.chromium.launch_persistent_context(
                    profile, executable_path="/usr/bin/chromium", headless=True,
                    args=["--disable-background-networking"],
                )
                await browser.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/") else route.abort())
                return browser

            async def page(browser, instance="native", epoch=1):
                tab = await browser.new_page()
                await tab.goto(origin)
                await tab.evaluate("""async ({instance, epoch}) => {
                    const m = await import('/prototype.js');
                    window.db = await m.openIntentPrototype(indexedDB, 'irth-test-durable-intent-native');
                    window.identity = {owner:'user:alice', epoch, generation:1, instanceId:instance};
                    window.listeners = new Set(); window.hook = () => {};
                    window.api = m.createIntentPrototype({db, session:identity, readSession:()=>identity,
                      subscribe:cb=>{listeners.add(cb);return ()=>listeners.delete(cb)},
                      checkpoint:(point,tx)=>hook(point,tx)});
                }""", {"instance": instance, "epoch": epoch})
                return tab

            browser = await launch()
            tab = await page(browser)
            try:
                await tab.evaluate("""async () => {
                  if (!(indexedDB instanceof IDBFactory)) throw Error('native IDB unavailable');
                  await new Promise((resolve,reject)=>{const tx=db.transaction('syntheticEconomy','readwrite');
                    tx.objectStore('syntheticEconomy').put({schema:1,owner:'user:alice',value:100,revision:0},'user:alice');
                    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
                  await api.admit('restart',{kind:'increment',by:50});
                }""")
            finally:
                await browser.close()
            # Real browser process reopen with the same temporary persistent profile and origin.
            browser = await launch()
            try:
                one = await page(browser, "restart", 2)
                two = await page(browser, "independent", 2)
                async def state():
                    return await one.evaluate("""() => new Promise((resolve,reject)=>{
                      const tx=db.transaction('syntheticEconomy'), req=tx.objectStore('syntheticEconomy').get('user:alice');
                      tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error)})""")
                found = await one.evaluate("() => api.discover()")
                check(found[0]["state"] == "pending", "pending lost after browser restart")
                await one.evaluate("async () => {await api.apply('restart');await api.apply('restart')}")
                check((await state())["value"] == 150, "restart replay duplicated effect")

                await asyncio.gather(*[p.evaluate("() => api.admit('same',{kind:'increment',by:10})") for p in [one,two]])
                results = await asyncio.gather(*[p.evaluate("() => api.apply('same')") for p in [one,two]])
                check(results[0]["applied"] == results[1]["applied"], "concurrent receipt mismatch")
                check((await state())["value"] == 160, "concurrent ID duplicated")
                await asyncio.gather(one.evaluate("() => api.admit('different-a',{kind:'increment',by:5})"),
                                     two.evaluate("() => api.admit('different-b',{kind:'increment',by:7})"))
                await asyncio.gather(one.evaluate("() => api.apply('different-a')"), two.evaluate("() => api.apply('different-b')"))
                check((await state())["value"] == 172, "different concurrent effects lost")
                check((await state())["revision"] == 4, "revision serialization failed")

                aborted = await one.evaluate("""async () => {
                  await api.admit('abort',{kind:'increment',by:50});
                  hook=(point,tx)=>{if(point==='intent_applied_put_success')tx.abort()};
                  try{await api.apply('abort');return false}catch{return true}finally{hook=()=>{}}
                }""")
                check(aborted and (await state())["value"] == 172, "put success was mistaken for commit")
                found = await two.evaluate("() => api.discover()")
                check(next(i for i in found if i['id']=='abort')['state'] == 'pending', "abort persisted applied marker")
                await two.evaluate("() => api.apply('abort')")
                check((await state())["value"] == 222, "abort retry failed")

                lost = await one.evaluate("""async () => {
                  await api.admit('lost',{kind:'increment',by:3});
                  hook=point=>{if(point==='transaction_complete')throw Error('lost reply')};
                  try{await api.apply('lost');return false}catch{return true}finally{hook=()=>{}}
                }""")
                check(lost, "lost reply not injected")
                await two.evaluate("() => api.apply('lost')")
                check((await state())["value"] == 225, "lost reply duplicated effect")

                terminal = await one.evaluate("""async () => {
                  await api.admit('noop',{kind:'increment',by:0});await api.apply('noop');
                  await api.admit('reject',{kind:'increment',by:999});await api.disposition('reject','rejected','synthetic rejection');
                  return [(await api.apply('noop')).state,(await api.apply('reject')).state];
                }""")
                check(terminal == ['cancelled','rejected'] and (await state())["value"] == 225, "terminal intent replayed")

                switched = await one.evaluate("""async () => {
                  await api.admit('identity',{kind:'increment',by:100});
                  hook=point=>{if(point==='economy_put_success'){
                    identity={...identity,owner:'user:bob',epoch:3};for(const notify of listeners)notify();
                    identity={...identity,owner:'user:alice',epoch:4};for(const notify of listeners)notify();}};
                  try{await api.apply('identity');return false}catch{return true}finally{hook=()=>{}}
                }""")
                check(switched and (await state())["value"] == 225, "identity switch failed to abort")
                fresh = await page(browser, "returned-alice", 4)
                await fresh.evaluate("() => api.apply('identity')")
                check((await state())["value"] == 325, "new session recovery failed")
                print(json.dumps({"nativeIndexedDB":"PASS","scenarios":7,
                    "browser":browser.browser.version,"persistentBrowserReopen":True,
                    "finalValue":325,"finalRevision":7}))
            finally:
                await browser.close()

    try:
        asyncio.run(main())
    finally:
        server.shutdown()
