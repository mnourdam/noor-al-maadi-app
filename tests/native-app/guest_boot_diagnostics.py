"""Fixed, read-only, post-failure guest probes. Raw output never leaves this module."""
import math,os,re,selectors,subprocess,time
SERVICE_NAMES=('zygote','zygote_secondary','surfaceflinger','servicemanager','bootanim')
LOG_INDICATORS={
 'fatal_exception':('fatal exception:',),
 'system_server_crash':('fatal exception in system process','system_server has died'),
 'watchdog':('watchdog killing system process','*** watchdog killing system process'),
 'selinux_denial':('avc: denied',),
 'vm_initialization':('could not create the java virtual machine','failed to initialize the runtime','could not create art runtime'),
 'dex_error':('failed to open dex','failed to load dex','dex2oat failed'),
}
def capture(args,timeout=2,cap=8192):
 """Bound both merged streams; always reap only this owned probe process."""
 data=bytearray();process=None;selector=None;state='complete';eof=False;code=None
 try:
  process=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  os.set_blocking(process.stdout.fileno(),False);selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
  end=time.monotonic()+timeout
  while not eof:
   remaining=end-time.monotonic()
   if remaining<=0:state='timeout';break
   if not selector.select(remaining):state='timeout';break
   chunk=os.read(process.stdout.fileno(),min(4096,cap+1-len(data)))
   if not chunk:eof=True;break
   data.extend(chunk)
   if len(data)>cap:state='truncated';break
  if eof:
   try:code=process.wait(timeout=max(.001,end-time.monotonic()))
   except subprocess.TimeoutExpired:state='timeout'
 except Exception:state='unavailable'
 finally:
  cleanup_failed=False;reap_failed=False
  if selector:
   try:selector.close()
   except Exception:cleanup_failed=True
  if process:
   try:
    if process.poll() is None:process.kill()
   except Exception:cleanup_failed=True
   try:process.wait(timeout=1)
   except Exception:reap_failed=True
   try:
    if process.stdout:process.stdout.close()
   except Exception:cleanup_failed=True
  if reap_failed:state='reap_failed'
  elif cleanup_failed:state='cleanup_failed'
 return {'state':state,'returncode':code,'raw':bytes(data[:cap])}

def parse(kind,name,result):
 if result['state']!='complete':return 'unavailable'
 value=result['raw'].decode('utf8','replace').strip();code=result['returncode']
 if kind=='pid':
  if code==1 and not value:return 'absent'
  if code==0 and re.fullmatch(r'[0-9]+(?:\s+[0-9]+)*',value):return 'present'
  return 'unavailable'
 if code!=0:return 'unavailable'
 if kind=='init':return value if value in ('running','stopped','restarting') else ('empty' if not value else 'unavailable')
 if kind=='service':
  if value==f'Service {name}: found':return 'found'
  if value==f'Service {name}: not found':return 'not_found'
  return 'unavailable'
 if kind=='package':return 'present' if re.fullmatch(r'package:/[^\s]+',value) else 'unavailable'
 if kind=='uptime':
  if not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?\s+[0-9]+(?:\.[0-9]+)?',value):return 'unavailable'
  seconds=float(value.split()[0]);return round(seconds,2) if math.isfinite(seconds) and 0<=seconds<=604800 else 'unavailable'
 return 'unavailable'

def collect(adb,serial):
 prefix=[str(adb),'-s',serial]
 probes=[('init_'+name,'init',name,['shell','getprop','init.svc.'+name]) for name in SERVICE_NAMES]
 probes += [('system_server','pid','system_server',['shell','pidof','system_server']),('activity_service','service','activity',['shell','service','check','activity']),('package_service','service','package',['shell','service','check','package']),('android_package','package','android',['shell','cmd','package','path','android']),('uptime_seconds','uptime','uptime',['shell','cat','/proc/uptime'])]
 result={'sample':'post_boot_failure_only','probes':{}}
 for key,kind,name,args in probes:
  measured=capture(prefix+args)
  result['probes'][key]={'value':parse(kind,name,measured),'capture':measured['state']}
 log=capture(prefix+['logcat','-d','-b','main','-b','system','-b','crash','-t','64'],cap=65536)
 text=log['raw'].decode('utf8','replace').lower()
 result['logcat']={'capture':log['state'],'command_succeeded':log['state']=='complete' and log['returncode']==0,'bytes_capped':len(log['raw']),'indicators':{key:any(token in text for token in tokens) for key,tokens in LOG_INDICATORS.items()}}
 return result

# Fields inspected in AOSP frameworks/base cc8bb19595c661f5cf42f330457000e643c67d1b.
AMS_FIELDS=('mBooting','mBooted','mCallFinishBooting','mBootAnimationComplete')
WMS_FIELDS=('mSystemBooted','mDisplayEnabled')
RESOURCE_LIMITS={'hw.ramSize':1048576,'hw.cpu.ncore':256,'vm.heapSize':1048576,'hw.lcd.width':16384,'hw.lcd.height':16384,'hw.lcd.density':4096}
def complete_text(result):
 return result['raw'].decode('utf8','replace').strip() if result['state']=='complete' and result['returncode']==0 else None
def unique_value(values,allowed=None):
 if not values:return 'unavailable'
 if len(values)!=1:return 'ambiguous'
 return values[0] if allowed is None or values[0] in allowed else 'unavailable'
def parse_boot_fields(result,fields):
 text=complete_text(result)
 return {key:unique_value(re.findall(r'(?<![A-Za-z0-9_])'+re.escape(key)+r'=([^\s]+)',text),{'true','false'}) if text is not None else 'unavailable' for key in fields}
def parse_enum(result,allowed):
 text=complete_text(result)
 if text is None:return 'unavailable'
 return text if text in allowed else ('empty' if text in ('','null') else 'unavailable')
def parse_home(result):
 text=complete_text(result)
 if text is None:return 'unavailable'
 if text=='No activity found':return 'absent'
 return 'present' if re.fullmatch(r'[A-Za-z0-9_.$]+/[A-Za-z0-9_.$]+',text) else 'unavailable'
def parse_memory(result):
 text=complete_text(result);out={}
 for key in ('MemTotal','MemAvailable'):
  values=re.findall(r'^'+key+r':\s*([^\n]+)$',text,re.M) if text is not None else []
  value=unique_value(values)
  match=re.fullmatch(r'([0-9]{1,12})\s+kB',value)
  out[key+'_kib']=int(match[1]) if match and 0<=int(match[1])<=1099511627776 else (value if value in ('ambiguous','unavailable') else 'unavailable')
 return out

def avd_resources(root):
 # Only the fresh fixed-name AVD owned by this runner; never follow links.
 out={}
 for filename in ('config.ini','hardware-qemu.ini'):
  fields={key:'unavailable' for key in RESOURCE_LIMITS}
  folder=root/'irth-full-acceptance.avd';path=folder/filename
  if root.is_absolute() and root.resolve()==root and not root.is_symlink() and not folder.is_symlink() and folder.is_dir() and not path.is_symlink() and path.is_file() and path.stat().st_size<=65536:
   text=path.read_text(errors='replace')
   for key,limit in RESOURCE_LIMITS.items():
    value=unique_value(re.findall(r'^\s*'+re.escape(key)+r'\s*=\s*([^\r\n]*)',text,re.M))
    fields[key]=int(value) if re.fullmatch(r'[0-9]{1,9}',value) and 0<int(value)<=limit else (value if value in ('ambiguous','unavailable') else 'unavailable')
  out[filename]=fields
 return out

def collect_boot_state(adb,serial,root):
 prefix=[str(adb),'-s',serial];out={'sample':'post_failure_not_admission','user_scope':0}
 for name,args,fields in [('activity',['shell','dumpsys','activity','processes'],AMS_FIELDS),('window',['shell','dumpsys','window','windows'],WMS_FIELDS)]:
  result=capture(prefix+args,cap=262144)
  out[name]={'capture':result['state'],'fields':parse_boot_fields(result,fields)}
 for key,args,allowed in [
  ('animation_disabled',['shell','getprop','debug.sf.nobootanimation'],{'0','1'}),
  ('animation_exit',['shell','getprop','service.bootanim.exit'],{'0','1'}),
  ('factory_test',['shell','getprop','ro.factorytest'],{'0','1','2'}),
  ('device_provisioned',['shell','settings','get','global','device_provisioned'],{'0','1'}),
  ('user_setup_complete',['shell','settings','--user','0','get','secure','user_setup_complete'],{'0','1'})]:
  result=capture(prefix+args);out[key]={'capture':result['state'],'value':parse_enum(result,allowed)}
 result=capture(prefix+['shell','cmd','package','resolve-activity','--brief','--user','0','-a','android.intent.action.MAIN','-c','android.intent.category.HOME'])
 out['home_resolver']={'capture':result['state'],'value':parse_home(result)}
 result=capture(prefix+['shell','cat','/proc/meminfo'])
 out['guest_memory']={'capture':result['state'],'values':parse_memory(result)}
 events=capture(prefix+['logcat','-d','-b','events','-v','tag','-t','64',*[tag+':I' for tag in BOOT_EVENTS],'*:S'])
 out['boot_events']={'capture':events['state'],'timestamp_ms':parse_boot_events(events)}
 out['avd_numeric_configuration']=avd_resources(root)
 return out

BOOT_EVENTS=('boot_progress_system_run','boot_progress_pms_start','boot_progress_pms_system_scan_start','boot_progress_pms_data_scan_start','boot_progress_pms_scan_end','boot_progress_pms_ready','boot_progress_ams_ready','boot_progress_enable_screen','wm_boot_animation_done')
def parse_boot_events(result):
 text=complete_text(result);out={}
 for tag in BOOT_EVENTS:
  values=re.findall(r'^I/\s*'+re.escape(tag)+r'\s*:[ \t]*([^\r\n]*)$',text,re.M) if text is not None else []
  value=unique_value(values)
  out[tag]=int(value) if re.fullmatch(r'[0-9]{1,12}',value) and int(value)<=604800000 else (value if value in ('ambiguous','unavailable') else 'unavailable')
 return out
