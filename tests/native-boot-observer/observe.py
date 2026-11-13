"""App-free cold boot observation; no application acceptance or installation."""
import argparse,hashlib,importlib.util,json,os,re,subprocess,time
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]/'native-app'
def load(name):
 spec=importlib.util.spec_from_file_location(name,BASE/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
r=load('runner');g=load('guest_boot_diagnostics')
LIMIT=900
ARGV=['-avd','irth-full-acceptance','-port','5580','-accel','on','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader_indirect']
EXPECTED={'hw.ramSize':2560,'hw.cpu.ncore':1,'vm.heapSize':576,'hw.lcd.width':320,'hw.lcd.height':640}
def boundary(first):
 if first is None:return 'not_observed'
 if first['end_seconds']<=600:return 'observed_by_600'
 return 'straddled_600' if first['start_seconds']<600 else 'observed_after_600'
def snapshot(device,start,label,end):
 out={'label':label,'probes':{}}
 for name,args,fields in [('activity',['shell','dumpsys','activity','processes'],g.AMS_FIELDS),('window',['shell','dumpsys','window','windows'],g.WMS_FIELDS)]:
  before=time.monotonic()
  if before>=end:out['probes'][name]={'capture':'not_started_deadline'};continue
  measured=g.capture([str(device.sdk/'platform-tools/adb'),'-s',device.serial,*args],timeout=min(2,end-before),cap=262144)
  out['probes'][name]={'start_seconds':round(before-start,3),'end_seconds':round(time.monotonic()-start,3),'capture':measured['state'],'fields':g.parse_boot_fields(measured,fields)}
 return out

def observe(device,report):
 if device.root.exists():raise r.Failure('fresh_avd_required')
 listing=r.command([device.sdk/'platform-tools/adb','devices'])
 if any(line.strip() and not line.startswith('List of devices') for line in listing.splitlines()):raise r.Failure('existing_devices')
 device.root.mkdir(mode=0o700);device.created=True;os.environ['ANDROID_AVD_HOME']=str(device.root)
 r.command([device.sdk/'cmdline-tools/latest/bin/avdmanager','create','avd','-n','irth-full-acceptance','-k',r.IMAGE],60,input=b'no\n')
 start=time.monotonic();device.emulator=subprocess.Popen([str(device.sdk/'emulator/emulator'),*ARGV],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 report['spawn_end_seconds']=round(time.monotonic()-start,3);device.output.start(device.emulator.stdout,device.emulator.stderr)
 end=start+LIMIT;next_snapshot=300;first=None;timeline=[];count=0;last=None
 report['timeline']=timeline;report['snapshots']=[]
 while time.monotonic()<end:
  if device.emulator.poll() is not None:raise r.Failure('emulator_exited')
  before=time.monotonic()
  if before>=end:break
  measured=g.capture([str(device.sdk/'platform-tools/adb'),'-s',device.serial,'shell','getprop','sys.boot_completed'],timeout=min(2,max(.001,end-before)),cap=128)
  after=time.monotonic();value=g.parse_enum(measured,{'0','1'});count+=1
  sample={'start_seconds':before-start,'end_seconds':after-start,'value':value,'capture':measured['state']}
  if value!=last or value=='1':
   if len(timeline)<64:timeline.append(sample)
   else:report['timeline_truncated']=True
   last=value
  report['poll_count']=count;report['last_sample']=sample
  if value=='1':first=sample;break
  if after-start>=next_snapshot and next_snapshot<=600:
   report['snapshots'].append(snapshot(device,start,str(next_snapshot),end));next_snapshot+=300
  remaining=end-time.monotonic()
  if remaining>0:time.sleep(min(1,remaining))
 report['first_one']=first;report['original_600_observation']=boundary(first)
 report['result']='BOOT_OBSERVED_NOT_APP_ACCEPTANCE' if first and first['end_seconds']<=LIMIT else 'NO_BOOT_OBSERVED_WITHIN_900'
 # Explicit independent post-observation diagnostic allowance (max6s plus local work).
 report['snapshots'].append(snapshot(device,start,'terminal',time.monotonic()+6))
 report['avd_numeric_configuration']=g.avd_resources(device.root)
 effective=report['avd_numeric_configuration']['hardware-qemu.ini']
 report['known_configuration_comparable']=all(effective.get(k)==v for k,v in EXPECTED.items())
 report['observation_end_seconds']=round(time.monotonic()-start,3)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--result',required=True);args=parser.parse_args()
 report={'scope':'APP_FREE_BOOT_OBSERVATION_ONLY','result':'FAIL','release_ready':False,'app_started':False,'original_acceptance_budget_seconds':600,'observation_ceiling_seconds':LIMIT,'original_600_observation':'not_established','emulator_arguments':ARGV,'image':r.IMAGE,'source_sha':None,'implementation_sha256':{name:hashlib.sha256(path.read_bytes()).hexdigest() for name,path in [('observer',Path(__file__)),('runner',BASE/'runner.py'),('guest',BASE/'guest_boot_diagnostics.py')]}}
 device=None;code=1
 try:
  r.require_ci();sha=r.command(['git','rev-parse','HEAD'])
  if not re.fullmatch('[0-9a-f]{40}',sha):raise r.Failure('source_identity')
  report['source_sha']=sha
  device=r.Device(Path(os.environ['ANDROID_HOME']),Path(os.environ['RUNNER_TEMP'])/'irth-boot-observation-avd')
  device.provision();report['sdk_versions']=device.versions
  if device.versions.get('emulator')!='37.2.13' or device.versions.get('image')!='2.0.0':raise r.Failure('tool_revision')
  observe(device,report)
  code=0 if report['result']=='BOOT_OBSERVED_NOT_APP_ACCEPTANCE' and report['known_configuration_comparable'] else 1
 except Exception as error:report['category']=r.category(error)
 finally:
  if device:
   try:device.close();report['cleanup']='completed'
   except Exception:report['cleanup']='failed';code=1
   report['emulator_output']=device.output.snapshot()
  Path(args.result).write_text(json.dumps(report,sort_keys=True)+'\n');print(json.dumps(report,sort_keys=True))
 return code
if __name__=='__main__':raise SystemExit(main())
