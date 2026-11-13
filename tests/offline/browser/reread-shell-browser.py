"""Selected real React surfaces/CSS in Chromium; no native Back, full app or backend."""
import asyncio, functools, http.server, json, os, subprocess, tempfile, threading, sys, math
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[3]
REPORT={'result':'FAIL','stage':'build','checks':[]}
def bounded_number(value):
    if type(value) not in (int,float) or not math.isfinite(value) or abs(value)>1000000:return None
    return round(value,3)
def geometry_evidence(raw):
    names=('content','multiline','positive_box','viewport','horizontal_scroll','vertical_scroll','unclamped','not_ellipsis','ranges_contained')
    if not isinstance(raw,dict) or set(raw.get('tests',{}))!=set(names):raise ValueError('geometry_schema')
    if any(type(v) is not bool for v in raw['tests'].values()):raise ValueError('geometry_schema')
    numbers=raw.get('numbers',{})
    expected=('left','right','top','bottom','width','height','client_width','scroll_width','client_height','scroll_height','line_count','min_left','max_right','min_top','max_bottom','viewport_width')
    if set(numbers)!=set(expected):raise ValueError('geometry_schema')
    return {'tests':raw['tests'],'numbers':{k:bounded_number(numbers[k]) for k in expected}}

CHARACTER_PROBE=r"""(el)=>{
 const limit=2048, recordLimit=16, box=el.getBoundingClientRect(), style=getComputedStyle(el);
 const categories=['ASCII_SPACE','LINE_BREAK','OTHER_WHITESPACE','NON_WHITESPACE'];
 const counts=Object.fromEntries(categories.map(k=>[k,{characters:0,rectangles:0,zero_width:0,outside:0,non_hanging_outside:0}]));
 const violations=[];let inspected=0,total=0,nodeIndex=0;
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;let offset=0;
  for(const ch of node.textContent){
   total++;const end=offset+ch.length;
   if(inspected<limit){
    inspected++;
    const category=ch===' '?'ASCII_SPACE':(ch==='\n'||ch==='\r')?'LINE_BREAK':/\s/u.test(ch)?'OTHER_WHITESPACE':'NON_WHITESPACE';
    const c=counts[category];c.characters++;
    const range=document.createRange();range.setStart(node,offset);range.setEnd(node,end);
    for(const r of range.getClientRects()){
     c.rectangles++;if(r.width===0)c.zero_width++;
     const outside=r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1;
     if(outside){c.outside++;if(category!=='ASCII_SPACE'||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1)c.non_hanging_outside++;if(violations.length<recordLimit)violations.push({category,node:nodeIndex,start:offset,end,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});}
    }
   }
   offset=end;
  }
  nodeIndex++;
 }
 return {limit,record_limit:recordLimit,total,inspected,truncated:total>inspected,counts,violations,
  style:{white_space:style.whiteSpace,direction:style.direction,overflow_x:style.overflowX,overflow_y:style.overflowY}};
}"""
def character_evidence(raw):
    categories=('ASCII_SPACE','LINE_BREAK','OTHER_WHITESPACE','NON_WHITESPACE')
    if not isinstance(raw,dict) or raw.get('limit')!=2048 or raw.get('record_limit')!=16:raise ValueError('character_schema')
    total,inspected=raw.get('total'),raw.get('inspected')
    if type(total) is not int or type(inspected) is not int or not 0<=inspected<=min(total,2048) or total>1000000:raise ValueError('character_schema')
    if type(raw.get('truncated')) is not bool or raw['truncated']!=(total>inspected):raise ValueError('character_schema')
    counts=raw.get('counts',{})
    keys=('characters','rectangles','zero_width','outside','non_hanging_outside')
    if set(counts)!=set(categories):raise ValueError('character_schema')
    for value in counts.values():
        if set(value)!=set(keys) or any(type(n) is not int or n<0 or n>1000000 for n in value.values()):raise ValueError('character_schema')
    if sum(v['characters'] for v in counts.values())!=inspected:raise ValueError('character_schema')
    records=raw.get('violations')
    if not isinstance(records,list) or len(records)>16:raise ValueError('character_schema')
    nums=('node','start','end','left','right','top','bottom','width','height')
    safe=[]
    for record in records:
        if record.get('category') not in categories:raise ValueError('character_schema')
        safe.append({'category':record['category'],**{k:bounded_number(record.get(k)) for k in nums}})
    allowed={'white_space':('normal','pre','pre-wrap','pre-line','nowrap','break-spaces'),'direction':('rtl','ltr'),'overflow_x':('visible','hidden','clip','scroll','auto'),'overflow_y':('visible','hidden','clip','scroll','auto')}
    style=raw.get('style',{})
    return {'limit':2048,'record_limit':16,'total':total,'inspected':inspected,'truncated':raw['truncated'],
            'counts':{c:{k:bounded_number(counts[c][k]) for k in keys} for c in categories},'violations':safe,
            'style':{k:style.get(k) if style.get(k) in values else 'other' for k,values in allowed.items()}}

def visible_geometry_passes(geometry,characters,element):
    tests=geometry['tests']
    if not all(value for key,value in tests.items() if key!='ranges_contained'):return False
    if characters['truncated'] or characters['total']!=characters['inspected']:return False
    nonwhite=characters['counts']['NON_WHITESPACE']
    if nonwhite['characters']<=0 or nonwhite['rectangles']<=nonwhite['zero_width']:return False
    if any(count['non_hanging_outside']>0 for count in characters['counts'].values()):return False
    if tests['ranges_contained']:return True
    style=characters['style']
    if element!='note' or style!={'white_space':'pre-wrap','direction':'rtl','overflow_x':'visible','overflow_y':'visible'}:return False
    if characters['counts']['ASCII_SPACE']['outside']<=0:return False
    if any(count['outside']>0 for category,count in characters['counts'].items() if category!='ASCII_SPACE'):return False
    # Only measured RTL ASCII-space left-edge hanging is exempt, not general whitespace.
    return all(count['non_hanging_outside']==0 for count in characters['counts'].values())

async def close_preserving_primary(context):
    active=sys.exc_info()[0] is not None
    try:await context.close()
    except Exception:
        REPORT['cleanup_failed']=True
        if not active:raise
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path in ('/favicon.ico','/arabesque-pattern.png'):
            # Decorative texture deliberately excluded; no production public assets.
            self.send_response(204); self.end_headers(); return
        super().do_GET()
async def acceptance(directory,origin):
    from playwright.async_api import async_playwright, expect
    checks=[]; blocked=[]; errors=[]
    REPORT.update(stage="launch",checks=checks,blocked_requests=0,page_errors=0)
    def error_event():
        errors.append('pageerror');REPORT['page_errors']=len(errors)
    async with async_playwright() as p:
        async def launch():
            context=await p.chromium.launch_persistent_context(str(directory/'profile'),executable_path=os.environ['CHROMIUM_EXECUTABLE_PATH'],headless=True,service_workers='block',args=['--disable-background-networking'])
            async def route(r):
                u=urlsplit(r.request.url)
                if u.scheme=='http' and u.netloc==urlsplit(origin).netloc and not u.username and not u.password and (u.path in ('/','/fixture.js','/favicon.ico','/arabesque-pattern.png') or u.path.startswith('/assets/')):
                    await r.continue_()
                else: blocked.append('request'); REPORT['blocked_requests']=len(blocked); await r.abort()
            async def ws(socket): blocked.append('websocket'); REPORT['blocked_requests']=len(blocked); await socket.close()
            await context.route('**/*',route); await context.route_web_socket('**/*',ws)
            context.on('page',lambda page:page.on('pageerror',lambda _:error_event()))
            return context
        context=await launch()
        REPORT['stage']='initial_controls'
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
            trigger=page.get_by_role('button',name='Reread chapter text',exact=True)
            for width in [360,390,768]:
                await page.set_viewport_size({'width':width,'height':900})
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                assert await page.locator('nav').evaluate('(el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1}')
                assert await page.locator('nav a').evaluate_all('(links)=>links.length===6&&links.every(el=>{const b=el.getBoundingClientRect();return b.width>0&&el.textContent.trim()&&el.scrollWidth<=el.clientWidth+1})')
                await trigger.click(); dialog=page.get_by_role('dialog'); await expect(dialog).to_be_visible()
                assert await dialog.evaluate('(el)=>{const b=el.getBoundingClientRect();return b.width>0&&b.left>=-1&&b.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1}')
                await expect(dialog).to_contain_text('مقدمة عربية تجريبية.')
                await expect(dialog).to_have_attribute('lang','en'); await expect(dialog).to_have_attribute('dir','ltr')
                await expect(dialog.get_by_role('button',name='Return to activity',exact=True)).to_be_visible()
                for _ in range(5):
                    await page.keyboard.press('Tab'); assert await dialog.evaluate('(el)=>el.contains(document.activeElement)')
                await page.keyboard.press('Escape'); await expect(dialog).not_to_be_visible(); await expect(trigger).to_be_focused()
                assert await page.evaluate('window.savedInput===document.querySelector("#unsent") && savedInput.value==="synthetic unsent response" && rereadShell.metrics.mounts===1')
                checks.append(f'{width}px: real styled nav/dialog fit, focus trap/Escape/restore and unsent input retained')
            # Reactive control labels change, authored Arabic and live activity do not.
            await trigger.click()
            await page.evaluate("""window.savedDialog=document.querySelector('[role="dialog"]'); rereadShell.setLanguage("ar")""")
            dialog=page.get_by_role('dialog')
            await expect(dialog).to_have_attribute('lang','ar'); await expect(dialog).to_have_attribute('dir','rtl')
            await expect(dialog.get_by_role('button',name='العودة إلى النشاط',exact=True)).to_be_visible()
            await page.evaluate('rereadShell.setLanguage("en")')
            await expect(dialog).to_have_attribute('lang','en'); await expect(dialog).to_have_attribute('dir','ltr')
            await expect(dialog.get_by_text('Chapter introduction',exact=True)).to_be_visible()
            narrative=dialog.get_by_text('مقدمة عربية تجريبية.',exact=True)
            await expect(narrative).to_be_visible()
            assert await narrative.evaluate('(el)=>!!el.closest(\'[lang="ar"][dir="rtl"]\') && getComputedStyle(el).direction==="rtl"')
            assert await page.evaluate("""savedDialog===document.querySelector('[role="dialog"]') && savedInput===document.querySelector("#unsent") && savedInput.value==="synthetic unsent response" && rereadShell.metrics.mounts===1 && rereadShell.metrics.unmounts===0""")
            await dialog.get_by_role('button',name='Return to activity',exact=True).click(); await expect(trigger).to_be_focused()
            checks.append('open reread switches ar/en controls without replacing dialog/activity or translating Arabic narrative')
            REPORT['stage']='related_note_setup'
            # Independent related-note group; earlier acceptance groups retained.

            stored_before = await page.evaluate('JSON.stringify({...localStorage})')
            related = page.locator('#related-fixture')
            label_text = await page.evaluate('rereadShell.relatedLabel')
            note_text = await page.evaluate('rereadShell.relatedNote')
            assert len(label_text) > 200 and len(note_text) > 800 and note_text.count('\n') == 2
            assert await related.locator('a,button,input,textarea').count() == 0
            for width in [360,390,768]:
                await page.set_viewport_size({'width':width,'height':900})
                label = related.get_by_text(label_text, exact=True)
                note = related.get_by_text(note_text, exact=True)
                for element_name,element, expected in [('label',label,label_text),('note',note,note_text)]:
                    REPORT.update(stage='related_note_geometry',viewport=width,element=element_name)
                    await expect(element).to_be_visible()
                    assert await element.text_content() == expected
                    raw=await element.evaluate("""(el)=>{
                        const style=getComputedStyle(el), box=el.getBoundingClientRect();
                        const range=document.createRange();range.selectNodeContents(el);
                        const lines=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0);
                        return {tests:{content:el.childNodes.length>0,multiline:lines.length>1,positive_box:box.width>0&&box.height>0,
                          viewport:box.left>=-1&&box.right<=innerWidth+1,horizontal_scroll:el.scrollWidth<=el.clientWidth+1,
                          vertical_scroll:el.scrollHeight<=el.clientHeight+1,unclamped:style.webkitLineClamp==='none',not_ellipsis:style.textOverflow!=='ellipsis',
                          ranges_contained:lines.every(r=>r.width>0&&r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1)},
                          numbers:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height,
                          client_width:el.clientWidth,scroll_width:el.scrollWidth,client_height:el.clientHeight,scroll_height:el.scrollHeight,
                          line_count:lines.length,min_left:Math.min(...lines.map(r=>r.left)),max_right:Math.max(...lines.map(r=>r.right)),
                          min_top:Math.min(...lines.map(r=>r.top)),max_bottom:Math.max(...lines.map(r=>r.bottom)),viewport_width:innerWidth}};
                    }""")
                    REPORT['geometry']=geometry_evidence(raw)
                    REPORT['characters']=character_evidence(await element.evaluate(CHARACTER_PROBE))
                    assert visible_geometry_passes(REPORT['geometry'],REPORT['characters'],element_name)
                REPORT['stage']='related_note_whitespace'
                assert await note.evaluate('(el)=>getComputedStyle(el).whiteSpace') == 'pre-wrap'
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            assert await page.evaluate('JSON.stringify({...localStorage})') == stored_before
            assert await page.evaluate('window.savedInput===document.querySelector("#unsent") && savedInput.value==="synthetic unsent response" && rereadShell.metrics.mounts===1')
            checks.append('related entities: full long label and multiline authored note fit at 360/390/768px without truncation or state mutation')
            REPORT['stage']='owner_chapter_retirement'
            await trigger.click(); await expect(page.get_by_role('dialog')).to_be_visible(); await page.evaluate('rereadShell.changeChapter()'); await expect(page.get_by_role('dialog')).not_to_be_visible()
            await trigger.click(); await expect(page.get_by_role('dialog')).to_be_visible(); await page.evaluate('rereadShell.changeOwner()'); await expect(page.get_by_role('dialog')).not_to_be_visible()
            checks.append('keyed chapter replacement and real owner change retire open reading overlay')
            assert await page.evaluate('localStorage.getItem("irth.device.uiLanguage.v1")')=='en'
        finally: await close_preserving_primary(context)
        REPORT['stage']='restart'
        context=await launch()
        try:
            page=await context.new_page(); await page.goto(origin); await page.wait_for_function('window.rereadShell !== undefined')
            await expect(page.locator('select')).to_have_value('en'); await expect(page.locator('nav')).to_have_attribute('dir','ltr')
            assert await page.evaluate('localStorage.getItem("irth.device.uiLanguage.v1")')=='en'
            checks.append('clean browser restart retains local English preference with real store readback')
        finally: await close_preserving_primary(context)
    REPORT.update(stage='final_guards',blocked_requests=len(blocked),page_errors=len(errors))
    assert not blocked and not errors and len(checks)==8
    return {'result':'PASS','chromium':version,'checks':checks,'blocked_requests':len(blocked),'page_errors':len(errors),'limits':'Selected real widgets/shell/CSS/fonts with router/HUD/poller/diagnostic/overlay-bridge stubs. Decorative texture omitted. No full app, native Back, native device, backend, historical translation, user text-selection policy or arbitrary crash proof.'}
def main():
    code=0
    try:
        with tempfile.TemporaryDirectory(prefix='irth-reread-shell-') as temp:
            directory=Path(temp); assets=directory/'assets'; assets.mkdir()
            subprocess.run(['node','tests/offline/browser/build-reread-shell.mjs',str(assets)],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
            server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(assets))); server.daemon_threads=True
            thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
            try:REPORT.update(asyncio.run(acceptance(directory,f'http://127.0.0.1:{server.server_port}')))
            finally:
                active=sys.exc_info()[0] is not None
                try:server.shutdown();server.server_close();thread.join(timeout=5)
                except Exception:
                    REPORT['server_cleanup_failed']=True
                    if not active:raise
    except Exception as error:
        REPORT['result']='FAIL';REPORT['category']=type(error).__name__ if type(error).__name__ in ('AssertionError','TimeoutError','CalledProcessError','ValueError') else 'runtime_error';code=1
    print(json.dumps(REPORT,indent=2));return code
if __name__=='__main__':raise SystemExit(main())
