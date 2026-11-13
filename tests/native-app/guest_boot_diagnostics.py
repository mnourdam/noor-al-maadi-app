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
