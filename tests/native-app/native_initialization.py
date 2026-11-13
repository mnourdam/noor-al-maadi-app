"""Read-only native startup hints after one timed-out launch; never acceptance."""
import importlib.util,re,time
from pathlib import Path
MARKERS={
 ('Capacitor','Starting BridgeActivity'):'bridge_construction_started',
 ('Capacitor','App started'):'bridge_app_started',
 ('Capacitor','App resumed'):'bridge_app_resumed',
 ('Capacitor','System WebView is not supported'):'unsupported_webview_hint',
 ('Capacitor','Error loading plugins.'):'plugin_loading_error_hint',
}
def load(name):
    spec=importlib.util.spec_from_file_location('init_'+name,Path(__file__).with_name(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def log_markers(row,process):
    hints={v:False for v in MARKERS.values()};hints['fatal_exception_hint']=False
    if row['state']!='complete' or row['returncode']!=0:return {'status':'unavailable','hints':hints}
    # brief format: priority/tag(PID): message. Never emit arbitrary messages.
    lines=row['raw'].decode('utf8','strict').splitlines();parsed=0
    for line in lines:
        if not line or line.startswith('--------- beginning of '):continue
        match=re.fullmatch(r'([VDIWEF])/([^()\s]+)\s*\(\s*([1-9][0-9]*)\): (.*)',line)
        if not match:return {'status':'unavailable_format','hints':{key:False for key in hints}}
        _,tag,observed,message=match.groups()
        if observed!=process:return {'status':'unavailable_identity','hints':{key:False for key in hints}}
        parsed+=1
        marker=MARKERS.get((tag,message))
        if marker:hints[marker]=True
        if tag=='AndroidRuntime' and message.startswith('FATAL EXCEPTION: '):hints['fatal_exception_hint']=True
    return {'status':'tail_observed_not_complete_history','lines_parsed':parsed,'hints':hints}

def observe(device,package,klass,identity,receipt,verified_install):
    out={'status':'not_admitted','scope':'NATIVE_INITIALIZATION_OBSERVATIONS_NOT_ACCEPTANCE','release_ready':False,'operation_budget_seconds':60,'samples':[],'probes':[]}
    process=identity.get('process')
    if verified_install is not True or receipt.get('failure_category')!='TimeoutExpired' or receipt.get('dispatch_attempted') is not True or receipt.get('command_completed') is not False or receipt.get('stage')!='launch_command':return out
    if identity.get('origin')!='launch_reconciliation_same_process' or not isinstance(process,str) or not re.fullmatch(r'[1-9][0-9]*',process):return out
    out['baseline']='unique_same_process_from_launch_reconciliation'
    start=time.monotonic();end=start+60
    guest=load('guest_boot_diagnostics');parsers=load('launch_reconciliation')
    prefix=[str(device.sdk/'platform-tools/adb'),'-s',device.serial]
    class Stop(Exception):pass
    def capture(label,args,cap=8192):
        before=time.monotonic();left=end-before
        if left<=0:out['status']='budget_exhausted';raise Stop()
        row=guest.capture(prefix+args,timeout=min(2,left),cap=cap)
        after=time.monotonic()
        out['probes'].append({'kind':label,'capture':row['state'],'start_seconds':round(before-start,6),'end_seconds':round(after-start,6)})
        if row['state'] in ('cleanup_failed','reap_failed'):out['status']='capture_cleanup_failed_stopped';raise Stop()
        if after>end:out['status']='budget_exhausted';raise Stop()
        return row
    def same_process():
        state,current=parsers.pid(capture('process',['shell','pidof',package]))
        if state!='present' or current!=process:
            out['status']='identity_uncertain_stopped';out['process_state']=state;raise Stop()
    def bracket(label,args,parser,cap=65536):
        same_process();row=capture(label,args,cap);same_process()
        return parser(row)
    try:
        for at in (0,10,30,50):
            delay=start+at-time.monotonic()
            if delay>0:time.sleep(min(delay,max(0,end-time.monotonic())))
            value=bracket('socket',['shell','cat','/proc/net/unix'],lambda row:parsers.socket(row,process))
            out['samples'].append({'target_seconds':at,'observed_seconds':round(time.monotonic()-start,6),'socket':value})
        out['activity']=bracket('activity',['shell','dumpsys','activity','activities'],lambda row:parsers.activity(row,package,klass))
        out['log_tail']=bracket('log_tail',['logcat','-d','--pid='+process,'-b','main','-b','system','-b','crash','-t','128','-v','brief','Capacitor:D','AndroidRuntime:E','*:S'],lambda row:log_markers(row,process),16384)
        out['status']='observation_complete_not_acceptance'
    except Stop:pass
    finally:out['elapsed_seconds']=round(time.monotonic()-start,6)
    return out
