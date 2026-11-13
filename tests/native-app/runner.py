"""CI-only Intel macOS native driver. No app replacement or permission mutation."""
import xml.etree.ElementTree as ET
import threading
import argparse, hashlib, importlib.util, json, os, platform, re, shutil, subprocess, time, urllib.request, urllib.error, zipfile
from pathlib import Path
from urllib.parse import urlparse, urlunparse
PACKAGE='app.lovable.irth.acceptance'
ACTIVITY='app.lovable.irth.MainActivity'
IMAGE='system-images;android-35;default;x86_64'
JOURNEYS={'chapter_images_encyclopedia','museum_profile','content_update_recovery','private_feedback','chapter_reread','english_controls'}
REASONS={'passed','fixture_missing','not_executed','assertion_failed','transport_blocked','activation_gate','content_incomplete','missing_completed_chapter_fixture','missing_text_activity_fixture','missing_authenticated_service_fixture','missing_update_fixture','missing_owned_artifact_fixture','control_unavailable','image_decode_failed'}
def record_group(groups,name,status,reason):
    if name not in JOURNEYS or status not in ('PASS','BLOCKED','FAIL') or reason not in REASONS or (status=='PASS')!=(reason=='passed'):
        raise Failure('check_schema')
    if groups[name]!= {'status':'BLOCKED','reason':'not_executed'}:raise Failure('check_schema')
    groups[name]={'status':status,'reason':reason}
def complete_groups(groups):
    if not isinstance(groups,dict) or set(groups)!=JOURNEYS:raise Failure('check_schema')
    for row in groups.values():
        if not isinstance(row,dict) or set(row)!={'status','reason'} or row['status'] not in ('PASS','BLOCKED','FAIL') or row['reason'] not in REASONS or (row['status']=='PASS')!=(row['reason']=='passed'):raise Failure('check_schema')
    return all(row['status']=='PASS' for row in groups.values())

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise Failure('debug_redirect')
LOCAL_OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
class Failure(Exception): pass
def require_ci():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_REF')!='refs/heads/v18-01a-outbox-recovery' or os.environ.get('GITHUB_EVENT_NAME') not in ('push','workflow_dispatch'):
        raise Failure('ci_context')

HOME_READY = """(()=>{const visible=e=>!!e&&e.getClientRects().length>0;return location.pathname==='/' && visible(document.querySelector("#root a[href='/profile'][aria-label='بطاقة هويتك — الذهاب إلى حسابي']")) && visible(document.querySelector("#root [data-testid='home-stat-investigations'][href='/investigations']")) && !document.querySelector('#irth-boot-splash,.splash-root') && ![...document.querySelectorAll('[role=dialog]')].some(visible)})()"""
FAILURE_CODES=set('unplanned_reconnect ci_context source_identity tool_revision debug_redirect firebase_config capacitor_config cleanup_path api_property apk_hash package internet_permission signer duplicate_zip assets_set asset_hash intel_macos_required existing_license_required image_missing hvf_unverified fresh_avd_required existing_devices emulator_exited boot_deadline installed_path installed_hash force_stop_not_observed target_response_limit target_schema foreign_page socket_readiness ambiguous_page target_readiness debug_origin target_detached target_crashed evaluation_error evaluation_deadline javascript_control native_platform native_bridge full_app_readiness check_schema command_failed'.split())
def category(error):
    if isinstance(error,Failure):return str(error) if str(error) in FAILURE_CODES else 'assertion_failure'
    return type(error).__name__ if isinstance(error,(TimeoutError,subprocess.TimeoutExpired,ValueError)) else 'runtime_error'


def command(args, timeout=30, input=None):
    p=subprocess.run([str(x) for x in args],input=input,capture_output=True,timeout=timeout)
    if p.returncode: raise Failure('command_failed')
    return p.stdout.decode('utf8','replace').strip()

def packaged(url):
    try:
        p=urlparse(url)
        return p.scheme=='https' and p.hostname=='localhost' and p.port in (None,443) and not p.username and not p.password
    except ValueError:return False

def verify_apk(apk,receipt,sdk):
    r=json.loads(Path(receipt).read_text()); raw=Path(apk).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=r['apk_sha256']:raise Failure('apk_hash')
    if not re.fullmatch(r'[a-f0-9]{40}',r.get('source_sha','')) or command(['git','rev-parse','HEAD'])!=r['source_sha']:raise Failure('source_identity')
    bt=sdk/'build-tools/35.0.0'
    badging=command([bt/'aapt','dump','badging',apk])
    if not re.search(r"^package: name='"+re.escape(PACKAGE)+r"'",badging,re.M):raise Failure('package')
    resources=command([bt/'aapt','dump','resources',apk])
    if any(key in resources for key in ('google_app_id','google_api_key','default_web_client_id','firebase_database_url')):raise Failure('firebase_config')
    permissions=command([bt/'aapt','dump','permissions',apk])
    if 'android.permission.INTERNET' in permissions:raise Failure('internet_permission')
    cert=command([bt/'apksigner','verify','--print-certs',apk])
    hashes=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)',cert)
    if len(hashes)!=1 or hashes[0].lower()!=r['signer_sha256'].lower():raise Failure('signer')
    with zipfile.ZipFile(apk) as z:
        names=z.namelist()
        if len(names)!=len(set(names)):raise Failure('duplicate_zip')
        selected={n for n in names if not n.endswith('/') and (n.startswith('assets/public/') or n=='assets/capacitor.config.json')}
        if 'assets/public/index.html' not in selected or 'assets/capacitor.config.json' not in selected or selected!=set(r['assets_sha256']):raise Failure('assets_set')
        config=json.loads(z.read('assets/capacitor.config.json'))
        server=config.get('server',{})
        if config.get('appId')!=PACKAGE or server.get('url') or server.get('allowNavigation') or server.get('androidScheme','https')!='https' or server.get('hostname','localhost')!='localhost' or config.get('android',{}).get('allowMixedContent',False):raise Failure('capacitor_config')
        for n in selected:
            if hashlib.sha256(z.read(n)).hexdigest()!=r['assets_sha256'][n]:raise Failure('asset_hash')
    return {'apk_sha256':r['apk_sha256'],'source_sha':r['source_sha'],'signer_sha256':r['signer_sha256'].lower()}

EMULATOR_INDICATORS={
    'hypervisor_error':('hv_error','hypervisor initialization failed','failed to initialize hvf'),
    'graphics_error':('failed to initialize vulkan','failed to initialize opengl','egl_not_initialized','failed to create vulkan'),
    'disk_error':('no space left on device','could not open backing file'),
    'memory_error':('cannot allocate memory','out of memory'),
    'avd_lock_error':('another emulator instance','failed to lock'),
    'fatal_marker':('fatal:', 'panic:'),
}
class EmulatorOutput:
    # Drain pipes without storing raw logs. A short overlap detects split tokens.
    def __init__(self):
        self.lock=threading.Lock();self.bytes_seen=0;self.flags={key:False for key in EMULATOR_INDICATORS};self.threads=[];self.read_error=False
    def consume(self,stream):
        overlap=b''
        try:
            while True:
                chunk=stream.read(4096)
                if not chunk:break
                text=(overlap+chunk).decode('utf8','replace').lower()
                with self.lock:
                    self.bytes_seen=min(1000000000,self.bytes_seen+len(chunk))
                    for key,tokens in EMULATOR_INDICATORS.items():self.flags[key]|=any(token in text for token in tokens)
                overlap=chunk[-128:]
        except Exception:
            with self.lock:self.read_error=True
        finally:
            try:stream.close()
            except Exception:
                with self.lock:self.read_error=True
    def start(self,*streams):
        for stream in streams:
            thread=threading.Thread(target=self.consume,args=(stream,),daemon=True);self.threads.append(thread);thread.start()
    def snapshot(self):
        with self.lock:return {'bytes_seen_capped':self.bytes_seen,'indicators':dict(self.flags),'read_error':self.read_error,'readers_complete':all(not thread.is_alive() for thread in self.threads)}
    def join(self):
        for thread in self.threads:thread.join(timeout=2)

def fixed_value(value,allowed):
    value=value.strip()
    return value if value in allowed else ('empty' if not value else 'other')

class Device:
    def __init__(self,sdk,root):
        self.sdk=sdk; self.root=root; self.emulator=None;self.created=False;self.serial='emulator-5580';self.actions=[];self.output=EmulatorOutput();self.boot_observations={'sys_boot_completed':'not_observed','poll_command_failure':False,'poll_timeout':False}
    def adb(self,*args,timeout=15):return command([self.sdk/'platform-tools/adb','-s',self.serial,*args],timeout)
    def provision(self):
        if platform.system()!='Darwin' or platform.machine() not in ('x86_64','AMD64'):raise Failure('intel_macos_required')
        if not (self.sdk/'licenses/android-sdk-license').is_file():raise Failure('existing_license_required')
        manager=self.sdk/'cmdline-tools/latest/bin/sdkmanager'
        command([manager,'platforms;android-36','build-tools;35.0.0','platform-tools','emulator',IMAGE],600,input=b'')
        if not (self.sdk/'system-images/android-35/default/x86_64/package.xml').is_file():raise Failure('image_missing')
        acceleration=command([self.sdk/'emulator/emulator','-accel-check'],30)
        if not re.search(r'Hypervisor.Framework|HVF',acceleration,re.I):raise Failure('hvf_unverified')
        versions={}
        for name,path in [('emulator','emulator'),('image','system-images/android-35/default/x86_64'),('platform_tools','platform-tools'),('build_tools','build-tools/35.0.0')]:
            tree=ET.parse(self.sdk/path/'package.xml');rev=tree.find('.//revision')
            if rev is None:raise Failure('tool_revision')
            values=[rev.findtext(k,'0') for k in ('major','minor','micro')]
            if any(not re.fullmatch(r'[0-9]{1,9}',v) for v in values):raise Failure('tool_revision')
            versions[name]='.'.join(values)
        self.versions=versions
    def boot(self):
        if self.root.exists():raise Failure('fresh_avd_required')
        listing=command([self.sdk/'platform-tools/adb','devices'])
        if any(line.strip() and not line.startswith('List of devices') for line in listing.splitlines()):raise Failure('existing_devices')
        self.root.mkdir(mode=0o700);self.created=True
        os.environ['ANDROID_AVD_HOME']=str(self.root)
        command([self.sdk/'cmdline-tools/latest/bin/avdmanager','create','avd','-n','irth-full-acceptance','-k',IMAGE],60,input=b'no\n')
        self.emulator=subprocess.Popen([str(self.sdk/'emulator/emulator'),'-avd','irth-full-acceptance','-port','5580','-accel','on','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader_indirect'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        self.output.start(self.emulator.stdout,self.emulator.stderr)
        end=time.monotonic()+300
        while time.monotonic()<end:
            if self.emulator.poll() is not None:raise Failure('emulator_exited')
            try:
                value=self.adb('shell','getprop','sys.boot_completed',timeout=5)
                self.boot_observations['sys_boot_completed']=fixed_value(value,{'0','1'})
                if value=='1':return
            except Failure:self.boot_observations['poll_command_failure']=True
            except subprocess.TimeoutExpired:self.boot_observations['poll_timeout']=True
            time.sleep(1)
        raise Failure('boot_deadline')
    def boot_diagnostics(self):
        result=dict(self.boot_observations)
        code=self.emulator.poll() if self.emulator else None
        result.update(emulator_started=self.emulator is not None,emulator_alive=self.emulator is not None and code is None,emulator_returncode=code if type(code) is int and -255<=code<=255 else None)
        # Post-attempt diagnostics only; never extends or retries boot admission.
        for name,args,allowed in [('adb_state',('get-state',),{'device','offline','unknown'}),('dev_bootcomplete',('shell','getprop','dev.bootcomplete'),{'0','1'}),('boot_animation',('shell','getprop','init.svc.bootanim'),{'running','stopped','restarting'})]:
            try:result[name]=fixed_value(self.adb(*args,timeout=2),allowed)
            except subprocess.TimeoutExpired:result[name]='timeout'
            except Exception:result[name]='command_failed'
        result['emulator_output']=self.output.snapshot()
        return result
    def verify_installed(self,expected):
        location=self.adb('shell','pm','path',PACKAGE)
        if not re.fullmatch(r'package:/data/app/[^\s]+/base\.apk',location):raise Failure('installed_path')
        raw=subprocess.run([str(self.sdk/'platform-tools/adb'),'-s',self.serial,'exec-out','cat',location[8:]],capture_output=True,timeout=30,check=True).stdout
        if hashlib.sha256(raw).hexdigest()!=expected:raise Failure('installed_hash')
    def launch(self):self.adb('shell','am','start','-W','-n',PACKAGE+'/'+ACTIVITY);self.actions.append('launch')
    def back(self):self.adb('shell','input','keyevent','KEYCODE_BACK');self.actions.append('back')
    def home(self):self.adb('shell','input','keyevent','KEYCODE_HOME');self.actions.append('home')
    def force_stop(self):
        self.adb('shell','am','force-stop',PACKAGE)
        p=subprocess.run([str(self.sdk/'platform-tools/adb'),'-s',self.serial,'shell','pidof',PACKAGE],capture_output=True,timeout=5)
        if p.returncode!=1 or p.stdout.strip():raise Failure('force_stop_not_observed')
        self.actions.append('force_stop')
    def close(self):
        if self.emulator:
            try:self.adb('emu','kill',timeout=5)
            except Exception:pass
            try:self.emulator.wait(timeout=10)
            except subprocess.TimeoutExpired:self.emulator.kill();self.emulator.wait(timeout=5)
        self.output.join()
        if self.created:
            if self.root.is_symlink():raise Failure('cleanup_path')
            shutil.rmtree(self.root)

def targets(port):
    # One bounded response; never print URL/target identifiers or page contents.
    with LOCAL_OPENER.open(f'http://127.0.0.1:{port}/json',timeout=3) as response:
        raw=response.read(262145)
    if len(raw)>262144:raise Failure('target_response_limit')
    rows=json.loads(raw)
    if not isinstance(rows,list) or any(not isinstance(r,dict) for r in rows):raise Failure('target_schema')
    pages=[r for r in rows if r.get('type')=='page']
    if any(not packaged(r.get('url','')) or not isinstance(r.get('id'),str) for r in pages):raise Failure('foreign_page')
    return pages

class Page:
    def __init__(self,device):
        import websocket
        self.device=device;self.port=None;self.ws=None;self.sequence=0;self.target=None;self.pid=None
        self.connection_failures=0
        self.flags={'detached':False,'target_crashed':False,'detach_category':'none'}
        try:
            end=time.monotonic()+90
            while time.monotonic()<end:
                try:
                    pid=device.adb('shell','pidof',PACKAGE,timeout=5)
                    if re.fullmatch(r'\d+',pid) and 'webview_devtools_remote_'+pid in device.adb('shell','cat','/proc/net/unix',timeout=5):self.pid=pid;break
                except (Failure,subprocess.TimeoutExpired):pass
                time.sleep(.2)
            if not self.pid:raise Failure('socket_readiness')
            self.port=int(device.adb('forward','tcp:0','localabstract:webview_devtools_remote_'+self.pid))
            while time.monotonic()<end:
                try:
                    rows=targets(self.port)
                    if len(rows)>1:raise Failure('ambiguous_page')
                    if rows:self.target=rows[0];break
                except (TimeoutError,urllib.error.URLError):pass
                time.sleep(.2)
            if not self.target:raise Failure('target_readiness')
            p=urlparse(self.target.get('webSocketDebuggerUrl',''))
            if p.scheme!='ws' or p.hostname not in ('localhost','127.0.0.1') or p.username or p.password:raise Failure('debug_origin')
            self.ws=websocket.create_connection(urlunparse(p._replace(netloc=f'127.0.0.1:{self.port}')),timeout=10,suppress_origin=True,http_no_proxy=['localhost','127.0.0.1'])
        except Exception:self.close();raise
    def evaluate(self,expression):
        try:return self._evaluate_impl(expression)
        except Exception:
            self.connection_failures+=1
            raise
    def _evaluate_impl(self,expression):
        self.sequence+=1;seq=self.sequence;end=time.monotonic()+15
        self.ws.send(json.dumps({'id':seq,'method':'Runtime.evaluate','params':{'expression':expression,'awaitPromise':True,'returnByValue':True,'timeout':10000}}))
        while time.monotonic()<end:
            self.ws.settimeout(max(.01,min(3,end-time.monotonic())))
            response=json.loads(self.ws.recv())
            method=response.get('method')
            if method=='Inspector.detached':
                self.flags['detached']=True
                reason=response.get('params',{}).get('reason')
                self.flags['detach_category']=reason if reason in ('target_closed','replaced_with_devtools','canceled_by_user') else 'other'
                raise Failure('target_detached')
            if method in ('Inspector.targetCrashed','Target.targetCrashed'):self.flags['target_crashed']=True;raise Failure('target_crashed')
            if response.get('id')!=seq:continue
            if 'error' in response or 'exceptionDetails' in response.get('result',{}):raise Failure('evaluation_error')
            return response.get('result',{}).get('result',{}).get('value')
        raise Failure('evaluation_deadline')
    def readiness(self):
        if self.evaluate('1+1')!=2:raise Failure('javascript_control')
        if self.evaluate("Capacitor.isNativePlatform() && Capacitor.getPlatform()==='android'") is not True:raise Failure('native_platform')
        if self.evaluate("Capacitor.Plugins.App.getState().then(x=>x.isActive)") is not True:raise Failure('native_bridge')
        end=time.monotonic()+30
        while time.monotonic()<end:
            if self.evaluate("typeof window.__IRTH_NATIVE_OBSERVATIONS__==='function' && window.__IRTH_NATIVE_OBSERVATIONS__().unexpected===0 && window.__IRTH_NATIVE_OBSERVATIONS__().nativeBlocked===0 && window.__IRTH_NATIVE_OBSERVATIONS__().bridgeGuardsIntact===true && ("+HOME_READY+")") is True:return
            time.sleep(.2)
        raise Failure('full_app_readiness')
    def reopen_after_intentional_restart(self):
        # Only the recorded native force-stop (with observed PID absence) followed
        # by launch permits replacing this connection. Never a detach recovery.
        if self.flags.get('detached') or self.flags.get('target_crashed') or getattr(self,'connection_failures',0):raise Failure('unplanned_reconnect')
        actions=self.device.actions
        used=getattr(self,'restart_action_count',0)
        if actions[-2:]!=['force_stop','launch'] or len(actions)<=used:raise Failure('unplanned_reconnect')
        self.close()
        replacement=Page(self.device)
        count=getattr(self,'intentional_restarts',0)+1
        failures=getattr(self,'connection_failures',0)+getattr(replacement,'connection_failures',0)
        self.__dict__.update(replacement.__dict__)
        self.connection_failures=failures
        self.restart_action_count=len(actions);self.intentional_restarts=count
        self.readiness()
    def diagnostics(self):
        result=dict(self.flags)
        try:
            rows=targets(self.port);result['current_target_count']=len(rows);result['original_target_present']=any(r['id']==self.target['id'] for r in rows)
        except Exception:result.update(current_target_count=None,original_target_present=None)
        try:result['original_process_present']=self.device.adb('shell','pidof',PACKAGE,timeout=3)==self.pid
        except Exception:result['original_process_present']=None
        try:result['original_socket_present']='webview_devtools_remote_'+self.pid in self.device.adb('shell','cat','/proc/net/unix',timeout=3)
        except Exception:result['original_socket_present']=None
        return result
    def close(self):
        try:
            if self.ws:self.ws.close()
        finally:
            if self.port:
                try:self.device.adb('forward','--remove','tcp:'+str(self.port),timeout=3)
                except Exception:pass

def collect_guest_evidence(report,guest,device):
    for key,probe,args in [('guest_startup',guest.collect,(device.sdk/'platform-tools/adb',device.serial)),('boot_state_discriminator',guest.collect_boot_state,(device.sdk/'platform-tools/adb',device.serial,device.root))]:
        try:report[key]=probe(*args)
        except Exception:report[key]={'diagnostic_error':True}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apk',required=True);parser.add_argument('--receipt',required=True);parser.add_argument('--result',required=True);parser.add_argument('--journeys');args=parser.parse_args()
    report={'result':'FAIL','stage':'preflight','scope':'SYNTHETIC_FULL_APP_ACCEPTANCE_ATTEMPT','reached':{'apk_verified':False,'boot_completed':False,'installed_verified':False,'launched':False,'home_ready':False},'release_ready':False,'unaccepted':['production_policies','private_image_activation_and_send','full_english_content','missing_original_artwork','physical_device_acceptance'],'groups':{name:{'status':'BLOCKED','reason':'not_executed'} for name in sorted(JOURNEYS)},'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    device=None;page=None;exit_code=1
    try:
        require_ci()
        sdk=Path(os.environ['ANDROID_HOME']);root=Path(os.environ['RUNNER_TEMP'])/'irth-full-native-avd'
        device=Device(sdk,root);device.provision();report['sdk_versions']=device.versions;report['acceleration']='HVF'
        report['stage']='apk_verify';report.update(verify_apk(args.apk,args.receipt,sdk));report['reached']['apk_verified']=True
        report['stage']='boot';device.boot();report['reached']['boot_completed']=True
        api=device.adb('shell','getprop','ro.build.version.sdk')
        if not re.fullmatch(r'[0-9]{1,3}',api):raise Failure('api_property')
        report['android_api']=int(api)
        report['stage']='install';device.adb('install',args.apk,timeout=120)
        device.verify_installed(report['apk_sha256']);report['reached']['installed_verified']=True
        report['stage']='launch';device.launch();report['reached']['launched']=True;page=Page(device)
        report['stage']='app_readiness';page.readiness();report['reached']['home_ready']=True
        report['result']='READY_NOT_ACCEPTANCE';exit_code=1
        if args.journeys:
            report['stage']='journeys';spec=importlib.util.spec_from_file_location('journeys',args.journeys);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
            device.record_group=lambda name,status,reason:record_group(report['groups'],name,status,reason)
            groups=module.run(device,page)
            complete=complete_groups(groups)
            if groups!=report['groups']:raise Failure('check_schema')
            report['result']='PASS_SIX_SYNTHETIC_FIXTURE_GROUPS_NOT_RELEASE' if complete else 'INCOMPLETE_SYNTHETIC_FIXTURE_GROUPS'
            exit_code=0 if complete else 1
    except Exception as e:
        report['result']='FAIL';exit_code=1
        report['category']=category(e)
        if page:report.update(page.diagnostics())
    finally:
        if device:
            report['native_actions']=device.actions
            if device.emulator:
                try:report['boot_diagnostics']=device.boot_diagnostics()
                except Exception:report['boot_diagnostics']={'diagnostic_error':True}
                if report['stage']=='boot' and not report['reached']['boot_completed']:
                    try:
                        spec=importlib.util.spec_from_file_location('guest_boot',Path(__file__).with_name('guest_boot_diagnostics.py'));guest=importlib.util.module_from_spec(spec);spec.loader.exec_module(guest)
                    except Exception:
                        report['guest_startup']={'diagnostic_error':True};report['boot_state_discriminator']={'diagnostic_error':True}
                    else:collect_guest_evidence(report,guest,device)
        if page:report['intentional_restarts']=getattr(page,'intentional_restarts',0);report['connection_failures']=getattr(page,'connection_failures',0)
        try:
            if page:page.close()
        except Exception:report['cleanup_failed']=True;report['result']='FAIL';exit_code=1
        try:
            if device:
                device.close()
                if 'boot_diagnostics' in report:report['boot_diagnostics']['emulator_output']=device.output.snapshot()
        except Exception:report['cleanup_failed']=True;report['result']='FAIL';exit_code=1
        Path(args.result).write_text(json.dumps(report,sort_keys=True)+'\n');print(json.dumps(report,sort_keys=True))
    return exit_code
if __name__=='__main__':raise SystemExit(main())
