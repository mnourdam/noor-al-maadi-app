"""Bounded synthetic Chromium protocol diagnostic; NOT app acceptance."""
import asyncio
import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.async_api import async_playwright

hits = []
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        hits.append(self.path)
        body = b'ok'
        self.send_response(200)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *_):
        pass

async def probe(page, url):
    return await page.evaluate('''async url => {
      try { const r = await fetch(url, {cache:'no-store', signal:AbortSignal.timeout(3000)});
        return {ok:r.ok, status:r.status}; }
      catch(e) { return {ok:false, error:e.name}; }
    }''', url)

async def run_case(browser_type, origin, mode):
    with tempfile.TemporaryDirectory(prefix='irth-network-diag-') as profile:
        context = await browser_type.launch_persistent_context(profile, headless=True, service_workers='block')
        try:
            # Route ONLY the static boot document. Sentinels use real network I/O.
            await context.route(origin+'/boot', lambda route: route.fulfill(status=200, content_type='text/html', body='<script>window.events=[];addEventListener("online",()=>events.push("online"));addEventListener("offline",()=>events.push("offline"));</script>'))
            baseline = await context.new_page()
            await baseline.goto(origin+'/boot')
            before = await probe(baseline, origin+'/'+mode+'-before')
            assert before['ok'], 'Online control failed'
            await baseline.close()
            await context.set_offline(True)
            page = await context.new_page()
            session = None
            if mode == 'legacy-reassert':
                await context.set_offline(True)
            if mode == 'modern-page':
                session = await context.new_cdp_session(page)
                await session.send('Network.enable')
                await session.send('Network.emulateNetworkConditionsByRule', {
                    'offline': True, 'matchedNetworkConditions': [
                        {'urlPattern':'', 'latency':0, 'downloadThroughput':-1, 'uploadThroughput':-1, 'offline':True}]})
                await session.send('Network.overrideNetworkState', {'offline':True, 'latency':0, 'downloadThroughput':-1, 'uploadThroughput':-1})
            await page.goto(origin+'/boot')
            state = await page.evaluate('({online:navigator.onLine,events:window.events})')
            offline = await probe(page, origin+'/'+mode+'-offline')
            reached = '/'+mode+'-offline' in hits
            if session:
                await session.send('Network.emulateNetworkConditionsByRule', {'offline':False,'matchedNetworkConditions':[]})
                await session.send('Network.overrideNetworkState', {'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
            await context.set_offline(False)
            after = await probe(page, origin+'/'+mode+'-after')
            assert after['ok'], 'Restored online control failed'
            return {'mode':mode, 'state':state, 'offlineFetch':offline, 'offlineReachedServer':reached, 'onlineControl':before, 'restoredControl':after}
        finally:
            await context.close()

async def main():
    server = ThreadingHTTPServer(('127.0.0.1',0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results=[]
    try:
        async with async_playwright() as p:
            for mode in ('legacy','legacy-reassert','modern-page'):
                try:
                    results.append(await asyncio.wait_for(run_case(p.chromium, 'http://127.0.0.1:'+str(server.server_port), mode), 45))
                except Exception as e:
                    results.append({'mode':mode,'diagnosticError':type(e).__name__,'detail':str(e)[:1500]})
        print(json.dumps({'diagnosticOnly':True,'appAcceptance':False,'results':results},indent=2))
        if any('diagnosticError' in r for r in results):
            raise SystemExit(1)
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    asyncio.run(main())
