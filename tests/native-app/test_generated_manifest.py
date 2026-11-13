"""Only synthetic disposable metadata files; no real build or device."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('generated_manifest',Path(__file__).with_name('build-full-app.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class GeneratedManifest(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name).resolve();self.folder=self.root/'dist/android/.vite';self.folder.mkdir(parents=True)
  self.target=self.folder/'manifest.json';self.data={'index.html':{'file':'assets/index-test.js','isEntry':True}}
  self.target.write_text(json.dumps(self.data))
 def test_only_exact_metadata_removed(self):
  siblings=[self.folder/'another.json',self.folder.parent/'manifest.json',self.folder.parent/'index.html',self.folder.parent/'offline-snapshot.json']
  for file in siblings:file.write_bytes(b'preserved')
  m.remove_generated_vite_manifest(self.root)
  self.assertFalse(self.target.exists());self.assertTrue(self.folder.is_dir())
  self.assertTrue(all(file.read_bytes()==b'preserved' for file in siblings))
 def test_missing_metadata_fails_closed(self):
  self.target.unlink()
  with self.assertRaises(ValueError):m.remove_generated_vite_manifest(self.root)
 def test_file_symlink_not_followed_or_removed(self):
  self.target.unlink();outside=self.root/'outside';outside.write_text(json.dumps(self.data));self.target.symlink_to(outside)
  with self.assertRaises(ValueError):m.remove_generated_vite_manifest(self.root)
  self.assertTrue(self.target.is_symlink());self.assertTrue(outside.exists())
 def test_parent_symlink_rejected(self):
  self.target.unlink();self.folder.rmdir();outside=self.root/'outside';outside.mkdir();(outside/'manifest.json').write_text(json.dumps(self.data));self.folder.symlink_to(outside,target_is_directory=True)
  with self.assertRaises(ValueError):m.remove_generated_vite_manifest(self.root)
  self.assertTrue((outside/'manifest.json').exists())
 def test_noncanonical_root_rejected(self):
  alias=self.root/'alias';alias.symlink_to(self.root,target_is_directory=True)
  with self.assertRaises(ValueError):m.remove_generated_vite_manifest(alias)
  self.assertTrue(self.target.exists())
 def test_directory_and_malformed_metadata_rejected(self):
  for value in ('not json','[]','{}','{"entry":{}}'):
   self.target.write_text(value)
   with self.assertRaises(ValueError):m.remove_generated_vite_manifest(self.root)
   self.assertTrue(self.target.exists())
  self.target.unlink();self.target.mkdir()
  with self.assertRaises(ValueError):m.remove_generated_vite_manifest(self.root)
 def test_removal_order_and_strict_verification_remain(self):
  source=Path(__file__).with_name('build-full-app.py').read_text()
  self.assertLess(source.index("run(['node','scripts/finalize-android.mjs'])"),source.index('\n remove_generated_vite_manifest(root)'))
  self.assertLess(source.index('\n remove_generated_vite_manifest(root)'),source.index("'sync','android'"))
  self.assertLess(source.index("'sync','android'"),source.index("asset_root=root/"))
  self.assertIn('verify_built_assets(apk,assets)',source)
if __name__=='__main__':unittest.main()
