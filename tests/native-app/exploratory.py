"""Opt-in post-failure observation, never boot or release acceptance."""
import hashlib,json,time,subprocess,re
from pathlib import Path

def run(api,guest,device,apk,receipt,original):
    start=time.monotonic();deadline=start+300;page=None
    result={'scope':'EXPLORATORY_HOME_ONLY_AFTER_BOOT_FAILURE','attempted':False,'result':'BLOCKED','release_ready':False,'actions':[],'reached':{},'helper_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source_sha':original.get('source_sha'),'original_snapshot':json.loads(json.dumps(original))}
    # Never mutate the caller's report or original device action history.
    class BoundedDevice:
        def __init__(self):self.sdk=device.sdk;self.serial=device.serial;self.actions=result['actions']
        def adb(self,*args,timeout=15):return device.adb(*args,timeout=api['remaining'](deadline,timeout))
        def cleanup_adb(self,*args,timeout=3):return device.adb(*args,timeout=min(3,timeout))
    bounded=BoundedDevice()
    def boot_sample():
        try:return api['fixed_value'](bounded.adb('shell','getprop','sys.boot_completed',timeout=2),{'0','1'})
        except Exception:return 'unavailable'
    def probe(args,kind,name):
        row=guest.capture([str(device.sdk/'platform-tools/adb'),'-s',device.serial,*args],timeout=api['remaining'](deadline,2))
        return guest.parse(kind,name,row)
    try:
        if original.get('category')!='boot_deadline' or original.get('result')!='FAIL' or original.get('release_ready') is not False or original['reached'].get('boot_completed') or not original['reached'].get('apk_verified'):raise api['Failure']('exploratory_admission')
        if original.get('stage')!='boot' or set(original.get('groups',{}))!=api['JOURNEYS'] or any(original['reached'].get(k) is not False for k in ('installed_verified','launched','home_ready')):raise api['Failure']('exploratory_admission')
        if any(row!={'status':'BLOCKED','reason':'not_executed'} for row in original['groups'].values()):raise api['Failure']('exploratory_admission')
        if any(key not in original or original[key].get('diagnostic_error') for key in ('boot_diagnostics','guest_startup','boot_state_discriminator')):raise api['Failure']('exploratory_snapshot')
        if device.emulator is None or device.emulator.poll() is not None:raise api['Failure']('exploratory_admission')
        result['boot_at_entry']=boot_sample()
        if bounded.adb('get-state',timeout=2)!='device':raise api['Failure']('exploratory_prerequisites')
        checks=[(('shell','pidof','system_server'),'pid','system_server','present'),(('shell','service','check','activity'),'service','activity','found'),(('shell','service','check','package'),'service','package','found'),(('shell','cmd','package','path','android'),'package','android','present')]
        for args,kind,name,expected in checks:
            if probe(args,kind,name)!=expected:raise api['Failure']('exploratory_prerequisites')
        api['package_absent'](bounded,deadline)
        verified=api['verify_apk'](apk,receipt,device.sdk,deadline)
        if any(verified.get(k)!=original.get(k) for k in ('apk_sha256','source_sha','signer_sha256')):raise api['Failure']('exploratory_identity')
        result['attempted']=True;result['actions'].append('install')
        result['installation']={}
        api['install_once'](bounded,apk,verified['apk_sha256'],result['installation'],deadline,reconcile_device=device)
        result['reached']['installed_verified']=True;result['launch']={}
        try:api['launch_once'](bounded,result['launch'],deadline,reconcile_device=device)
        finally:
            if result['launch'].get('dispatch_attempted'):result['actions'].append('launch')
        result['reached']['launched']=True
        page=api['Page'](bounded,deadline=deadline);page.readiness()
        result['reached']['home_native_bridge']=True;result['result']='HOME_OBSERVED_NOT_ACCEPTANCE'
    except Exception as error:
        result['result']='BLOCKED';result['category']=api['category'](error)
    finally:
        result['boot_at_end']=boot_sample();result['elapsed_seconds']=round(time.monotonic()-start,3)
        # Separate bounded cleanup allowance: never reset/reconnect the page.
        if page:
            result['connection_failures']=page.connection_failures;result['connection_flags']=dict(page.flags)
            try:
                if page.ws:page.ws.settimeout(2);page.ws.close(timeout=2)
            except Exception:result['transport_cleanup_failed']=True
            try:
                if page.port:device.adb('forward','--remove','tcp:'+str(page.port),timeout=3)
            except Exception:result['transport_cleanup_failed']=True
        result['owned_avd_cleanup']='delegated_to_runner_finally'
    return result
