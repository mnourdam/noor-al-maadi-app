"""Real Chromium/React/profile/partition diagnostic. Isolated origin, mocked services.
This demonstrates bounded local hardening AND the known unsupported cross-tab writer.
No production origin, migration to Settlement, or orderly-close/force-stop equivalence.
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

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

async def check(directory, origin):
    errors = []
    external = []
    async with async_playwright() as p:
        browser = await p.chromium.launch_persistent_context(
            str(directory / "browser"), executable_path="/usr/bin/chromium", headless=True,
            args=["--disable-background-networking"])
        async def route(r):
            if r.request.url.startswith(origin + "/"):
                await r.continue_()
            else:
                external.append(r.request.url)
                await r.abort()
        await browser.route("**/*", route)
        async def tab(no_locks=False):
            page = await browser.new_page()
            if no_locks:
                await page.add_init_script("Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})")
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(origin, wait_until="commit", timeout=10000)
            await page.wait_for_function("window.ready===true", timeout=10000)
            return page
        try:
            one = await tab()
            assert await one.evaluate("localStorage.getItem('hakaya.profile.v2')===window.before")
            await one.evaluate("profileApi.addPoints(7)")
            await one.wait_for_function("profileApi.profile.points===107 && diag.stored().points===107")
            await one.evaluate("window.switchAt=114;profileApi.addPoints(7)")
            await one.wait_for_function("diag.owner()==='user:bob' && profileApi.profile.points===200")
            assert await one.evaluate("diag.stored().points") == 200
            await one.evaluate("diag.switchAlice()")
            await one.wait_for_function("profileApi.profile.points===107")
            two = await tab()
            await two.wait_for_function("profileApi.profile.points===107")
            await one.evaluate("profileApi.addPoints(7)")
            await one.wait_for_function("diag.stored().points===114")
            # This MUST remain documented as unsupported, not passed global exclusion.
            await two.evaluate("profileApi.addDinars(1)")
            await two.wait_for_function("diag.stored().points===107 && diag.stored().dinars===501")
            three = await tab(True)
            assert await three.evaluate("typeof navigator.locks==='undefined'")
            await three.evaluate("profileApi.addPoints(2)")
            await three.wait_for_function("diag.stored().points===109")
            names = await three.evaluate("async()=> (await indexedDB.databases()).map(x=>x.name)")
            assert "irth-reward-settlement-v1" not in names
            assert not errors, errors
            assert not external, external
            print(json.dumps({
                "result": "PASS_BOUNDED_HARDENING_GLOBAL_EXCLUSION_UNPROVEN",
                "browser": browser.browser.version,
                "cases": 5,
                "hydrationBytesPreserved": True,
                "oldOwnerPassiveWriteBlocked": True,
                "twoTabs": "REPRO_STALE_CONTEXT_CAN_STILL_OVERWRITE",
                "withoutWebLocks": "LOCAL_ONLY_NO_CAS_CLAIM",
                "settlementOpened": False,
                "pageErrors": errors, "externalRequests": external,
                "androidForceStop": "NOT_TESTED"
            }))
        finally:
            await browser.close()

with tempfile.TemporaryDirectory(prefix="irth-profile-writer-") as tmp:
    directory = Path(tmp)
    output = directory / "site"
    subprocess.run(["node", "tests/offline/browser/build-profile-writer.mjs", str(output)], cwd=ROOT, check=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0),
        functools.partial(Handler, directory=str(output)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        asyncio.run(check(directory, f"http://127.0.0.1:{server.server_port}"))
    finally:
        server.shutdown()
