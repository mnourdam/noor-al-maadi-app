"""Actual UI/native actions only. Missing synthetic prerequisites stay BLOCKED."""
import json,time
GROUPS=('chapter_images_encyclopedia','museum_profile','content_update_recovery','private_feedback','chapter_reread','english_controls')
class Missing(Exception):pass

def wait(page,expression,seconds=12):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if page.evaluate(expression) is True:return
  time.sleep(.15)
 raise Missing('control_unavailable')
def tap(device,page,selector,text=None):
 # Inspect positions, then inject an Android tap. Never replace router/history.
 query=json.dumps(selector);wanted=json.dumps(text)
 expression="""(()=>{const e=[...document.querySelectorAll(%s)].find(x=>%s===null||x.textContent.trim()===%s);if(!e)return null;const r=e.getBoundingClientRect();if(r.width<1||r.height<1||r.top<0||r.bottom>innerHeight)return null;return [Math.round((r.left+r.width/2)*devicePixelRatio),Math.round((r.top+r.height/2)*devicePixelRatio)]})()"""%(query,wanted,wanted)
 for _ in range(5):
  position=page.evaluate(expression)
  if isinstance(position,list) and len(position)==2:
   device.adb('shell','input','tap',str(position[0]),str(position[1]));return
  size=page.evaluate('[Math.round(innerWidth*devicePixelRatio),Math.round(innerHeight*devicePixelRatio)]')
  device.adb('shell','input','swipe',str(size[0]//2),str(size[1]*3//4),str(size[0]//2),str(size[1]//3),'300')
 raise Missing('control_unavailable')
def route(device,page,path):
 tap(device,page,'a[href='+json.dumps(path)+']')
 wait(page,'location.pathname==='+json.dumps(path))
def personal_snapshot(page):
 # Returned only within ephemeral harness memory; never report values/keys.
 return page.evaluate("JSON.stringify(Object.keys(localStorage).filter(k=>/profile|progress|achievement|reward|wallet/i.test(k)&&!/auth|token/i.test(k)).sort().map(k=>[k,localStorage.getItem(k)]))")
def local_images(page):
 wait(page,"[...document.querySelectorAll('#root img')].some(i=>i.complete&&i.naturalWidth>0&&new URL(i.currentSrc||i.src,location.href).origin===location.origin)")
 # Excludes known remote references; does not declare missing authored art complete.
 return page.evaluate("[...document.querySelectorAll('#root img')].filter(i=>new URL(i.currentSrc||i.src,location.href).origin===location.origin).every(i=>i.complete&&i.naturalWidth>0)") is True

def run(device,page):
 groups={g:{'status':'BLOCKED','reason':'not_executed'} for g in GROUPS}
 def record(group,status,reason):
  groups[group]={'status':status,'reason':reason};device.record_group(group,status,reason)
 def perform(group,work):
  try:
   status,reason=work();record(group,status,reason)
  except Missing as error:record(group,'BLOCKED',str(error))
  except AssertionError:record(group,'FAIL','assertion_failed')
  # Unexpected CDP/session/native failures escape; never continue compromised target.
 def images():
  route(device,page,'/encyclopedia');assert local_images(page)
  route(device,page,'/campaigns')
  tap(device,page,'a[href^="/campaigns/imported/"]')
  wait(page,"location.pathname.startsWith('/campaigns/imported/')")
  tap(device,page,'a[href*="/chapter/"]')
  wait(page,"location.pathname.includes('/chapter/')")
  assert local_images(page)
  # Packaged chapter+encyclopedia exercised; story and editorial completeness unproved.
  return 'BLOCKED','content_incomplete'
 perform('chapter_images_encyclopedia',images)
 def reread():
  if not page.evaluate("location.pathname.includes('/chapter/')"):raise Missing('missing_text_activity_fixture')
  available=page.evaluate("[...document.querySelectorAll('input,textarea')].some(e=>e.type!=='hidden'&&e.getClientRects().length)")
  if not available:raise Missing('missing_text_activity_fixture')
  tap(device,page,'input:not([type=hidden]),textarea');device.adb('shell','input','text','unsent_fixture')
  wait(page,"[...document.querySelectorAll('input,textarea')].some(e=>e.value==='unsent_fixture')")
  before=personal_snapshot(page)
  tap(device,page,'button','إعادة قراءة نص الفصل');wait(page,"!!document.querySelector('[role=dialog]')")
  assert page.evaluate("!!document.querySelector('[role=dialog] [lang=ar][dir=rtl]')")
  tap(device,page,'button','العودة إلى النشاط')
  wait(page,"[...document.querySelectorAll('input,textarea')].some(e=>e.value==='unsent_fixture')")
  assert personal_snapshot(page)==before
  device.back()
  return 'BLOCKED','missing_completed_chapter_fixture'
 perform('chapter_reread',reread)
 def museum():
  route(device,page,'/collection');route(device,page,'/profile')
  return 'BLOCKED','missing_owned_artifact_fixture'
 perform('museum_profile',museum)
 record('content_update_recovery','BLOCKED','missing_update_fixture')
 record('private_feedback','BLOCKED','missing_authenticated_service_fixture')
 def english():
  # Real select/Android keyboard interaction, no programmatic preference setter.
  if not page.evaluate("location.pathname==='/profile'"):route(device,page,'/profile')
  before=personal_snapshot(page)
  tap(device,page,'select:has(option[value="en"]):has(option[value="ar"])')
  device.adb('shell','input','keyevent','KEYCODE_DPAD_DOWN');device.adb('shell','input','keyevent','KEYCODE_ENTER')
  wait(page,"localStorage.getItem('irth.device.uiLanguage.v1')==='en' && !!document.querySelector('[lang=en][dir=ltr]')")
  assert personal_snapshot(page)==before
  route(device,page,'/campaigns')
  assert page.evaluate("!!document.querySelector('[lang=en]')")
  device.home();device.launch()
  wait(page,"localStorage.getItem('irth.device.uiLanguage.v1')==='en'")
  route(device,page,'/')
  device.force_stop();device.launch();page.reopen_after_intentional_restart()
  assert page.evaluate("localStorage.getItem('irth.device.uiLanguage.v1')==='en' && !!document.querySelector('[lang=en]')")
  assert personal_snapshot(page)==before
  assert page.evaluate("window.__IRTH_NATIVE_REGISTERED_PLUGIN_PROBE__().then(x=>x.appActive&&x.denied&&x.exactExpectedDelta)") is True
  return 'PASS','passed'
 perform('english_controls',english)
 return groups
