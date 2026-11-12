"""Synthetic Chromium image transport only. Not full app, native or production QA."""
import asyncio
import functools
import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]
SIZE = 65536
SVG_START = b'<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="gold"/><!--'
SVG_END = b'--></svg>'
BODY = SVG_START + b'x' * (SIZE - len(SVG_START) - len(SVG_END)) + SVG_END

class Transport:
    def __init__(self):
        self.release = threading.Event()
        self.lock = threading.Lock()
        self.arrivals = self.active = self.peak = self.bytes = 0
    def snapshot(self):
        with self.lock:
            return dict(arrivals=self.arrivals, active=self.active, peak=self.peak, bodyBytes=self.bytes)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, state, **kwargs):
        self.state = state
        super().__init__(*args, **kwargs)
    def log_message(self, *_args):
        pass
    def do_GET(self):
        if re.fullmatch(r'/images/(?:[0-9]|[1-9][0-9]|1[0-4][0-9])\.svg', self.path):
            with self.state.lock:
                self.state.arrivals += 1
                self.state.active += 1
                self.state.peak = max(self.state.peak, self.state.active)
            try:
                if not self.state.release.wait(60):
                    self.send_error(504)
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'image/svg+xml')
                self.send_header('Content-Length', str(SIZE))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(BODY)
                self.wfile.flush()
                with self.state.lock:
                    self.state.bytes += SIZE
            finally:
                with self.state.lock:
                    self.state.active -= 1
        elif urlsplit(self.path).path in ('/', '/fixture.js', '/favicon.ico'):
            if urlsplit(self.path).path == '/favicon.ico':
                self.send_response(204)
                self.end_headers()
            else:
                super().do_GET()
        else:
            self.send_error(404)

async def until(predicate, timeout=15):
    end = asyncio.get_running_loop().time() + timeout
    while not predicate():
        if asyncio.get_running_loop().time() >= end:
            raise AssertionError('bounded observation timeout')
        await asyncio.sleep(.05)

async def measure(p, directory, site, mode):
    state = Transport()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(site), state=state))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    requests, failures, errors, external, websockets = [], [], [], [], []
    context = None
    try:
        context = await p.chromium.launch_persistent_context(str(directory / f'profile-{mode}'),
            executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'], headless=True,
            viewport={'width': 800, 'height': 600}, service_workers='block',
            args=['--disable-background-networking'])
        async def route(r):
            u = urlsplit(r.request.url)
            if (u.scheme, u.netloc) == ('http', f'127.0.0.1:{server.server_port}') and not u.username and not u.password:
                await r.continue_()
            else:
                external.append('blocked')
                await r.abort()
        await context.route('**/*', route)
        async def ws(socket):
            websockets.append('blocked')
            await socket.close()
        await context.route_web_socket('**/*', ws)
        page = await context.new_page()
        cdp = await context.new_cdp_session(page)
        version = (await cdp.send('Browser.getVersion'))['product']
        assert isinstance(version, str) and version
        await cdp.detach()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('request', lambda r: requests.append(r.url) if '/images/' in r.url else None)
        page.on('requestfailed', lambda r: failures.append('image failed') if '/images/' in r.url else None)
        await page.goto(origin + '/?mode=' + mode, wait_until='domcontentloaded')
        await page.wait_for_function('window.fixture !== undefined')
        if mode == 'baseline':
            await until(lambda: len(requests) == 150)
        else:
            await until(lambda: len(requests) > 0)
            # Bounded observation to expose eager fetching; not a universal timing guarantee.
            await page.wait_for_timeout(1000)
            assert 1 <= len(requests) <= 12, len(requests)
        initial = len(requests)
        assert len(set(requests)) == initial
        held = state.snapshot()
        assert held['bodyBytes'] == 0 and held['arrivals'] > 0
        await page.locator('#action').click(timeout=5000)
        assert await page.locator('#action').inner_text() == 'Action 1'
        assert state.snapshot()['bodyBytes'] == 0
        state.release.set()
        await page.wait_for_function('(n) => document.querySelectorAll("article img").length === n', arg=initial)
        # Native lazy imgs outside viewport may not decode yet. Visible ones must.
        await page.wait_for_function('''() => { const visible=[...document.querySelectorAll('article img')].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<600}); return visible.length>0 && visible.every(i=>i.complete && i.naturalWidth===56); }''')
        await until(lambda: state.snapshot()['bodyBytes'] == initial * SIZE)
        assert await page.evaluate('fixture.cached()') == initial
        await page.evaluate('fixture.remount()')
        await page.wait_for_function('(n) => document.querySelectorAll("article img").length === n', arg=initial)
        await page.wait_for_timeout(500)
        assert len(requests) == initial
        if mode == 'wrapper':
            await page.evaluate('window.scrollTo(0, 5000)')
            await until(lambda: len(requests) > initial)
            await page.wait_for_timeout(500)
            assert initial < len(requests) <= initial + 14, len(requests)
            await page.wait_for_function('''() => [...document.querySelectorAll('article img')].filter(i=>{const r=i.getBoundingClientRect();return r.bottom>0&&r.top<600}).some(i=>i.complete && i.naturalWidth===56)''')
            await until(lambda: state.snapshot()['bodyBytes'] == len(requests) * SIZE)
        assert not errors and not external and not failures and not websockets
        return dict(mode=mode, browser=version, initialInitiatedRequests=initial,
            heldServer=held, finalInitiatedRequests=len(requests), finalServer=state.snapshot(),
            warmAdditionalRequests=0, heldFixtureButton='PASS', viewport=[800, 600],
            syntheticBodyBytesEach=SIZE, actualAppNotificationRPC='NOT_TESTED', productionPerformance='NOT_TESTED')
    finally:
        state.release.set()
        if context:
            await context.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

async def main():
    with tempfile.TemporaryDirectory(prefix='irth-notification-images-') as tmp:
        directory = Path(tmp)
        site = directory / 'site'
        subprocess.run(['node', 'tests/offline/browser/build-notification-images.mjs', str(site)], cwd=ROOT, check=True)
        async with async_playwright() as p:
            baseline = await measure(p, directory, site, 'baseline')
            wrapper = await measure(p, directory, site, 'wrapper')
            assert baseline['initialInitiatedRequests'] == 150
            assert wrapper['initialInitiatedRequests'] < baseline['initialInitiatedRequests']
            print(json.dumps(dict(result='PASS_SYNTHETIC_BROWSER_ONLY', baseline=baseline, wrapper=wrapper)))

if __name__ == '__main__':
    asyncio.run(main())
