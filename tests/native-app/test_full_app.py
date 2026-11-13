import importlib.util,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
s=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-full-app.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class FullAppBoundary(unittest.TestCase):
 def test_copy_exclusions(self):
  names=['.env','.env.local','google-services.json','build','node_modules','release.keystore','local.properties','MainActivity.java','src']
  excluded=m.ignored('.',names)
  for name in names[:-2]:self.assertIn(name,excluded)
  self.assertNotIn('MainActivity.java',excluded);self.assertNotIn('src',excluded)
 def test_symlink_escape_rejected(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);(root/'escape').symlink_to('/tmp',target_is_directory=True)
   with self.assertRaisesRegex(ValueError,'symlink'):m.reject_symlinks(root)
 def test_native_overlay(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);app=root/'android/app';(app/'src/main').mkdir(parents=True)
   (app/'build.gradle').write_text('namespace="app.lovable.irth"\napplicationId "app.lovable.irth"')
   (app/'src/main/AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application android:name=".IrthApp"><activity android:name=".MainActivity"><intent-filter><data android:scheme="app.lovable.irth"/></intent-filter></activity><provider android:authorities="${applicationId}.fileprovider"/></application></manifest>')
   m.native_config(root);tree=ET.parse(app/'src/main/AndroidManifest.xml');top=tree.getroot();application=top.find('application')
   self.assertEqual(top.find('uses-permission').get(m.T+'node'),'remove')
   self.assertEqual(application.get(m.A+'name'),'app.lovable.irth.IrthApp')
   self.assertEqual(application.find('activity').get(m.A+'name'),'app.lovable.irth.MainActivity')
   self.assertEqual(application.find('activity/intent-filter/data').get(m.A+'scheme'),m.APP_ID)
   self.assertEqual(len(application.findall('meta-data')),3)
   self.assertTrue(all(n.get(m.A+'value')=='false' for n in application.findall('meta-data')))
   self.assertIn(m.APP_ID,(app/'build.gradle').read_text())
 def test_source_contract(self):
  source=Path(__file__).with_name('prepare-full-app.py').read_text()
  self.assertIn('envDir:false',source);self.assertIn('src/android-client.tsx',source)
  self.assertNotIn("'snapshot:generate'",source);self.assertNotIn('shutil.copytree(ROOT,destination',source)
  self.assertIn('PENDING; mandatory before install',source)
class BuildEnvironment(unittest.TestCase):
 def test_producer_failure_retains_json_and_nonzero(self):
  import subprocess,sys,json
  with tempfile.TemporaryDirectory() as td:
   result=Path(td)/'result.json'
   completed=subprocess.run([sys.executable,str(Path(__file__).with_name('build-full-app.py')),str(Path(td)/'fresh'),'--result',str(result)],env={'PATH':m.os.environ.get('PATH','')},capture_output=True,text=True)
   self.assertNotEqual(completed.returncode,0)
   data=json.loads(result.read_text());self.assertEqual(data,{'result':'FAIL','stage':'producer_preflight','release_ready':False,'category':'producer_stage_failed'})
   self.assertFalse((Path(td)/'fresh').exists())
 def test_workflow_never_accepts_licenses(self):
  workflow=(Path(__file__).resolve().parents[2]/'.github/workflows/v18-android-full-app.yml').read_text()
  self.assertIn('accept-android-sdk-licenses: false',workflow);self.assertIn("packages: ''",workflow)
  self.assertLess(workflow.index('test -f "$ANDROID_SDK_ROOT/licenses/android-sdk-license"'),workflow.index("sdkmanager 'platforms;android-36'"))
  self.assertIn('</dev/null',workflow);self.assertIn('if: always()',workflow)
 def test_final_manifest_semantics(self):
  spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-full-app.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
  text='E: manifest\n  E: application\n    A: android:debuggable(0x1)=(type 0x12)0xffffffff\n    E: activity\n      A: android:name(0x1)="app.lovable.irth.MainActivity"\n      E: intent-filter\n        E: data\n          A: android:scheme(0x1)="app.lovable.irth.acceptance"\n    E: provider\n      A: android:authorities(0x1)="app.lovable.irth.acceptance.fileprovider"\n'
  for name in ('firebase_messaging_auto_init_enabled','firebase_analytics_collection_enabled','firebase_data_collection_default_enabled'):
   text+='    E: meta-data\n      A: android:name(0x1)="'+name+'"\n      A: android:value(0x1)=(type 0x12)0x0\n'
  builder.verify_manifest(text)
  for old,new in [('0xffffffff','0x0'),('app.lovable.irth.MainActivity','other.Activity'),('acceptance.fileprovider','fileprovider'),('android:scheme(0x1)="app.lovable.irth.acceptance"','android:scheme(0x1)="app.lovable.irth"'),('(type 0x12)0x0\n','(type 0x12)0xffffffff\n')]:
   with self.assertRaises(ValueError):builder.verify_manifest(text.replace(old,new))
 def test_ambient_credentials_and_vite_env_not_inherited(self):
  from unittest.mock import patch
  spec=importlib.util.spec_from_file_location('builder',Path(__file__).with_name('build-full-app.py'));builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
  with patch.dict(m.os.environ,{'VITE_SUPABASE_URL':'https://real.invalid','SUPABASE_SERVICE_ROLE_KEY':'secret','AWS_SECRET_ACCESS_KEY':'secret','NODE_OPTIONS':'--require=evil','PATH':'/bin'},clear=True):
   env=builder.build_env(Path('/tmp/synthetic-home'),'a'*40)
  self.assertEqual(set(env),{'PATH','HOME','LANG','NODE_OPTIONS','GITHUB_SHA','ANDROID_BUILD_TYPE'})
  self.assertEqual(env['NODE_OPTIONS'],'--max-old-space-size=1536')

if __name__=='__main__':unittest.main()
