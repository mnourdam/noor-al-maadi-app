"""Actual debug WebView/bridge/lifecycle checks; synthetic transport, no network claim."""
import json,subprocess,time,urllib.request,urllib.error,os,re,sys
from urllib.parse import urlparse,urlunparse
import websocket
PACKAGE='app.lovable.irth'
# Internal identifiers never enter diagnostic output.
DIAGNOSTIC_CONTEXT={'stage':'launch','pid':None}
def diagnostic_probe(args):
    try:
        result=subprocess.run(['adb',*args],capture_output=True,text=True,timeout=5)
        if result.returncode!=0:return None
        return result.stdout[-262144:]
    except (OSError,subprocess.TimeoutExpired):return None

def diagnostic_summary(context,probe=diagnostic_probe):
    pid=context.get('pid')
    if not isinstance(pid,str) or not pid.isdecimal():pid=None
    current=probe(['shell','pidof',PACKAGE])
    # pidof exit 1 is also unknown here: do not confuse probe failure with absence.
    sockets=probe(['shell','cat','/proc/net/unix'])
    app=probe(['logcat','-d','-t','400','--pid='+pid,'-b','main','-b','crash','-v','brief']) if pid else None
    system=probe(['logcat','-d','-t','400','-b','system','-b','crash','-v','brief'])
    stage=context.get('stage')
    if stage not in ('launch','discovery','protocol_probe','javascript_probe','initial_ready','content','home_resume','force_stop','relaunch_ready','durable_restart'):stage='unknown'
    return {'result':'NATIVE_FAILURE_DIAGNOSTIC','stage':stage,
        'original_pid_observed':pid is not None,
        **{key:context.get(key) if isinstance(context.get(key),bool) else None for key in ('cdp_matching_response','cdp_detached','cdp_target_crashed','original_target_present')},
        'system_exact_app_anr_indicator':any(re.search(r'ANR in '+re.escape(PACKAGE)+r' \((?:pid )?'+pid+r'\)',line) for line in system.splitlines()) if system is not None and pid else None,
        'package_process_present':bool(current.split()) if current is not None else None,
        'original_process_still_current':pid in current.split() if pid and current is not None else None,
        'original_debug_socket_present':any(line.split() and line.split()[-1] in ('@webview_devtools_remote_'+pid,'webview_devtools_remote_'+pid) for line in sockets.splitlines()) if pid and sockets is not None else None,
        'app_log_available':app is not None,
        'app_fatal_indicator':bool(re.search(r'FATAL EXCEPTION|Fatal signal|Abort message:',app)) if app is not None else None,
        'app_renderer_indicator':bool(re.search(r'renderer.*(?:crash|killed|gone)|RenderProcessGone',app,re.I)) if app is not None else None,
        'system_log_available':system is not None,
        'system_exact_app_crash_indicator':any(pid and re.search(r'(?:Process: '+re.escape(PACKAGE)+r', PID: '+pid+r'\b|Process '+re.escape(PACKAGE)+r' \(pid '+pid+r'\)|pid: '+pid+r',[^\n]*>>> '+re.escape(PACKAGE)+r' <<<)',line) and re.search(r'crash|fatal|died',line,re.I) for line in system.splitlines()) if system is not None and pid else None,
        'system_low_memory_indicator_unattributed':bool(re.search(r'low.?memory|lmkd|lowmemorykiller',system,re.I)) if system is not None else None}

def run_with_diagnostics(operation,context=DIAGNOSTIC_CONTEXT,probe=diagnostic_probe,emit=None):
    try:return operation()
    except Exception:
        try:
            report=diagnostic_summary(context,probe)
            (emit or (lambda value:print(value,file=sys.stderr)))(json.dumps(report,sort_keys=True))
        except Exception:
            # Diagnostic failure must never replace or swallow the original exception.
            pass
        raise

def is_packaged_page(url):
    try:
        parsed=urlparse(url)
        return parsed.scheme=='https' and parsed.hostname=='localhost' and parsed.port in (None,443) and parsed.username is None and parsed.password is None
    except ValueError:return False
def wait_packaged_target(port,timeout_seconds=180,opener=urllib.request.urlopen,clock=time.monotonic,sleep=time.sleep):
    deadline=clock()+timeout_seconds
    while True:
        remaining=deadline-clock()
        if remaining<=0:raise AssertionError('packaged local page readiness deadline')
        try:
            with opener(f'http://127.0.0.1:{port}/json',timeout=min(5,remaining)) as response:
                targets=json.load(response)
        except (TimeoutError,ConnectionRefusedError):
            targets=[]
        except urllib.error.URLError as error:
            if not isinstance(error.reason,(TimeoutError,ConnectionRefusedError)):raise
            targets=[]
        if not isinstance(targets,list) or any(not isinstance(target,dict) for target in targets):
            raise AssertionError('invalid debug target schema')
        for target in targets:
            if not isinstance(target.get('type'),str):raise AssertionError('invalid debug target type')
            if target['type']!='page':continue
            if not isinstance(target.get('url'),str) or not is_packaged_page(target['url']):
                raise AssertionError('unexpected packaged page origin')
            if not isinstance(target.get('webSocketDebuggerUrl'),str):raise AssertionError('missing debug socket URL')
            if clock()>=deadline:raise AssertionError('packaged local page readiness deadline')
            return target
        remaining=deadline-clock()
        if remaining<=0:raise AssertionError('packaged local page readiness deadline')
        sleep(min(.2,remaining))
def target_present(port,target_id,opener=urllib.request.urlopen):
    if not isinstance(target_id,str) or not target_id:return None
    try:
        with opener(f'http://127.0.0.1:{port}/json',timeout=5) as response:targets=json.load(response)
        if not isinstance(targets,list) or any(not isinstance(t,dict) or not isinstance(t.get('id'),str) for t in targets):return None
        return any(t['id']==target_id and t.get('type')=='page' and isinstance(t.get('url'),str) and is_packaged_page(t['url']) for t in targets)
    except (OSError,ValueError):return None

def adb(*args):return subprocess.check_output(['adb',*args],text=True).strip()
class Page:
    def __init__(self):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            try:pid=adb('shell','pidof',PACKAGE).split()[0]
            except (subprocess.CalledProcessError,IndexError):time.sleep(.2);continue
            DIAGNOSTIC_CONTEXT.update(stage='discovery',pid=pid)
            socket='webview_devtools_remote_'+pid
            if socket in adb('shell','cat','/proc/net/unix'):break
            time.sleep(.2)
        else:raise AssertionError('WebView debug socket unavailable')
        self.port=int(adb('forward','tcp:0','localabstract:'+socket));self.sequence=0
        target=wait_packaged_target(self.port)
        self.target_id=target.get('id')
        DIAGNOSTIC_CONTEXT.update(cdp_matching_response=False,cdp_detached=False,cdp_target_crashed=False,original_target_present=None)
        parsed=urlparse(target['webSocketDebuggerUrl'])
        if parsed.scheme!='ws' or parsed.hostname not in ('localhost','127.0.0.1'):raise AssertionError('unexpected debug destination')
        endpoint=urlunparse(parsed._replace(netloc=f'127.0.0.1:{self.port}'))
        self.ws=websocket.create_connection(endpoint,timeout=30,suppress_origin=True)
    def command(self,method,params):
        self.sequence+=1;sequence=self.sequence
        DIAGNOSTIC_CONTEXT['cdp_matching_response']=False
        self.ws.send(json.dumps({'id':sequence,'method':method,'params':params}))
        while True:
            response=json.loads(self.ws.recv())
            if not isinstance(response,dict):raise AssertionError('invalid CDP response')
            event=response.get('method')
            if event=='Inspector.detached':DIAGNOSTIC_CONTEXT['cdp_detached']=True
            if event in ('Inspector.targetCrashed','Target.targetCrashed'):DIAGNOSTIC_CONTEXT['cdp_target_crashed']=True
            if response.get('id')!=sequence:continue
            DIAGNOSTIC_CONTEXT['cdp_matching_response']=True
            if 'error' in response or not isinstance(response.get('result'),dict):raise AssertionError('CDP command failed')
            return response['result']
    def controls(self):
        DIAGNOSTIC_CONTEXT['stage']='protocol_probe'
        result=self.command('Schema.getDomains',{})
        if not isinstance(result.get('domains'),list):raise AssertionError('invalid protocol control result')
        DIAGNOSTIC_CONTEXT['stage']='javascript_probe'
        result=self.command('Runtime.evaluate',{'expression':'1+1','awaitPromise':False,'returnByValue':True,'timeout':5000})
        value=result.get('result',{})
        if 'exceptionDetails' in result or value.get('type')!='number' or type(value.get('value')) not in (int,float) or value['value']!=2:raise AssertionError('invalid JavaScript control result')
    def evaluate(self,expression):
        result=self.command('Runtime.evaluate',{'expression':expression,'awaitPromise':True,'returnByValue':True})
        if 'exceptionDetails' in result:raise AssertionError('WebView evaluation failed')
        return result['result'].get('value')
    def wait(self,expression):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if self.evaluate(expression):return
            time.sleep(.1)
        raise AssertionError('WebView condition deadline')
    def close(self):
        failing=sys.exc_info()[0] is not None
        if failing:
            try:DIAGNOSTIC_CONTEXT['original_target_present']=target_present(self.port,self.target_id)
            except Exception:DIAGNOSTIC_CONTEXT['original_target_present']=None
        try:
            try:self.ws.close()
            finally:adb('forward','--remove',f'tcp:{self.port}')
        except Exception:
            if not failing:raise
def start():adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
def main():
    checks=[];start();page=Page()
    try:
        page.controls()
        DIAGNOSTIC_CONTEXT['stage']='initial_ready'
        page.wait('window.ready===true')
        assert page.evaluate("Capacitor.getPlatform()==='android' && Capacitor.isNativePlatform()") is True
        assert page.evaluate('nativeApp.getState().then(x=>x.isActive)') is True;checks.append('actual Android Capacitor platform and App plugin active')
        DIAGNOSTIC_CONTEXT['stage']='content'
        assert page.evaluate('runtime.local().title')=='baseline'
        page.evaluate("nativeAcceptance.mode='hang';void(runtime.apply(1200).then(x=>window.firstResult=x))")
        page.wait('window.firstResult===false')
        assert page.evaluate('nativeAcceptance.entered>0 && nativeAcceptance.aborted>0 && !runtime.state().applying') is True
        assert page.evaluate('runtime.durable()')['version']==1;checks.append('synthetic SDK cancellation releases actual WebView controller and preserves native IDB baseline')
        page.evaluate("nativeAcceptance.mode='ok'")
        assert page.evaluate('runtime.apply(20000)') is True
        durable=page.evaluate('runtime.durable()');assert durable['title']=='updated' and durable['count']==1500 and durable['checksum'];checks.append('actual WebView persists complete synthetic content after retry')
        DIAGNOSTIC_CONTEXT['stage']='home_resume'
        adb('shell','input','keyevent','KEYCODE_HOME');time.sleep(1);start()
        page.wait('nativeLifecycle.includes(false) && nativeLifecycle.at(-1)===true')
        assert page.evaluate('nativeApp.getState().then(x=>x.isActive)') is True
        assert page.evaluate('runtime.durable()')==durable;checks.append('real native Home and resume App lifecycle events preserve content')
        assert page.evaluate('nativeAcceptance.unexpected.length')==0
    finally:page.close()
    DIAGNOSTIC_CONTEXT['stage']='force_stop'
    old_pid=adb('shell','pidof',PACKAGE)
    assert old_pid
    adb('shell','am','force-stop',PACKAGE)
    stopped=subprocess.run(['adb','shell','pidof',PACKAGE],capture_output=True,text=True)
    assert stopped.returncode==1 and not stopped.stdout.strip(), 'package process survived force-stop'
    checks.append('force-stop directly observed absence of package PID before relaunch')
    start();page=Page()
    try:
        page.controls()
        DIAGNOSTIC_CONTEXT['stage']='relaunch_ready'
        page.wait('window.ready===true')
        DIAGNOSTIC_CONTEXT['stage']='durable_restart'
        assert page.evaluate('runtime.durable()')==durable and page.evaluate('runtime.local().title')=='updated'
        assert page.evaluate('nativeAcceptance.unexpected.length')==0
        checks.append('Android am force-stop and fresh activity process reload preserve committed IndexedDB content')
        print(json.dumps({'result':'PASS_NATIVE_SELECTED_MODULES','checks':checks,'emulator_acceleration':os.environ.get('NATIVE_ACCEL','unspecified'),'android_api':adb('shell','getprop','ro.build.version.sdk'),'webview_user_agent':page.evaluate('navigator.userAgent'),'transport':'SYNTHETIC_FETCH_ONLY_INTERNET_PERMISSION_REMOVED','full_app_ui':'NOT_TESTED','hardware_back':'NOT_TESTED'}))
    finally:page.close()
def readiness_self_test():
    import io,unittest
    from unittest.mock import Mock
    valid={'type':'page','url':'https://localhost/','webSocketDebuggerUrl':'ws://localhost/devtools/page/1'}
    class Tests(unittest.TestCase):
        def invoke(self,opener,seconds=2):
            now=[0.0]
            def sleep(value):now[0]+=value
            result=wait_packaged_target(9222,seconds,opener,lambda:now[0],sleep)
            return result,now[0]
        def test_delayed_timeout_then_success(self):
            opener=Mock(side_effect=[TimeoutError(),io.BytesIO(json.dumps([valid]).encode())])
            self.assertEqual(self.invoke(opener)[0],valid);self.assertEqual(opener.call_count,2)
        def test_connection_refusal_then_success(self):
            opener=Mock(side_effect=[urllib.error.URLError(ConnectionRefusedError()),io.BytesIO(json.dumps([valid]).encode())])
            self.assertEqual(self.invoke(opener)[0],valid)
        def test_deadline_caps_each_request(self):
            now=[0.0];timeouts=[]
            def opener(url,timeout):timeouts.append(timeout);now[0]+=timeout;raise TimeoutError()
            with self.assertRaisesRegex(AssertionError,'deadline'):
                wait_packaged_target(9222,7,opener,lambda:now[0],lambda value:now.__setitem__(0,now[0]+value))
            self.assertAlmostEqual(now[0],7);self.assertEqual(timeouts,[5,1.7999999999999998])
        def test_invalid_origin_not_retried(self):
            target={**valid,'url':'https://localhost.evil/'};opener=Mock(return_value=io.BytesIO(json.dumps([target]).encode()))
            with self.assertRaisesRegex(AssertionError,'origin'):self.invoke(opener)
            self.assertEqual(opener.call_count,1)
        def test_malformed_json_not_retried(self):
            opener=Mock(return_value=io.BytesIO(b'not-json'))
            with self.assertRaises(json.JSONDecodeError):self.invoke(opener)
            self.assertEqual(opener.call_count,1)
        def test_schema_error_not_retried(self):
            opener=Mock(return_value=io.BytesIO(b'{}'))
            with self.assertRaisesRegex(AssertionError,'schema'):self.invoke(opener)
            self.assertEqual(opener.call_count,1)
        def test_unexpected_transport_error_not_retried(self):
            opener=Mock(side_effect=urllib.error.URLError('unexpected TLS or proxy error'))
            with self.assertRaises(urllib.error.URLError):self.invoke(opener)
            self.assertEqual(opener.call_count,1)
        def test_diagnostics_redact_identifiers_and_log_content(self):
            context={'stage':'initial_ready','pid':'12345'}
            probe=Mock(side_effect=['12345','@webview_devtools_remote_12345',
                'FATAL EXCEPTION private-token-SECRET',
                'Process app.lovable.irth (pid 12345) has died private-token-SECRET; lmkd'])
            report=diagnostic_summary(context,probe);encoded=json.dumps(report)
            self.assertTrue(report['app_fatal_indicator']);self.assertTrue(report['system_exact_app_crash_indicator'])
            self.assertNotIn('12345',encoded);self.assertNotIn(PACKAGE,encoded);self.assertNotIn('SECRET',encoded)
        def test_diagnostic_probe_failures_are_unknown(self):
            report=diagnostic_summary({'stage':'initial_ready','pid':'12345'},lambda args:None)
            self.assertIsNone(report['app_fatal_indicator']);self.assertIsNone(report['original_process_still_current'])
            self.assertIsNone(report['system_low_memory_indicator_unattributed'])
        def test_unrelated_system_crash_not_attributed(self):
            report=diagnostic_summary({'stage':'initial_ready','pid':'12345'},Mock(side_effect=['12345','','','Process other.app (pid 12345) has died\nProcess app.lovable.irth (pid 912345) has died']))
            self.assertFalse(report['system_exact_app_crash_indicator'])
        def test_original_exception_preserved(self):
            error=RuntimeError('original');emitted=[]
            def fail():raise error
            with self.assertRaises(RuntimeError) as caught:
                run_with_diagnostics(fail,{'stage':'initial_ready','pid':'12345'},lambda args:None,emitted.append)
            self.assertIs(caught.exception,error);self.assertEqual(len(emitted),1)
            with self.assertRaises(RuntimeError) as caught:
                run_with_diagnostics(fail,{},Mock(side_effect=ValueError('probe')),emitted.append)
            self.assertIs(caught.exception,error)
        def test_controls_exact_two_and_protocol_error(self):
            page=Page.__new__(Page)
            page.command=Mock(side_effect=[{'domains':[]},{'result':{'type':'number','value':2}}]);page.controls()
            self.assertEqual(page.command.call_args[0][1]['timeout'],5000)
            for value in (True,'2',3,None):
                page.command=Mock(side_effect=[{'domains':[]},{'result':{'type':'number','value':value}}])
                with self.assertRaises(AssertionError):page.controls()
            page.command=Mock(side_effect=AssertionError('CDP command failed'))
            with self.assertRaises(AssertionError):page.controls()
            self.assertEqual(page.command.call_count,1)
        def test_event_flags_and_error_do_not_leak_payload(self):
            page=Page.__new__(Page);page.sequence=0
            page.ws=Mock();page.ws.recv=Mock(side_effect=[json.dumps({'method':'Unknown.event','params':{'secret':'SECRET'}}),json.dumps({'method':'Inspector.detached','params':{'reason':'SECRET'}}),json.dumps({'method':'Target.targetCrashed','params':{'targetId':'SECRET'}}),json.dumps({'id':1,'error':{'message':'SECRET'}})])
            DIAGNOSTIC_CONTEXT.update(cdp_detached=False,cdp_target_crashed=False)
            with self.assertRaisesRegex(AssertionError,'CDP command failed'):page.command('Schema.getDomains',{})
            report=diagnostic_summary(DIAGNOSTIC_CONTEXT,lambda args:None)
            self.assertTrue(report['cdp_detached']);self.assertTrue(report['cdp_target_crashed']);self.assertTrue(report['cdp_matching_response'])
            self.assertNotIn('SECRET',json.dumps(report))
        def test_target_negative_and_unknown(self):
            def opener(value):return Mock(return_value=io.BytesIO(json.dumps(value).encode()))
            self.assertIs(target_present(9222,'PRIVATE',opener([])),False)
            self.assertIs(target_present(9222,'PRIVATE',opener([{'id':'PRIVATE','type':'page','url':'https://localhost/'}])),True)
            self.assertIsNone(target_present(9222,'PRIVATE',opener({})))
            self.assertIsNone(target_present(9222,'PRIVATE',Mock(side_effect=TimeoutError())))
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Tests))
    if not result.wasSuccessful():raise SystemExit(1)
if __name__=='__main__':
    import sys
    if sys.argv[1:]==['--self-test-readiness']:readiness_self_test()
    elif sys.argv[1:]:raise SystemExit('unknown arguments')
    else:run_with_diagnostics(main)
