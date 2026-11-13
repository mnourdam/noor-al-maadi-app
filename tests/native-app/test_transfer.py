import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,Mock
spec=importlib.util.spec_from_file_location('transfer',Path(__file__).with_name('transfer.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def fixture(self,base):
  apk=base/'source.apk';apk.write_bytes(b'synthetic APK');receipt=base/'source.json';receipt.write_text(json.dumps({'source_sha':'a'*40,'application_id':'app.lovable.irth.acceptance','signer_sha256':'b'*64,'apk_sha256':m.digest(apk),'assets_sha256':{}}));return apk,receipt
 def test_roundtrip_exact_twofiles(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();apk,receipt=self.fixture(base);out=m.stage(apk,receipt,base/'staged','a'*40)
   self.assertEqual(set(p.name for p in (base/'staged').iterdir()),m.NAMES);self.assertEqual(m.verify(base/'staged','a'*40,out['apk_sha256'],out['receipt_sha256']),out)
 def test_modified_either_file_and_wrong_source_rejected(self):
  for field in ['acceptance.apk','apk-receipt.json','source']:
   with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp).resolve();apk,receipt=self.fixture(base);root=base/'staged';out=m.stage(apk,receipt,root,'a'*40)
    if field!='source':(root/field).write_bytes((root/field).read_bytes()+b' ')
    with self.assertRaises(ValueError):m.verify(root,'c'*40 if field=='source' else 'a'*40,out['apk_sha256'],out['receipt_sha256'])
 def test_extra_file_directory_and_symlink_rejected(self):
  for kind in ['file','directory','symlink']:
   with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp).resolve();apk,receipt=self.fixture(base);root=base/'staged';out=m.stage(apk,receipt,root,'a'*40)
    if kind=='file':(root/'secret.key').write_text('not uploaded')
    elif kind=='directory':(root/'extra').mkdir()
    else:(root/'acceptance.apk').unlink();(root/'acceptance.apk').symlink_to(apk)
    with self.assertRaises(ValueError):m.verify(root,'a'*40,out['apk_sha256'],out['receipt_sha256'])
 def test_existing_staging_and_symlink_source_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();apk,receipt=self.fixture(base);root=base/'staged';root.mkdir()
   with self.assertRaises(ValueError):m.stage(apk,receipt,root,'a'*40)
   link=base/'link.apk';link.symlink_to(apk)
   with self.assertRaises(ValueError):m.stage(link,receipt,base/'new','a'*40)
 def test_expected_hash_format_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();apk,receipt=self.fixture(base);root=base/'staged';out=m.stage(apk,receipt,root,'a'*40)
   for bad in ['','a'*63,'z'*64,'a'*64+'\nextra']:
    with self.assertRaises(ValueError):m.verify(root,'a'*40,bad,out['receipt_sha256'])
 def test_manifest_import_does_not_run_builder_and_rejects_invalid(self):
  import subprocess
  with patch.object(subprocess,'run',return_value=Mock(stdout='E: manifest')) as call:
   with self.assertRaises(Exception):m.manifest(Path('/synthetic'),Path('/sdk'))
   self.assertEqual(call.call_count,1);self.assertEqual(call.call_args.args[0][1:3],['dump','xmltree'])
 def test_device_job_has_no_build_and_hashes_not_from_artifact(self):
  text=(Path(__file__).resolve().parents[2]/'.github/workflows/v18-android-full-app.yml').read_text();device=text.split('  device:',1)[1]
  for forbidden in ['npm','gradle','setup-node','build-full-app.py','acceptance-debug.keystore']:self.assertNotIn(forbidden,device)
  for required in ['needs: build','artifact-ids: ${{ needs.build.outputs.artifact_id }}','${{ needs.build.outputs.apk_sha256 }}','${{ needs.build.outputs.receipt_sha256 }}','actions: read','ref: ${{ github.sha }}']:self.assertIn(required,device)
 def test_noncanonical_alias_stays_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   base=Path(tmp).resolve();apk,receipt=self.fixture(base);root=base/'staged';out=m.stage(apk,receipt,root,'a'*40)
   alias=base/'alias';alias.symlink_to(root,target_is_directory=True)
   with self.assertRaises(ValueError):m.verify(alias,'a'*40,out['apk_sha256'],out['receipt_sha256'])
if __name__=='__main__':unittest.main()
