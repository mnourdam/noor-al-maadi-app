import importlib.util, pathlib, tempfile, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('producer',pathlib.Path(__file__).resolve().parents[1]/'native-app/build-full-app.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class BranchGuard(unittest.TestCase):
 def setUp(self):self.original=b.p.ROOT
 def tearDown(self):b.p.ROOT=self.original
 def test_wrong_source_sha(self):
  with tempfile.TemporaryDirectory() as d, patch.object(b.subprocess,'check_output',return_value='0'*40):
   with self.assertRaises(ValueError):b.bind_pair_source(pathlib.Path(d))
 def test_dirty_source(self):
  with tempfile.TemporaryDirectory() as d, patch.object(b.subprocess,'check_output',side_effect=[b.PAIR_SOURCE,' M src/a.ts']):
   with self.assertRaises(ValueError):b.bind_pair_source(pathlib.Path(d))
 def test_correct_pin_binds_only_source(self):
  with tempfile.TemporaryDirectory() as d, patch.object(b.subprocess,'check_output',side_effect=[b.PAIR_SOURCE,'']):
   b.bind_pair_source(pathlib.Path(d));self.assertEqual(b.p.ROOT,pathlib.Path(d))
 def test_arbitrary_branch_rejected_before_prepare(self):
  with patch.dict(b.os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/arbitrary'}),patch.object(b.p,'prepare') as prepare:
   with self.assertRaises(ValueError):b.build(pathlib.Path('/tmp/no-build'))
   prepare.assert_not_called()
 def test_pair_branch_release_rejected(self):
  with patch.dict(b.os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':b.PAIR_BRANCH}),patch.object(b.p,'prepare') as prepare:
   with self.assertRaises(ValueError):b.build(pathlib.Path('/tmp/no-build'),'release_config')
   prepare.assert_not_called()
 def test_preparation_branch_cannot_rebind(self):
  with patch.dict(b.os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/v18-01a-outbox-recovery'}),patch.object(b.p,'prepare') as prepare:
   with self.assertRaises(ValueError):b.build(pathlib.Path('/tmp/no-build'),source_root=pathlib.Path('/tmp'))
   prepare.assert_not_called()
if __name__=='__main__':unittest.main()
