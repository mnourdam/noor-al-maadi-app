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
if __name__=='__main__':unittest.main()
