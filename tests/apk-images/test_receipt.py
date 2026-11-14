import importlib.util,unittest,tempfile,zipfile,hashlib,json,contextlib,io
from unittest.mock import patch
from pathlib import Path
s=importlib.util.spec_from_file_location('receipt',Path(__file__).with_name('build-receipt.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class ReceiptTests(unittest.TestCase):
 def exercise(self,mode):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);assets=root/'assets';assets.mkdir();apk=root/'app.apk';records=[];hashes={}
   with zipfile.ZipFile(apk,'w') as z:
    for i in range(3):
     path=f'chapters/c{i}/ch/interpretive-v1.webp';rel='campaign-key-art/'+path;name='assets/public/'+rel;b=f'synthetic-{i}'.encode();f=assets/rel;f.parent.mkdir(parents=True);f.write_bytes(b)
     sha=hashlib.sha256(b).hexdigest();records.append({'path':path,'bytes':len(b),'sha256':sha});hashes[name]=sha
     if mode=='missing' and i==0:continue
     z.writestr(name,b'wrong' if mode=='zip_mismatch' and i==0 else b)
     if mode=='duplicate' and i==0:z.writestr(name,b)
     if mode=='synced_mismatch' and i==0:f.write_bytes(b'wrong')
   producer={'assets_sha256':hashes,'apk_sha256':hashlib.sha256(apk.read_bytes()).hexdigest()}
   if mode=='producer_mismatch':producer['apk_sha256']='0'*64
   m.verify_bytes(apk,assets,records,producer)
 def test_failure_receipt_is_nonzero_sanitized(self):
  with tempfile.TemporaryDirectory() as d,patch.dict('os.environ',{'GITHUB_ACTIONS':'false','SENSITIVE_TEST':'never-emit-this'},clear=True),contextlib.redirect_stdout(io.StringIO()) as out:
   result=Path(d)/'result.json'
   self.assertEqual(m.main(Path(d)/'unused',result),1)
   evidence=json.loads(result.read_text());self.assertEqual(evidence['result'],'FAIL');self.assertFalse(evidence['device_executed'])
   self.assertNotIn('never-emit-this',out.getvalue());self.assertFalse((Path(d)/'unused').exists())
 def test_workflow_has_one_producer_and_json_only(self):
  text=(m.ROOT/'.github/workflows/v18-apk-image-packaging.yml').read_text()
  self.assertEqual(text.count('python tests/apk-images/build-receipt.py'),1)
  self.assertIn("if: github.ref == 'refs/heads/v18-01a-outbox-recovery'",text)
  self.assertIn('contents: read',text);self.assertIn('persist-credentials: false',text)
  self.assertEqual(text.count('uses: actions/upload-artifact@'),1)
  self.assertNotIn('needs:',text);self.assertNotIn('contents: write',text)
  self.assertIn('path: ${{ runner.temp }}/apk-image-result.json',text)
  for forbidden in ['assembleRelease','emulator','avdmanager','adb ', 'chmod ', 'accept-android-sdk-licenses: true']:
   self.assertNotIn(forbidden,text)
 def test_positive(self):self.exercise('good')
 def test_negative(self):
  for mode in ['missing','zip_mismatch','duplicate','synced_mismatch','producer_mismatch']:
   with self.subTest(mode=mode),self.assertRaises(ValueError):self.exercise(mode)
if __name__=='__main__':unittest.main()
