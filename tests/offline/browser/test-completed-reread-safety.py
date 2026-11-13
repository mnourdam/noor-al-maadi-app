import importlib.util,tempfile,unittest,contextlib,io,json,subprocess,os,asyncio
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
 def test_cleanup_preserves_primary_but_not_sole_failure(self):
  async def close():raise RuntimeError('private cleanup detail')
  asyncio.run(lane.close_preserving_primary(close,True))
  with self.assertRaises(RuntimeError):asyncio.run(lane.close_preserving_primary(close,False))
 def test_sanitized_report(self):
  lane.stage('review-link')
  output=io.StringIO()
  def fail():raise AssertionError('SECRET account/path/url')
  with contextlib.redirect_stdout(output):code=lane.report(fail)
  result=json.loads(output.getvalue());self.assertEqual(code,1);self.assertEqual(result['stage'],'review-link');self.assertEqual(result['category'],'AssertionError');self.assertNotIn('SECRET',output.getvalue())
  with self.assertRaises(ValueError):lane.stage('untrusted private stage')
  self.assertEqual(lane.failure_result(type('PrivateException',(Exception,),{})())['category'],'OtherError')
 def test_workflow_preserves_failure_and_prints_json(self):
  workflow=(Path(__file__).resolve().parents[3]/'.github/workflows/v18-completed-reread-browser.yml').read_text()
  body=workflow.split('          status=0\n',1)[1].split('      - uses: actions/upload-artifact',1)[0]
  script='set -euo pipefail\nstatus=0\n'+'\n'.join(line[10:] for line in body.splitlines())
  self.assertIn("if: always() && hashFiles('completed-reread-result.json') != ''",workflow)
  with tempfile.TemporaryDirectory() as d:
   fake=Path(d)/'python';fake.write_text("#!/bin/sh\necho '{\"result\":\"FAIL\"}'\nexit 7\n");fake.chmod(0o700)
   result=subprocess.run(['bash','-c',script],cwd=d,env={**os.environ,'PATH':d+os.pathsep+os.environ['PATH']},capture_output=True,text=True)
   self.assertEqual(result.returncode,7);self.assertEqual(json.loads(result.stdout),{'result':'FAIL'})
if __name__=='__main__':unittest.main()
