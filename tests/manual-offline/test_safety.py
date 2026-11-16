import importlib.util, pathlib, unittest, tempfile, xml.etree.ElementTree as ET
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('manual_prepare','prepare.py');b=load('manual_build','build.py')
class Safety(unittest.TestCase):
 def test_secret_copy_exclusions(self):
  names=['.env','.env.local','google-services.json','release.keystore','release.jks','local.properties']
  self.assertEqual(p.ignored('.',names),names)
 def test_no_synthetic_transport_or_loader(self):
  source=(ROOT/'prepare.py').read_text()
  self.assertNotIn('responses=',source);self.assertNotIn('startActualApp',source);self.assertNotIn('fixture-loader.mjs',source)
  self.assertIn('envDir:false',source);self.assertNotIn('snapshot:generate',source)
 def test_wrong_branch_blocks_without_preparing(self):
  for branch in ['refs/heads/main','refs/heads/v18-01a-outbox-recovery','refs/heads/v18-home-pair-56bd4402']:
   with patch.dict(b.os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':branch}),patch.object(b.p,'prepare') as prepare:
    with self.assertRaises(ValueError):b.build(pathlib.Path('/tmp/never-build'))
    prepare.assert_not_called()
 def test_ambient_secret_not_in_build_environment(self):
  with patch.dict(b.os.environ,{'PATH':'/bin','VITE_SUPABASE_URL':'real','SUPABASE_SERVICE_ROLE_KEY':'secret'},clear=True):
   env=b.build_env(pathlib.Path('/tmp/x'),'a'*40)
   self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY',env);self.assertNotIn('VITE_SUPABASE_URL',env)
 def test_native_overlay_denies_network_backup_and_external_intents(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);app=root/'android/app';main=app/'src/main';(main/'res/xml').mkdir(parents=True);(main/'java/app/lovable/irth').mkdir(parents=True)
   (app/'build.gradle').write_text('applicationId "app.lovable.irth"')
   (main/'java/app/lovable/irth/MainActivity.java').write_text('public class MainActivity extends BridgeActivity {}')
   (main/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-permission android:name="android.permission.INTERNET"/><application><activity android:name=".MainActivity"><intent-filter><data android:scheme="app.lovable.irth"/></intent-filter></activity></application></manifest>')
   p.native_config(root);t=ET.parse(main/'AndroidManifest.xml').getroot();a=t.find('application')
   self.assertEqual(a.get(p.A+'label'),p.LABEL);self.assertEqual(a.get(p.A+'allowBackup'),'false');self.assertEqual(a.get(p.A+'fullBackupContent'),'false')
   self.assertEqual(t.find('uses-permission').get(p.T+'node'),'remove');self.assertEqual(a.find('activity/intent-filter/data').get(p.A+'scheme'),p.APP_ID)
   self.assertEqual(len(ET.parse(main/'res/xml/manual_offline_extraction_rules.xml').findall('.//exclude')),18)
   native=(main/'java/app/lovable/irth/MainActivity.java').read_text();self.assertEqual(native.count('throw new android.content.ActivityNotFoundException'),4)
 def test_shared_user_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);main=root/'android/app/src/main';main.mkdir(parents=True)
   (main/'AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:sharedUserId="shared"><application/></manifest>')
   with self.assertRaises(ValueError):p.native_config(root)
 def test_latest_pin_package_and_workflow_scope(self):
  self.assertEqual(p.APP_ID,'app.lovable.irth.manualoffline20261116')
  self.assertEqual(p.LABEL,'إرث — اختبار 16 نوفمبر بلا إنترنت')
  workflow=(ROOT.parents[1]/'.github/workflows/v18-manual-offline.yml').read_text()
  self.assertIn('branches: [v18-manual-offline-6f2124d5]',workflow)
  self.assertIn("paths: ['.github/workflows/v18-manual-offline.yml']",workflow)
  self.assertIn("github.ref == 'refs/heads/v18-manual-offline-6f2124d5' && github.event_name == 'push'",workflow)
  self.assertEqual(workflow.count('6f2124d535cddc4b9cf7a1f77aa06b51b8e774da'),2)
  self.assertIn('accept-android-sdk-licenses: false',workflow)
  self.assertIn('contents: read',workflow)
  self.assertIn('npm ci --ignore-scripts',workflow)
  self.assertNotIn('workflow_dispatch',workflow)
  self.assertNotIn('pull_request',workflow)
  self.assertIn("=='6f2124d535cddc4b9cf7a1f77aa06b51b8e774da'",(ROOT/'build.py').read_text())
 def test_previous_manual_branch_cannot_build_new_package(self):
  with patch.dict(b.os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/v18-manual-offline-56bd4402'}),patch.object(b.p,'prepare') as prepare:
   with self.assertRaises(ValueError):b.build(pathlib.Path('/tmp/never-build'))
   prepare.assert_not_called()
 def test_actual_native_source_is_compatible_without_touching_source(self):
  import shutil,hashlib
  source=ROOT.parents[1]/'android'
  before={str(f.relative_to(source)):hashlib.sha256(f.read_bytes()).hexdigest() for f in source.rglob('*') if f.is_file()}
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);shutil.copytree(source,root/'android');p.native_config(root)
   manifest=ET.parse(root/'android/app/src/main/AndroidManifest.xml').getroot()
   self.assertEqual(manifest.find('application').get(p.A+'label'),p.LABEL)
   self.assertIn('applicationId "'+p.APP_ID+'"',(root/'android/app/build.gradle').read_text())
   native=(root/'android/app/src/main/java/app/lovable/irth/MainActivity.java').read_text()
   self.assertEqual(native.count('throw new android.content.ActivityNotFoundException'),4)
  after={str(f.relative_to(source)):hashlib.sha256(f.read_bytes()).hexdigest() for f in source.rglob('*') if f.is_file()}
  self.assertEqual(before,after)
if __name__=='__main__':unittest.main()
