"""Actual dormant settlement source against native Chromium IDB, never app data.
Run: python3 tests/offline/browser/settlement-native.py
Uses installed Python Playwright/Chromium; no package installs or external API.
CHROMIUM_EXECUTABLE_PATH overrides /usr/bin/chromium; when neither is available,
Playwright uses its already-installed Chromium. Never installs a browser itself.
"""
import asyncio
import functools
import http.server
import json
import os
import re
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

async def acceptance(directory, origin):
    passed = []
    async with async_playwright() as playwright:
        profile = str(directory / "chromium-profile")
        home = directory / "browser-home"
        home.mkdir()
        browser_env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / "config")}
        executable = os.environ.get("CHROMIUM_EXECUTABLE_PATH")
        if executable:
            check(Path(executable).is_file(), "explicit Chromium executable missing")
        elif Path("/usr/bin/chromium").is_file():
            executable = "/usr/bin/chromium"
        async def launch():
            browser = await playwright.chromium.launch_persistent_context(
                profile, executable_path=executable, headless=True,
                args=["--disable-background-networking"], env=browser_env,
            )
            await browser.route("**/*", lambda route: route.continue_() if route.request.url.startswith(origin + "/") else route.abort())
            return browser
        async def page(browser, owner="user:synthetic-alice"):
            tab = await browser.new_page()
            await tab.goto(origin)
            await tab.wait_for_function("window.settlementNative !== undefined")
            await tab.evaluate("id => settlementNative.owner(id)", owner)
            check(await tab.evaluate("indexedDB instanceof IDBFactory"), "native IndexedDB absent")
            return tab
        async def read(tab, key="synthetic", store="economy"):
            return await tab.evaluate("([key,store])=>settlementNative.read(key,store)", [key, store])
        async def write(tab, base, value):
            return await tab.evaluate("([base,value])=>settlementNative.write(base === null ? undefined : base,value)", [base, value])
        browser = await launch()
        try:
            user_agent = await browser.pages[0].evaluate("navigator.userAgent")
            match = re.search(r"(?:Chrome|Chromium)/([0-9.]+)", user_agent)
            check(match is not None, "Chromium version unavailable")
            chromium_version = match.group(1)
            a, b = await page(browser), await page(browser)
            check(await write(a, None, {"synthetic": 0}) == {"status": "committed"}, "initial synthetic insert failed")
            base_a, base_b = await asyncio.gather(read(a), read(b))
            check(base_a == base_b and base_a["revision"] == 1, "tabs did not observe same durable baseline")
            results = await asyncio.gather(write(a, base_a, {"synthetic": 1}), write(b, base_b, {"synthetic": 2}))
            check(sum(r["status"] == "committed" for r in results) == 1, "two stale-base contenders both won or both lost")
            losers = [r for r in results if r["status"] == "rejected"]
            check(losers == [{"status": "rejected", "reason": "settlement:stale-record"}], "CAS loser was not stale-record")
            winner = await read(a)
            check(winner == await read(b) and winner["revision"] == 2, "native tabs disagree on winning revision")
            winning_contender = next(index + 1 for index, result in enumerate(results) if result["status"] == "committed")
            check(winner["value"] == {"synthetic": winning_contender}, "persisted value does not match committed contender")
            passed.append("native two-tab stale-snapshot CAS: exactly one winner")

            forged = {**winner, "value": {"synthetic": "forged"}}
            check(await write(b, forged, {"synthetic": 99}) == {"status": "rejected", "reason": "settlement:stale-record"}, "same revision with forged full snapshot accepted")
            check(await read(a) == winner, "forged base changed durable record")
            passed.append("full snapshot compared, not revision alone")

            check(await write(b, winner, {"synthetic": "fresh-retry"}) == {"status": "committed"}, "fresh-base retry failed")
            winner = await read(a)
            check(winner == await read(b) and winner["revision"] == 3 and winner["value"] == {"synthetic": "fresh-retry"}, "fresh retry did not advance winner exactly once")
            passed.append("fresh-base retry after stale rejection advances durable revision")

            abort = await a.evaluate("base=>settlementNative.abortAfterNativePut(base)", winner)
            check(abort == {"reached": ["appliedGrants", "economy", "migrationState"], "reason": "settlement:transaction-aborted"}, "did not abort after successful native puts in all three stores")
            check(await read(a) == winner, "abort left economy write behind")
            check(await read(b, "abort-marker", "appliedGrants") is None, "abort left applied marker")
            check(await read(b, "abort-marker", "migrationState") is None, "abort left migration marker")
            passed.append("abort after three successful native puts rolls back all three writable stores")

            await b.evaluate("settlementNative.owner('user:synthetic-bob')")
            check(await read(b) is None, "Bob inherited Alice's record")
            check(await write(b, None, {"synthetic": "bob"}) == {"status": "committed"}, "Bob insert failed")
            bob = await read(b)
            check(await read(a) == winner and bob["owner"] == "user:synthetic-bob", "owner-isolated writes crossed")
            passed.append("two native tabs keep distinct owner records")

            await a.reload()
            await a.wait_for_function("window.settlementNative !== undefined")
            await a.evaluate("settlementNative.owner('user:synthetic-alice')")
            check(await read(a) == winner, "reload lost winning snapshot")
            passed.append("page reload recovers committed snapshot")
        finally:
            await browser.close()

        # Close and relaunch browser process with same isolated profile/origin.
        # This is clean restart durability, not Android force-stop acceptance.
        browser = await launch()
        try:
            a = await page(browser)
            b = await page(browser, "user:synthetic-bob")
            check(await read(a) == winner and await read(b) == bob, "browser process restart lost owner records")
            passed.append("clean browser process restart preserves both owners")

            stale = {**winner, "revision": 1, "value": {"synthetic": "raw-writer-overwrite"}}
            await a.evaluate("row=>settlementNative.rawOverwrite(row)", stale)
            check(await read(a) == stale and await read(b) == bob, "raw writer negative control did not execute")
            passed.append("NEGATIVE CONTROL: raw same-origin writer bypasses primitive; global exclusion UNPROVEN")
        finally:
            await browser.close()
    return {"result": "NATIVE PRIMITIVE ACCEPTANCE PASS", "chromium_version": chromium_version, "checks": passed,
            "limits": "Dormant API only. No economic admission, idempotency coordinator, global writer exclusion, V17 cutover, production or Android acceptance."}

with tempfile.TemporaryDirectory(prefix="irth-native-settlement-") as temporary:
    directory = Path(temporary)
    assets = directory / "assets"
    assets.mkdir()
    subprocess.run(["node", "tests/offline/browser/build-settlement-native.mjs", str(assets)], cwd=ROOT, check=True)
    # Browser profile/HOME are sibling directories, never served by HTTP.
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(assets)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        result = asyncio.run(acceptance(directory, f"http://127.0.0.1:{server.server_port}"))
        print(json.dumps(result, indent=2))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
