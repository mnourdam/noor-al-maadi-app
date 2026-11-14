"""CI-only real Chromium decode, not Android or airplane-mode acceptance."""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright


def main():
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='irth-image-decode-', dir='/tmp') as temp:
        assets = Path(temp) / 'assets'
        subprocess.run(['node', 'tests/offline/browser/build-image-decode.mjs', str(assets)], check=True, stdout=subprocess.DEVNULL)
        manifest = json.loads((assets / 'manifest.json').read_text())
        assert len(manifest['paths']) == len(set(manifest['paths'])) == 2425
        assert manifest['counts'] == {'chapter':637,'story':1785,'interpretive':3,'total':2425}
        assert len(manifest['interpretive']) == 3 and len(manifest['sourceHashes']) == 3
        allowed = {'/', '/index.html', '/fixture.js', '/malformed.webp', '/missing.webp'} | {'/' + p for p in manifest['paths']}
        # Build may emit lazily imported production chunks. Permit only generated JS.
        allowed |= {'/' + str(p.relative_to(assets)) for p in assets.rglob('*.js')}
        class Handler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_GET(self):
                u = urlsplit(self.path)
                if u.path not in allowed or u.query or u.fragment:
                    self.send_error(403); return
                super().do_GET()
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(assets)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
        blocked = []
        seen = set()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE_PATH') or p.chromium.executable_path, headless=True)
                context = browser.new_context(service_workers='block')
                def route(r):
                    u = urlsplit(r.request.url)
                    if f'{u.scheme}://{u.netloc}' != origin or u.username or u.password or u.query or u.fragment or u.path not in allowed:
                        blocked.append(True); r.abort(); return
                    seen.add(u.path); r.continue_()
                context.route('**/*', route)
                def websocket(ws): blocked.append(True); ws.close()
                context.route_web_socket('**/*', websocket)
                page = context.new_page()
                controls = {}
                page_errors = []
                failed_requests = []
                page.on('pageerror', lambda _: page_errors.append(True))
                page.on('requestfailed', lambda _: failed_requests.append(True))
                page.on('response', lambda response: controls.update({urlsplit(response.url).path: response}) if urlsplit(response.url).path in {'/malformed.webp', '/missing.webp'} else None)
                page.goto(origin, wait_until='load', timeout=30000)
                page.wait_for_function('typeof window.runDecode === "function"', timeout=30000)
                # Outer deadline survives stalled renderer; fixture has per-image and total deadlines too.
                page.evaluate('window.decodeOutcome=null;window.runDecode().then(value=>window.decodeOutcome={ok:true,value},()=>window.decodeOutcome={ok:false})')
                page.wait_for_function('window.decodeOutcome !== null', timeout=660000)
                result = page.evaluate('window.decodeOutcome')
                assert result['ok'] is True and result['value']['count'] == 2425
                assert {key:result['value'][key] for key in ['chapter','story','interpretive']} == {'chapter':637,'story':1785,'interpretive':3}
                assert not page_errors and not failed_requests
                assert not blocked and all('/' + x in seen for x in manifest['paths'])
                assert controls['/malformed.webp'].status == 200 and controls['/malformed.webp'].body() == b'not an image'
                assert controls['/missing.webp'].status == 404
                assert result['value']['negativeControls'] == 2 and result['value']['forbidden'] == 0
                evidence = {'status':'PASS','scope':'Chromium local HTTP decode, not native or airplane mode','chromium':browser.version,'referencedBytes':manifest['bytes'],'elapsedSeconds':round(time.monotonic()-started,2),'sourceHashes':manifest['sourceHashes'],'interpretive':manifest['interpretive'],'results':result['value'],'unexpectedRequests':len(blocked),'pageErrors':len(page_errors),'failedRequests':len(failed_requests)}
                context.close(); browser.close()
        finally:
            server.shutdown(); server.server_close()
    print(json.dumps(evidence))


if __name__ == '__main__':
    main()
