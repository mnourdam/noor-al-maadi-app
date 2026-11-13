"""CI-only producer. Actual full-app APK, disposable copy/key; no device execution."""
import argparse,hashlib,importlib.util,json,os,re,shutil,subprocess,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-full-app.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
def build_env(home,sha):
 env={key:os.environ[key] for key in ('PATH','JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','TMPDIR','SYSTEMROOT') if key in os.environ}
 env.update(HOME=str(home),LANG='C.UTF-8',NODE_OPTIONS='--max-old-space-size=1536',GITHUB_SHA=sha,ANDROID_BUILD_TYPE='debug')
 return env

def verify_manifest(text):
 # aapt xmltree: inspect element-local attributes rather than unrelated substrings.
 nodes=[];stack=[]
 for line in text.splitlines():
  stripped=line.lstrip();indent=len(line)-len(stripped)
  if stripped.startswith('E: '):
   while stack and stack[-1][0]>=indent:stack.pop()
   node={'kind':stripped.split()[1],'attrs':{},'parent':stack[-1][1] if stack else None};nodes.append(node);stack.append((indent,node))
  elif stripped.startswith('A: ') and stack:
   match=re.match(r'A: android:([a-zA-Z]+)(?:\([^)]*\))?=(.*)',stripped)
   if match:stack[-1][1]['attrs'][match.group(1)]=match.group(2)
 def quoted(value,expected):return value.startswith('"'+expected+'"')
 app=next((n for n in nodes if n['kind']=='application'),None)
 p.require(app is not None and app['attrs'].get('debuggable','').endswith('0xffffffff'),'APK is not debuggable')
 p.require(any(n['kind']=='activity' and quoted(n['attrs'].get('name',''),'app.lovable.irth.MainActivity') for n in nodes),'actual activity missing')
 p.require(any(n['kind']=='provider' and quoted(n['attrs'].get('authorities',''),p.APP_ID+'.fileprovider') for n in nodes),'provider authority not isolated')
 schemes=[n['attrs']['scheme'] for n in nodes if n['kind']=='data' and 'scheme' in n['attrs']]
 p.require(len(schemes)==1 and quoted(schemes[0],p.APP_ID),'OAuth scheme not isolated')
 for key in ('firebase_messaging_auto_init_enabled','firebase_analytics_collection_enabled','firebase_data_collection_default_enabled'):
  found=[n for n in nodes if n['kind']=='meta-data' and n['parent'] is app and quoted(n['attrs'].get('name',''),key)]
  p.require(len(found)==1 and re.fullmatch(r'\(type 0x12\)0x0+',found[0]['attrs'].get('value','')) is not None,'Firebase metadata not disabled')

STATE={'result':'FAIL','stage':'producer_preflight','release_ready':False}
# These are bounded text indicators, not diagnoses. No matched text is retained.
GRADLE_INDICATORS={
 'dependency_resolution': ('could not resolve all files', 'could not resolve all dependencies', 'could not find '),
 'network_resolution': ('unknownhostexception', 'connect timed out', 'connection timed out', 'could not get resource'),
 'sdk_license': ('license for package', 'licenses have not been accepted'),
 'sdk_location': ('sdk location not found', 'failed to find platform sdk'),
 'java_compatibility': ('unsupported class file major version', 'invalid source release', 'requires java'),
 'compilation': ('compilation failed', 'compiledebugjavawithjavac failed'),
 'task_failure': ('execution failed for task',),
 'daemon_disappeared': ('gradle build daemon disappeared unexpectedly',),
 'memory': ('outofmemoryerror', 'java heap space', 'gc overhead limit exceeded'),
 'disk_space': ('no space left on device',),
}
def gradle_indicators(*outputs):
 # Inspect only a bounded head/tail of each captured stream, including timeout bytes.
 parts=[]
 for value in outputs:
  if isinstance(value,bytes):value=value[:65536].decode('utf-8','replace')+' '+value[-65536:].decode('utf-8','replace')
  elif isinstance(value,str):value=value[:65536]+' '+value[-65536:]
  else:value=''
  parts.append(value.lower())
 text=' '.join(parts)
 return {key:any(token in text for token in tokens) for key,tokens in GRADLE_INDICATORS.items()}
def failure_evidence(error):
 if isinstance(error,subprocess.TimeoutExpired):category='command_timeout'
 elif isinstance(error,subprocess.CalledProcessError):category='command_exit'
 elif isinstance(error,ValueError):category='configuration_or_validation'
 elif isinstance(error,OSError):category='operating_system_error'
 else:category='unexpected_exception'
 evidence={'category':category}
 source=os.environ.get('GITHUB_SHA','')
 if re.fullmatch(r'[0-9a-f]{40}',source):evidence['source_sha']=source
 if isinstance(error,subprocess.CalledProcessError):
  value=error.returncode
  evidence['returncode']=value if type(value) is int and -255<=value<=255 else None
 if STATE.get('stage')=='gradle_debug' and isinstance(error,(subprocess.TimeoutExpired,subprocess.CalledProcessError)):
  evidence['gradle_indicators']=gradle_indicators(error.stdout,error.stderr)
 return evidence

def run_command(args,root,env,timeout=900):
 labels={'vite.js':'web_build','finalize-android.mjs':'web_finalize','capacitor':'native_sync','keytool':'ephemeral_signing','bash':'gradle_debug','aapt':'apk_manifest_inspection','apksigner':'apk_signer_inspection'}
 STATE['stage']=labels.get(Path(args[1] if args[0]=='node' else args[0]).name,'producer_command')
 # Capture only. Neither raw output nor command arguments enter retained evidence.
 result=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True,timeout=timeout)
 if result.returncode!=0:
  raise subprocess.CalledProcessError(result.returncode,args,output=result.stdout,stderr=result.stderr)
 return result.stdout

def build(root):
 p.require(os.environ.get('GITHUB_ACTIONS')=='true','build requires disposable CI')
 p.require(os.environ.get('GITHUB_REF')=='refs/heads/v18-01a-outbox-recovery','isolated branch only')
 receipt=p.prepare(root);home=root/'private-home';home.mkdir(mode=0o700);env=build_env(home,receipt['source_sha'])
 def run(args,timeout=900):
  return run_command(args,root,env,timeout)
 p.require((p.ROOT/'node_modules/.bin/vite').is_file(),'locked source dependencies missing')
 (root/'node_modules').symlink_to(p.ROOT/'node_modules',target_is_directory=True)
 (root/'scripts').mkdir();shutil.copy2(p.ROOT/'scripts/finalize-android.mjs',root/'scripts/finalize-android.mjs')
 run(['node',str(p.ROOT/'node_modules/vite/bin/vite.js'),'build','--config',str(root/'vite.acceptance.config.ts')])
 run(['node','scripts/finalize-android.mjs'])
 run(['node',str(p.ROOT/'node_modules/@capacitor/cli/bin/capacitor'),'sync','android'])
 # Per-run debug certificate only, never an owner/release signing key.
 key=root/'acceptance-debug.keystore'
 run(['keytool','-genkeypair','-keystore',str(key),'-storepass','android','-keypass','android','-alias','acceptance','-dname','CN=Disposable Irth Acceptance','-keyalg','RSA','-keysize','2048','-validity','2','-noprompt'])
 certificate=run(['keytool','-exportcert','-rfc','-keystore',str(key),'-storepass','android','-alias','acceptance'])
 import base64
 match=re.search(r'-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----',certificate,re.S);p.require(match is not None,'certificate unavailable')
 signer=hashlib.sha256(base64.b64decode(match.group(1))).hexdigest()
 gradle=root/'android/app/build.gradle'
 with gradle.open('a') as f:f.write("\nandroid { signingConfigs { acceptance { storeFile file('../../acceptance-debug.keystore'); storePassword 'android'; keyAlias 'acceptance'; keyPassword 'android' } }; buildTypes { debug { signingConfig signingConfigs.acceptance } } }\n")
 # Bind expected assets BEFORE packaging, not by accepting arbitrary APK contents.
 asset_root=root/'android/app/src/main/assets';assets={}
 for relative in ('public','capacitor.config.json'):
  target=asset_root/relative
  files=target.rglob('*') if target.is_dir() else [target]
  for file in files:
   if file.is_file():assets['assets/'+str(file.relative_to(asset_root))]=hashlib.sha256(file.read_bytes()).hexdigest()
 p.require('assets/public/index.html' in assets and 'assets/capacitor.config.json' in assets,'missing actual packaged assets')
 cfg=json.loads((asset_root/'capacitor.config.json').read_text())
 p.require(cfg.get('appId')==p.APP_ID and cfg.get('server',{}).get('androidScheme')=='https' and not cfg.get('server',{}).get('url') and not cfg.get('server',{}).get('allowNavigation') and cfg.get('android',{}).get('allowMixedContent') is False,'unsafe native server configuration')
 run(['bash','android/gradlew','-p','android','--no-daemon','assembleDebug'],timeout=1200)
 apk=root/'android/app/build/outputs/apk/debug/app-debug.apk';p.require(apk.is_file(),'APK missing')
 with zipfile.ZipFile(apk) as archive:
  names=[n for n in archive.namelist() if n.startswith('assets/public/') and not n.endswith('/') or n=='assets/capacitor.config.json']
  p.require(len(names)==len(set(names)) and set(names)==set(assets),'APK asset membership mismatch')
  p.require(all(hashlib.sha256(archive.read(n)).hexdigest()==assets[n] for n in names),'APK assets differ from built source')
 sdk=Path(env.get('ANDROID_SDK_ROOT') or env.get('ANDROID_HOME',''))
 tools=sdk/'build-tools/35.0.0';p.require(tools.is_dir(),'pinned Android build tools35.0.0 missing');badging=run([str(tools/'aapt'),'dump','badging',str(apk)]);permissions=run([str(tools/'aapt'),'dump','permissions',str(apk)])
 p.require("package: name='"+p.APP_ID+"'" in badging,'package isolation failed')
 p.require('android.permission.INTERNET' not in permissions,'INTERNET merged into APK')
 manifest=run([str(tools/'aapt'),'dump','xmltree',str(apk),'AndroidManifest.xml'])
 verify_manifest(manifest)
 resources=run([str(tools/'aapt'),'dump','resources',str(apk)])
 p.require(not any(x in resources for x in ('google_app_id','default_web_client_id','google_api_key')),'production Firebase resources present')
 signatures=run([str(tools/'apksigner'),'verify','--print-certs',str(apk)])
 found=re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)',signatures)
 p.require(found==[signer],'unexpected APK signer')
 output={'apk_sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'signer_sha256':signer,'assets_sha256':assets,'application_id':p.APP_ID,'source_sha':receipt['source_sha'],'scope':'BUILT ONLY; SIX JOURNEYS NOT ACCEPTED','synthetic_boundaries':receipt['synthetic_boundaries']}
 (root/'apk-receipt.json').write_text(json.dumps(output,indent=2)+'\n')
 STATE.update(result='BUILT_NOT_ACCEPTED',stage='apk_receipt_verified')
 return output
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('destination',type=Path);parser.add_argument('--result',required=True,type=Path);args=parser.parse_args()
 code=0
 try:build(args.destination.resolve())
 except Exception as error:
  STATE['result']='FAIL';STATE.update(failure_evidence(error));code=1
 finally:
  args.result.write_text(json.dumps(STATE,sort_keys=True)+'\n');print(json.dumps(STATE,sort_keys=True))
 raise SystemExit(code)
