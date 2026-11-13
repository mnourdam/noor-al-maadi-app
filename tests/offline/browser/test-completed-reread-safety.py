import importlib.util,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('profile_lane',Path(__file__).with_name('completed-reread-browser.py'));lane=importlib.util.module_from_spec(spec);spec.loader.exec_module(lane)
class Safety(unittest.TestCase):
 def test_exact_origin_and_asset(self):
  origin='http://127.0.0.1:51234';paths={'/','/fixture.js','/assets/font.woff2'}
  for path in paths:self.assertTrue(lane.admitted(origin+path,origin,paths))
  for url in ['https://127.0.0.1:51234/','http://localhost:51234/','http://127.0.0.1:51235/','http://evil.test/','http://user@127.0.0.1:51234/','http://127.0.0.1:51234/.env','http://127.0.0.1:51234/fixture.js?x=1','http://127.0.0.1:51234/fixture.js#x','http://127.0.0.1:51234/assets/../.env']:
   self.assertFalse(lane.admitted(url,origin,paths))
 def test_asset_symlink_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'fixture.js').write_text('synthetic');self.assertIn('/fixture.js',lane.asset_paths(root));(root/'link').symlink_to(root/'fixture.js')
   with self.assertRaises(ValueError):lane.asset_paths(root)
if __name__=='__main__':unittest.main()
