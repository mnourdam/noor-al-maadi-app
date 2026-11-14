"""Independent native screen observation, not bridge or feature acceptance."""
import argparse, hashlib, json, os, re, struct, time, xml.etree.ElementTree as ET
from pathlib import Path
import runner as r
import guest_boot_diagnostics as probes
import launch_reconciliation as reconciliation

LABELS={'guest':'اللعب كضيف','guest_heading':'ابدأ رحلتك في التاريخ','cinematic_skip':'تخطّي المقدمة','cinematic_confirm':'تخطّي المقدمة؟','tutorial_begin':'ابدأ الرحلة','tutorial_next':'التالي'}

def png_dimensions(raw):
    if len(raw)<33 or raw[:8]!=b'\x89PNG\r\n\x1a\n' or raw[12:16]!=b'IHDR':raise ValueError('png_format')
    w,h=struct.unpack('>II',raw[16:24])
    if not 100<=w<=4096 or not w<h<=8192:raise ValueError('portrait_dimensions')
    return w,h

def hierarchy(raw,dimensions):
    if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:raise ValueError('xml_entities')
    root=ET.fromstring(raw)
    if root.tag!='hierarchy' or root.attrib.get('rotation')!='0':raise ValueError('hierarchy_rotation')
    nodes=list(root.iter('node'))
    if not nodes or len(nodes)>2000:raise ValueError('hierarchy_nodes')
    w,h=dimensions; labels={key:0 for key in LABELS};foreign=False;app_nodes=0
    for node in nodes:
        pkg=node.get('package','');bounds=node.get('bounds','')
        m=re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',bounds)
        if not m:raise ValueError('node_bounds')
        left,top,right,bottom=map(int,m.groups())
        if not 0<=left<=right<=w or not 0<=top<=bottom<=h:raise ValueError('node_bounds')
        if pkg==r.PACKAGE:
            app_nodes+=1
            for key,label in LABELS.items():
                if label in (node.get('text'),node.get('content-desc')):labels[key]+=1
        elif pkg=='com.android.systemui':
            # Only known bar containers are exempt, not permissions or dialogs.
            rid=node.get('resource-id','')
            if rid not in ('com.android.systemui:id/status_bar','com.android.systemui:id/navigation_bar_frame'):foreign=True
        elif pkg:foreign=True
    return {'node_count':len(nodes),'app_node_count':app_nodes,'known_labels':labels,'foreign_or_unclassified_system_nodes':foreign,'rotation':0,'width':w,'height':h}

class CaptureFailure(Exception):
    def __init__(self,state):self.state=state

def observe(device,output):
    end=time.monotonic()+60;prefix=[str(device.sdk/'platform-tools/adb'),'-s',device.serial]
    def capture(args,cap=65536,limit=5):
        remaining=end-time.monotonic()
        if remaining<=0:raise TimeoutError()
        row=probes.capture(prefix+args,timeout=min(limit,remaining),cap=cap)
        if row['state']!='complete' or row['returncode']!=0:raise CaptureFailure(row['state'])
        return row
    before=capture(['shell','dumpsys','activity','activities'])
    if reconciliation.activity(before,r.PACKAGE,r.ACTIVITY)!='exact_component_observed':raise ValueError('foreground_unverified')
    image=capture(['exec-out','screencap','-p'],cap=8388608,limit=15)['raw']
    dimensions=png_dimensions(image)
    after=capture(['shell','dumpsys','activity','activities'])
    if reconciliation.activity(after,r.PACKAGE,r.ACTIVITY)!='exact_component_observed':raise ValueError('foreground_changed')
    output.write_bytes(image)
    summary={'hierarchy_status':'unavailable'}
    try:
        # Fixed guest scratch file; XML never becomes a retained host artifact.
        capture(['shell','uiautomator','dump','/sdcard/irth-visual.xml'],limit=20)
        xml=capture(['shell','cat','/sdcard/irth-visual.xml'],cap=262144)['raw']
        summary.update(hierarchy(xml,dimensions));summary['hierarchy_status']='observed'
    except CaptureFailure as error:
        summary['hierarchy_reason']='capture_unavailable'
        if error.state in ('cleanup_failed','reap_failed'):summary['probe_cleanup_failed']=True
    except Exception:summary['hierarchy_reason']='schema_or_deadline_unavailable'
    return {**summary,'screenshot_sha256':hashlib.sha256(image).hexdigest(),'screen_observed':True,'coordinate_actions':0,'coordinate_mapping':'UNACCEPTED','hierarchy_and_png_not_atomic':True,'elapsed_seconds':round(60-(end-time.monotonic()),3)}

BASELINE_HARDWARE={'hw.ramSize':2560,'vm.heapSize':576,'hw.lcd.width':320,'hw.lcd.height':640}
BASELINE_VERSIONS={'emulator':'37.2.13','image':'2.0.0','platform_tools':'37.0.1','build_tools':'35.0.0'}
def online_cpu_set(raw):
    value=raw.decode('ascii','strict').strip()
    if not re.fullmatch(r'[0-9]{1,2}(?:-[0-9]{1,2})?(?:,[0-9]{1,2}(?:-[0-9]{1,2})?)*',value):raise ValueError('online_format')
    found=set()
    for part in value.split(','):
        ends=part.split('-');start=int(ends[0]);end=int(ends[-1])
        if start>end or end>63:raise ValueError('online_range')
        for core in range(start,end+1):
            if core in found:raise ValueError('online_duplicate')
            found.add(core)
    return found

def verify_two_core_trial(device,receipt):
    receipt.update(requested_cores=2,status='unsupported',baseline_comparable=False)
    receipt['sdk_versions']=dict(device.versions)
    configuration=probes.avd_resources(device.root);receipt['avd_numeric_configuration']=configuration
    row=probes.capture([str(device.sdk/'platform-tools/adb'),'-s',device.serial,'shell','cat','/sys/devices/system/cpu/online'],timeout=3,cap=128)
    receipt['online_capture']=row['state']
    if row['state']!='complete' or row['returncode']!=0:raise ValueError('online_unavailable')
    online=online_cpu_set(row['raw']);receipt['online_cpu_count']=len(online);receipt['online_is_exact_0_1']=online=={0,1}
    hardware=configuration['hardware-qemu.ini']
    comparable=device.versions==BASELINE_VERSIONS and all(hardware.get(key)==value for key,value in BASELINE_HARDWARE.items())
    receipt['baseline_comparable']=comparable
    if hardware.get('hw.cpu.ncore')!=2 or online!={0,1} or not comparable:raise ValueError('effective_configuration_mismatch')
    receipt['status']='verified_two_core_comparison'

def main():
    p=argparse.ArgumentParser();p.add_argument('--apk',required=True);p.add_argument('--receipt',required=True);p.add_argument('--evidence',required=True);a=p.parse_args()
    out=Path(a.evidence)
    if out.exists():raise ValueError('fresh_evidence_required')
    out.mkdir(mode=0o700)
    report={'result':'BLOCKED','scope':'NATIVE_VISUAL_OBSERVATION_ONLY','release_ready':False,'native_bridge':'UNACCEPTED_SEPARATE_FAILURE','six_feature_journeys':'NOT_EXECUTED','stage':'preflight','reached':{'apk_verified':False,'boot_completed':False,'installed_verified':False,'launched':False,'screen_observed':False}};device=None
    try:
        r.require_ci();sdk=Path(os.environ['ANDROID_HOME']);device=r.Device(sdk,Path(os.environ['RUNNER_TEMP'])/'irth-visual-avd',guest_cores=2);device.provision()
        report.update(r.verify_apk(a.apk,a.receipt,sdk));report['reached']['apk_verified']=True;report['stage']='boot';device.boot();report['reached']['boot_completed']=True;report['boot_observations']=dict(device.boot_observations)
        report['stage']='effective_guest_configuration';report['guest_configuration']={};verify_two_core_trial(device,report['guest_configuration'])
        report['stage']='install';report['installation']={};r.install_once(device,a.apk,report['apk_sha256'],report['installation'])
        report['reached']['installed_verified']=True;report['stage']='launch';report['launch']={};device.launch(report['launch'],verified_install=True);report['reached']['launched']=True
        report['stage']='screen';report['visual']=observe(device,out/'initial-screen.png')
        report['reached']['screen_observed']=True;report['result']='BLOCKED' if report['visual'].get('probe_cleanup_failed') else 'SCREEN_OBSERVED_NOT_ACCEPTANCE';report['stage']='complete'
    except Exception as error:report['category']=r.safe_diagnostic_error(error)
    finally:
        if device:
            report['native_actions']=device.actions
            try:device.close()
            except Exception:report['cleanup_failed']=True;report['result']='BLOCKED'
        (out/'visual-result.json').write_text(json.dumps(report,sort_keys=True)+'\n')
    return 1  # Observation never turns the known bridge/feature release gates green.
if __name__=='__main__':raise SystemExit(main())
