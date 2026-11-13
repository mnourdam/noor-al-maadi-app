"""Read-only post-launch-failure observations; never evidence of accepted launch."""
import importlib.util,re,time
from pathlib import Path

def text(row):
    if row['state']!='complete' or row['returncode']!=0:return None
    return row['raw'].decode('utf8','strict').strip()

def pid(row):
    if row['state']!='complete':return 'unavailable',None
    value=row['raw'].decode('utf8','strict').strip()
    if row['returncode']==1 and not value:return 'absent',None
    if row['returncode']!=0 or not re.fullmatch(r'[1-9][0-9]*(?:[ \t]+[1-9][0-9]*)*',value):return 'unavailable',None
    values=value.split()
    return ('present',values[0]) if len(values)==1 else ('ambiguous',None)

def activity(row,package,klass):
    value=text(row)
    if value is None:return 'unavailable'
    lines=[line.strip() for line in value.splitlines() if re.match(r'\s*(?:topResumedActivity|mResumedActivity)\s*[:=]',line)]
    if not lines:return 'not_observed_in_complete_capture'
    observed=[]
    for line in lines:
        match=re.fullmatch(r'(?:topResumedActivity|mResumedActivity)\s*[:=]\s*ActivityRecord\{[^\s{}]+\s+u[0-9]+\s+([A-Za-z0-9_.]+)/([A-Za-z0-9_.$]+)\s+t[0-9]+\}',line)
        if not match:return 'unavailable'
        pkg,cls=match.groups()
        if cls.startswith('.'):cls=pkg+cls
        observed.append((pkg,cls))
    if len(set(observed))!=1:return 'ambiguous'
    return 'exact_component_observed' if observed[0]==(package,klass) else 'other_component_observed'

def socket(row,process):
    value=text(row)
    if value is None:return 'unavailable'
    lines=value.splitlines()
    if not lines or lines[0].split()!=['Num','RefCount','Protocol','Flags','Type','St','Inode','Path']:return 'unavailable'
    expected='@webview_devtools_remote_'+process;found=0
    for line in lines[1:]:
        parts=line.split()
        if len(parts) not in (7,8) or not re.fullmatch(r'[0-9A-Fa-f]+:',parts[0]) or any(not re.fullmatch(r'[0-9A-Fa-f]+',v) for v in parts[1:6]) or not parts[6].isdigit():return 'unavailable'
        if len(parts)==8 and parts[7]==expected:found+=1
    return 'present' if found==1 else ('ambiguous' if found>1 else 'not_observed_in_complete_capture')

def collect(device,package,klass,identity=None):
    # Existing helper caps streams, kills/reaps ONLY its own read-only adb probe.
    spec=importlib.util.spec_from_file_location('launch_guest_capture',Path(__file__).with_name('guest_boot_diagnostics.py'))
    guest=importlib.util.module_from_spec(spec);spec.loader.exec_module(guest)
    start=time.monotonic();deadline=start+12
    out={'status':'observations_only','operation_budget_seconds':12,'probes':{}}
    prefix=[str(device.sdk/'platform-tools/adb'),'-s',device.serial]
    def probe(name,args,cap=8192):
        available=deadline-time.monotonic()
        if available<=0:
            out['probes'][name]={'capture':'not_started_budget'}
            return {'state':'unavailable','returncode':None,'raw':b''}
        before=time.monotonic();row=guest.capture(prefix+args,timeout=min(2,available),cap=cap)
        out['probes'][name]={'capture':row['state'],'start_seconds':round(before-start,6),'end_seconds':round(time.monotonic()-start,6)}
        return row
    first=probe('process_before',['shell','pidof',package]);state,process=pid(first);out['process_before']=state
    out['activity']=activity(probe('activity',['shell','dumpsys','activity','activities'],65536),package,klass)
    if process:
        sockets=probe('socket',['shell','cat','/proc/net/unix'],65536)
        last=probe('process_after',['shell','pidof',package]);last_state,last_process=pid(last);out['process_after']=last_state
        out['same_process_sampled']=last_state=='present' and process==last_process
        out['socket']=socket(sockets,process) if out['same_process_sampled'] else 'unavailable_process_changed_or_unverified'
        if identity is not None and out['same_process_sampled'] and out['activity']=='exact_component_observed' and out['socket'] in ('present','not_observed_in_complete_capture') and all(probe['capture']=='complete' for probe in out['probes'].values()):
            identity.update(origin='launch_reconciliation_same_process',process=process)
    else:out['socket']='unavailable_no_unique_process'
    out['elapsed_seconds']=round(time.monotonic()-start,6)
    return out
