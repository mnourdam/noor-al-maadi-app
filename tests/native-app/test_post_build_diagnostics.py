"""Synthetic tiny ZIP/temporary-directory controls; no app build or device."""
import hashlib,importlib.util,json,tempfile,unittest,warnings,zipfile
from pathlib import Path
s=importlib.util.spec_from_file_location('post_build',Path(__file__).with_name('build-full-app.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class PostBuildDiagnostics(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.apk=self.root/'synthetic.apk'
  self.expected={'assets/public/index.html':hashlib.sha256(b'expected').hexdigest(),'assets/capacitor.config.json':hashlib.sha256(b'{}').hexdigest()}
 def write_zip(self,entries):
  with warnings.catch_warnings():
   warnings.simplefilter('ignore',UserWarning)
   with zipfile.ZipFile(self.apk,'w') as z:
    for name,data in entries:z.writestr(name,data)
 def assert_failure(self,reason,stage,call):
  with self.assertRaises(m.PostBuildValidation) as caught:call()
  evidence=m.failure_evidence(caught.exception)
  self.assertEqual(evidence['category'],'configuration_or_validation');self.assertEqual(evidence['validation_reason'],reason);self.assertEqual(m.STATE['stage'],stage)
  self.assertNotIn(str(self.root),json.dumps(evidence));self.assertNotIn('expected',json.dumps(evidence))
 def test_missing_output(self):
  self.assert_failure('apk_missing','apk_output_presence',lambda:m.verify_built_assets(self.apk,self.expected))
 def test_invalid_zip(self):
  self.apk.write_bytes(b'private invalid archive')
  self.assert_failure('apk_zip_invalid','apk_zip_open',lambda:m.verify_built_assets(self.apk,self.expected))
 def test_duplicate_membership(self):
  self.write_zip([('assets/public/index.html',b'expected')]*2)
  self.assert_failure('apk_asset_duplicates','apk_asset_membership',lambda:m.verify_built_assets(self.apk,self.expected))
 def test_missing_or_additional_member(self):
  for entries in [[('assets/public/index.html',b'expected')],[('assets/public/index.html',b'expected'),('assets/capacitor.config.json',b'{}'),('assets/public/secret-name',b'private')]]:
   self.write_zip(entries);self.assert_failure('apk_asset_membership','apk_asset_membership',lambda:m.verify_built_assets(self.apk,self.expected))
 def test_fixed_missing_manifest_diagnostic_does_not_relax_equality(self):
  self.write_zip([('assets/public/index.html',b'expected'),('assets/capacitor.config.json',b'{}')])
  expected={**self.expected,'assets/public/.vite/manifest.json':hashlib.sha256(b'{}').hexdigest()}
  self.assert_failure('apk_asset_membership','apk_asset_membership',lambda:m.verify_built_assets(self.apk,expected))
  self.assertEqual(m.STATE['asset_membership_diagnostics'],{'expected_count':3,'actual_count':2,'missing_count':1,'unexpected_count':0,'missing_vite_manifest':True})
  m.verify_built_assets(self.apk,self.expected);self.assertNotIn('asset_membership_diagnostics',m.STATE)
 def test_hash_mismatch(self):
  self.write_zip([('assets/public/index.html',b'private mismatch'),('assets/capacitor.config.json',b'{}')])
  self.assert_failure('apk_asset_hash','apk_asset_hashes',lambda:m.verify_built_assets(self.apk,self.expected))
 def test_success_and_unrelated_native_members(self):
  self.write_zip([('assets/public/index.html',b'expected'),('assets/capacitor.config.json',b'{}'),('classes.dex',b'synthetic')])
  m.verify_built_assets(self.apk,self.expected);self.assertEqual(m.STATE['stage'],'apk_asset_hashes')
 def test_pinned_tools_absent_then_present(self):
  self.assert_failure('pinned_build_tools_missing','pinned_build_tools_presence',lambda:m.require_build_tools(self.root))
  tools=self.root/'build-tools/35.0.0';tools.mkdir(parents=True)
  self.assertEqual(m.require_build_tools(self.root),tools)
 def test_reason_allowlist(self):
  with self.assertRaises(ValueError):m.PostBuildValidation('secret arbitrary reason')
if __name__=='__main__':unittest.main()
