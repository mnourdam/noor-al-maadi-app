"""Prepare isolated real offline app copy; no fixtures, live generation, install or emulator."""
import argparse,gzip,hashlib,json,os,re,shutil,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
APP_ID='app.lovable.irth.manualoffline20261116'
LABEL='إرث — اختبار 16 نوفمبر بلا إنترنت'
ORIGIN='https://irth-manual-offline.invalid'
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
 require(A+'sharedUserId' not in top.attrib,'shared user forbidden')
 app.set(A+'name','app.lovable.irth.IrthApp');app.set(A+'usesCleartextTraffic','false')
 app.set(A+'label',LABEL);app.set(A+'allowBackup','false');app.set(A+'fullBackupContent','false')
 app.set(A+'dataExtractionRules','@xml/manual_offline_extraction_rules')
 for node in app.findall('activity'):
  if node.get(A+'name')=='.MainActivity':node.set(A+'name','app.lovable.irth.MainActivity');node.set(A+'label',LABEL)
  for data in node.findall('intent-filter/data'):
   if data.get(A+'scheme')=='app.lovable.irth':data.set(A+'scheme',APP_ID)
 for node in list(top.findall('uses-permission')):
  if node.get(A+'name')=='android.permission.INTERNET':top.remove(node)
 ET.SubElement(top,'uses-permission',{A+'name':'android.permission.INTERNET',T+'node':'remove'})
 for key in ('firebase_messaging_auto_init_enabled','firebase_analytics_collection_enabled','firebase_data_collection_default_enabled'):
  ET.SubElement(app,'meta-data',{A+'name':key,A+'value':'false',T+'replace':'android:value'})
 tree.write(manifest,encoding='unicode',xml_declaration=True)
 # Full backup/device-transfer exclusion, including device-protected and external app data.
 rules=ET.Element('data-extraction-rules')
 for kind in ('cloud-backup','device-transfer'):
  section=ET.SubElement(rules,kind)
  for domain in ('root','file','database','sharedpref','external','device_root','device_file','device_database','device_sharedpref'):
   ET.SubElement(section,'exclude',{'domain':domain,'path':'.'})
 ET.ElementTree(rules).write(root/'android/app/src/main/res/xml/manual_offline_extraction_rules.xml',encoding='unicode')
 # External activities are rejected, not simulated as successful operations.
 main=root/'android/app/src/main/java/app/lovable/irth/MainActivity.java'
 text=main.read_text();marker='public class MainActivity extends BridgeActivity {'
 require(text.count(marker)==1,'native entry changed')
 methods="""
  // MANUAL OFFLINE TEST ONLY: do not launch browsers, shares or account intents.
  @Override public void startActivity(android.content.Intent intent) { throw new android.content.ActivityNotFoundException("Disabled in offline test"); }
  @Override public void startActivity(android.content.Intent intent, android.os.Bundle options) { throw new android.content.ActivityNotFoundException("Disabled in offline test"); }
  @Override public void startActivityForResult(android.content.Intent intent, int requestCode) { throw new android.content.ActivityNotFoundException("Disabled in offline test"); }
  @Override public void startActivityForResult(android.content.Intent intent, int requestCode, android.os.Bundle options) { throw new android.content.ActivityNotFoundException("Disabled in offline test"); }
"""
 main.write_text(text.replace(marker,marker+methods))

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
 # Keep the real HTML entry exactly: no fixture transport, loader, mocked RPC or progress.
 require((destination/'android-web/index.html').read_bytes()==(ROOT/'android-web/index.html').read_bytes(),'entry altered')
 require(not (destination/'public/native-fixture.js').exists(),'fixture forbidden')
 native_config(destination)
 cap=destination/'capacitor.config.ts';s=cap.read_text();require('appId: "app.lovable.irth"' in s,'unexpected Capacitor ID');s=s.replace('appId: "app.lovable.irth"',f'appId: "{APP_ID}"')
 s=s.replace('appName: "Irth"',f'appName: "{LABEL}"')
 for name in ('push-notifications','browser','local-notifications','share'):
  s=s.replace(f'"@capacitor/{name}", ','').replace(f', "@capacitor/{name}"','')
 cap.write_text(s)
 # envDir:false prevents all dotenv loading; explicit define wins over ambient VITE values.
 defines={'import.meta.env.VITE_SUPABASE_URL':json.dumps(ORIGIN),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':json.dumps('manual-offline-no-access'),'import.meta.env.VITE_PUBLIC_APP_ORIGIN':json.dumps(ORIGIN),'import.meta.env.VITE_FEEDBACK_IMAGES_ENABLED':json.dumps('false')}
 (destination/'vite.manual.config.ts').write_text("import actual from './vite.android.config';\nimport {mergeConfig} from 'vite';\nexport default mergeConfig(actual,{envDir:false,define:"+json.dumps(defines)+"});\n")
 receipt={'scope':'PREPARED ONLY; NOT BUILT OR ACCEPTED','application_id':APP_ID,'source_sha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'actual_modules':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ('src/android-client.tsx','src/router.tsx','src/routes/__root.tsx','src/lib/profile.tsx','src/lib/account.tsx','vite.android.config.ts','capacitor.config.ts') if (ROOT/f).exists()},'snapshot_sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest(),'live_generation':False,'packaged_apk_verification':'PENDING; mandatory before install','offline_boundaries':['NO INTERNET permission','inert backend configuration','external activities rejected','push/browser/share/local-notification plugins excluded'],'content_notice':'Packaged content from pinned source; no live regeneration or freshness verification performed in this build; no server progress/rewards/auth validated','unaccepted':['all six journeys','native lifecycle','verified staging auth/storage','secure image activation','full English authored content']}
 (destination/'manual-preparation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 return receipt
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('destination',type=Path);args=parser.parse_args();prepare(args.destination.resolve())
