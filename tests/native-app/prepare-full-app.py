"""Prepare fresh full-app Android fixture; no generator, server, install or emulator."""
import argparse,gzip,hashlib,json,os,re,shutil,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
APP_ID='app.lovable.irth.acceptance'
ORIGIN='https://irth-fixture.invalid'
A='{http://schemas.android.com/apk/res/android}'
T='{http://schemas.android.com/tools}'

def require(ok,message):
 if not ok:raise ValueError(message)
def ignored(directory,names):
 return [n for n in names if n in ('node_modules','.git','.gradle','build','dist','google-services.json','local.properties','.kotlin') or n.startswith('.env') or n.endswith(('.jks','.keystore'))]
def reject_symlinks(root):
 require(not root.is_symlink(),'source root symlink forbidden')
 for item in root.rglob('*'):
  require(not item.is_symlink(),'source tree symlink forbidden')
def native_config(root):
 manifest=root/'android/app/src/main/AndroidManifest.xml'
 ET.register_namespace('android','http://schemas.android.com/apk/res/android');ET.register_namespace('tools','http://schemas.android.com/tools')
 tree=ET.parse(manifest);top=tree.getroot();app=top.find('application');require(app is not None,'missing application')
 app.set(A+'name','app.lovable.irth.IrthApp');app.set(A+'usesCleartextTraffic','false')
 for node in app.findall('activity'):
  if node.get(A+'name')=='.MainActivity':node.set(A+'name','app.lovable.irth.MainActivity')
  for data in node.findall('intent-filter/data'):
   if data.get(A+'scheme')=='app.lovable.irth':data.set(A+'scheme',APP_ID)
 for node in list(top.findall('uses-permission')):
  if node.get(A+'name')=='android.permission.INTERNET':top.remove(node)
 ET.SubElement(top,'uses-permission',{A+'name':'android.permission.INTERNET',T+'node':'remove'})
 for key in ('firebase_messaging_auto_init_enabled','firebase_analytics_collection_enabled','firebase_data_collection_default_enabled'):
  ET.SubElement(app,'meta-data',{A+'name':key,A+'value':'false',T+'replace':'android:value'})
 tree.write(manifest,encoding='unicode',xml_declaration=True)
 gradle=root/'android/app/build.gradle';text=gradle.read_text();require(text.count('applicationId "app.lovable.irth"')==1,'unexpected app ID source')
 gradle.write_text(text.replace('applicationId "app.lovable.irth"',f'applicationId "{APP_ID}"'))

def prepare(destination):
 require(not destination.exists(),'destination must be fresh')
 require(destination.parent.is_dir() and not destination.parent.is_symlink(),'invalid destination parent')
 destination.mkdir(mode=0o700)
 # Copy source as data, preserving complete real router/provider/module graph.
 for name in ('src','public','android','android-web'):
  reject_symlinks(ROOT/name)
  shutil.copytree(ROOT/name,destination/name,ignore=ignored)
 for name in ('package.json','package-lock.json','vite.android.config.ts','capacitor.config.ts','tsconfig.json','tsconfig.app.json'):
  if (ROOT/name).exists():
   require(not (ROOT/name).is_symlink(),'source file symlink forbidden')
   shutil.copy2(ROOT/name,destination/name)
 snapshot=destination/'public/offline-snapshot.json'
 snapshot.write_bytes(gzip.decompress((destination/'public/offline-snapshot.json.gz').read_bytes()))
 data=json.loads(snapshot.read_text());require(isinstance(data.get('collection_manifest'),list),'snapshot manifest missing')
 # Exact synthetic RPC only; further startup dependencies must be explicitly reviewed.
 cfg={'origin':ORIGIN,'assets':['/'+str(f.relative_to(destination/'public')) for f in (destination/'public').rglob('*') if f.is_file()], 'responses':[{'method':'POST','path':'/rest/v1/rpc/get_content_manifest','query':'','body':'{}','status':200,'json':[{'collection':row['key'],'total_count':row['count'],'last_updated':data['generated_at']} for row in data['collection_manifest']]}]}
 transport=(ROOT/'tests/native-app/transport.js').read_text()
 (destination/'public/native-fixture.js').write_text('window.__IRTH_NATIVE_FIXTURE__='+json.dumps(cfg,separators=(',',':'))+';\n'+transport)
 html=destination/'android-web/index.html';s=html.read_text();needle='<script type="module" src="../src/android-client.tsx"></script>'
 require(s.count(needle)==1,'actual entry changed')
 (destination/'android-web/fixture-loader.mjs').write_bytes((ROOT/'tests/native-app/loader.mjs').read_bytes())
 html.write_text(s.replace(needle,'<script src="./native-fixture.js"></script>\n<script type="module">import {startActualApp} from "./fixture-loader.mjs"; await startActualApp(()=>import("../src/android-client.tsx"));</script>'))
 native_config(destination)
 cap=destination/'capacitor.config.ts';s=cap.read_text();require('appId: "app.lovable.irth"' in s,'unexpected Capacitor ID');cap.write_text(s.replace('appId: "app.lovable.irth"',f'appId: "{APP_ID}"'))
 # envDir:false prevents all dotenv loading; explicit define wins over ambient VITE values.
 defines={'import.meta.env.VITE_SUPABASE_URL':json.dumps(ORIGIN),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':json.dumps('synthetic-offline-key'),'import.meta.env.VITE_PUBLIC_APP_ORIGIN':json.dumps(ORIGIN),'import.meta.env.VITE_FEEDBACK_IMAGES_ENABLED':json.dumps('false')}
 (destination/'vite.acceptance.config.ts').write_text("import actual from './vite.android.config';\nimport {mergeConfig} from 'vite';\nexport default mergeConfig(actual,{envDir:false,define:"+json.dumps(defines)+"});\n")
 receipt={'scope':'PREPARED ONLY; NOT BUILT OR ACCEPTED','application_id':APP_ID,'source_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'actual_modules':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ('src/android-client.tsx','src/router.tsx','src/routes/__root.tsx','src/lib/profile.tsx','src/lib/account.tsx','vite.android.config.ts','capacitor.config.ts') if (ROOT/f).exists()},'snapshot_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'live_generation':False,'packaged_apk_verification':'PENDING; mandatory before install','synthetic_boundaries':['exact fetch responses','remote transports rejected','external native intents/push rejected'],'unaccepted':['all six journeys','native lifecycle','verified staging auth/storage','secure image activation','full English authored content']}
 (destination/'fixture-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return receipt
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('destination',type=Path);args=parser.parse_args();prepare(args.destination.resolve())
