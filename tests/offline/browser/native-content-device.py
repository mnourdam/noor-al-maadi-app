"""Actual debug WebView/bridge/lifecycle checks; synthetic transport, no network claim."""
import json,subprocess,time,urllib.request,os
from urllib.parse import urlparse,urlunparse
import websocket
PACKAGE='app.lovable.irth'
def is_packaged_page(url):
    try:
        parsed=urlparse(url)
        return parsed.scheme=='https' and parsed.hostname=='localhost' and parsed.port in (None,443) and parsed.username is None and parsed.password is None
    except ValueError:return False
def adb(*args):return subprocess.check_output(['adb',*args],text=True).strip()
class Page:
    def __init__(self):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try:pid=adb('shell','pidof',PACKAGE).split()[0]
            except (subprocess.CalledProcessError,IndexError):time.sleep(.2);continue
            socket='webview_devtools_remote_'+pid
            if socket in adb('shell','cat','/proc/net/unix'):break
            time.sleep(.2)
        else:raise AssertionError('WebView debug socket unavailable')
        self.port=int(adb('forward','tcp:0','localabstract:'+socket));self.sequence=0
        for _ in range(100):
            with urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json',timeout=5) as r:targets=json.load(r)
            targets=[t for t in targets if t.get('type')=='page' and is_packaged_page(t.get('url',''))]
            if targets:break
            time.sleep(.1)
        else:raise AssertionError('packaged local page unavailable')
        parsed=urlparse(targets[0]['webSocketDebuggerUrl'])
        if parsed.scheme!='ws' or parsed.hostname not in ('localhost','127.0.0.1'):raise AssertionError('unexpected debug destination')
        endpoint=urlunparse(parsed._replace(netloc=f'127.0.0.1:{self.port}'))
        self.ws=websocket.create_connection(endpoint,timeout=30,suppress_origin=True)
    def evaluate(self,expression):
        self.sequence+=1;sequence=self.sequence
        self.ws.send(json.dumps({'id':sequence,'method':'Runtime.evaluate','params':{'expression':expression,'awaitPromise':True,'returnByValue':True}}))
        while True:
            response=json.loads(self.ws.recv())
            if response.get('id')!=sequence:continue
            if 'error' in response or 'exceptionDetails' in response.get('result',{}):raise AssertionError('WebView evaluation failed')
            return response['result']['result'].get('value')
    def wait(self,expression):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if self.evaluate(expression):return
            time.sleep(.1)
        raise AssertionError('WebView condition deadline')
    def close(self):
        try:self.ws.close()
        finally:adb('forward','--remove',f'tcp:{self.port}')
def start():adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
def main():
    checks=[];start();page=Page()
    try:
        page.wait('window.ready===true')
        assert page.evaluate("Capacitor.getPlatform()==='android' && Capacitor.isNativePlatform()") is True
        assert page.evaluate('nativeApp.getState().then(x=>x.isActive)') is True;checks.append('actual Android Capacitor platform and App plugin active')
        assert page.evaluate('runtime.local().title')=='baseline'
        page.evaluate("nativeAcceptance.mode='hang';void(runtime.apply(1200).then(x=>window.firstResult=x))")
        page.wait('window.firstResult===false')
        assert page.evaluate('nativeAcceptance.entered>0 && nativeAcceptance.aborted>0 && !runtime.state().applying') is True
        assert page.evaluate('runtime.durable()')['version']==1;checks.append('synthetic SDK cancellation releases actual WebView controller and preserves native IDB baseline')
        page.evaluate("nativeAcceptance.mode='ok'")
        assert page.evaluate('runtime.apply(20000)') is True
        durable=page.evaluate('runtime.durable()');assert durable['title']=='updated' and durable['count']==1500 and durable['checksum'];checks.append('actual WebView persists complete synthetic content after retry')
        adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(1);start()
        page.wait('nativeLifecycle.includes(false) && nativeLifecycle.at(-1)===true')
        assert page.evaluate('nativeApp.getState().then(x=>x.isActive)') is True
        assert page.evaluate('runtime.durable()')==durable;checks.append('real native Home and resume App lifecycle events preserve content')
        assert page.evaluate('nativeAcceptance.unexpected.length')==0
    finally:page.close()
    old_pid=adb('shell','pidof',PACKAGE)
    assert old_pid
    adb('shell','am','force-stop',PACKAGE)
    stopped=subprocess.run(['adb','shell','pidof',PACKAGE],capture_output=True,text=True)
    assert stopped.returncode==1 and not stopped.stdout.strip(), 'package process survived force-stop'
    checks.append('force-stop directly observed absence of package PID before relaunch')
    start();page=Page()
    try:
        page.wait('window.ready===true')
        assert page.evaluate('runtime.durable()')==durable and page.evaluate('runtime.local().title')=='updated'
        assert page.evaluate('nativeAcceptance.unexpected.length')==0
        checks.append('Android am force-stop and fresh activity process reload preserve committed IndexedDB content')
        print(json.dumps({'result':'PASS_NATIVE_SELECTED_MODULES','checks':checks,'emulator_acceleration':os.environ.get('NATIVE_ACCEL','unspecified'),'android_api':adb('shell','getprop','ro.build.version.sdk'),'webview_user_agent':page.evaluate('navigator.userAgent'),'transport':'SYNTHETIC_FETCH_ONLY_INTERNET_PERMISSION_REMOVED','full_app_ui':'NOT_TESTED','hardware_back':'NOT_TESTED'}))
    finally:page.close()
if __name__=='__main__':main()
