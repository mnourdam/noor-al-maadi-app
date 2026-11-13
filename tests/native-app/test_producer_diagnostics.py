"""Actual short local subprocess controls, never Gradle/SDK/device execution."""
import importlib.util,json,os,subprocess,sys,tempfile,unittest
from unittest.mock import patch
from pathlib import Path
s=importlib.util.spec_from_file_location('producer_diagnostics',Path(__file__).with_name('build-full-app.py'))
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Diagnostics(unittest.TestCase):
 def setUp(self):
  envpatch=patch.dict(os.environ,{'GITHUB_SHA':''});envpatch.start();self.addCleanup(envpatch.stop)
  m.STATE.clear();m.STATE.update(result='FAIL',stage='producer_preflight',release_ready=False)
 def test_actual_nonzero_command_preserves_exit_not_raw_secret(self):
  with tempfile.TemporaryDirectory() as td:
   with self.assertRaises(subprocess.CalledProcessError) as caught:
    m.run_command(['bash','-c','printf "Execution failed for task secret-path\\n"; printf "OutOfMemoryError secret-key\\n" >&2; exit 7'],Path(td),{'PATH':os.environ['PATH']},2)
  evidence=m.failure_evidence(caught.exception)
  self.assertEqual(m.STATE['stage'],'gradle_debug');self.assertEqual(evidence['category'],'command_exit');self.assertEqual(evidence['returncode'],7)
  self.assertTrue(evidence['gradle_indicators']['memory']);self.assertTrue(evidence['gradle_indicators']['task_failure'])
  self.assertFalse(evidence['gradle_indicators']['compilation'])
  self.assertNotIn('secret',json.dumps(evidence));self.assertEqual(set(evidence['gradle_indicators']),set(m.GRADLE_INDICATORS))
 def test_actual_timeout_distinct_and_nonzero_path(self):
  with tempfile.TemporaryDirectory() as td:
   with self.assertRaises(subprocess.TimeoutExpired) as caught:
    m.run_command([sys.executable,'-c','import time; time.sleep(2)'],Path(td),{},0.05)
  evidence=m.failure_evidence(caught.exception)
  self.assertEqual(evidence,{'category':'command_timeout'})
  # Gradle timeouts may contain bytes even with text=True, and no return code.
  m.STATE['stage']='gradle_debug'
  evidence=m.failure_evidence(subprocess.TimeoutExpired(['secret-command'],1200,output=b'UnknownHostException secret-url',stderr=b''))
  self.assertTrue(evidence['gradle_indicators']['network_resolution']);self.assertNotIn('returncode',evidence)
  self.assertNotIn('secret',json.dumps(evidence))
 def test_success_return_and_unchanged_timeout(self):
  with tempfile.TemporaryDirectory() as td:
   result=m.run_command([sys.executable,'-c','print("control")'],Path(td),{},2)
  self.assertEqual(result,'control\n')
  source=Path(__file__).with_name('build-full-app.py').read_text()
  self.assertIn("run(['bash','android/gradlew','-p','android','--no-daemon','assembleDebug'],timeout=1200)",source)
 def test_categories_bounds_and_no_raw_values(self):
  for error,expected in [(ValueError('secret'),'configuration_or_validation'),(OSError('secret'),'operating_system_error'),(RuntimeError('secret'),'unexpected_exception')]:
   self.assertEqual(m.failure_evidence(error),{'category':expected})
  for code,expected in [(1,1),(-9,-9),(999999,None)]:
   self.assertEqual(m.failure_evidence(subprocess.CalledProcessError(code,['secret'])),{'category':'command_exit','returncode':expected})
 def test_only_valid_ci_source_identity_retained(self):
  for value in ('a'*40,'secret-value','A'*40,'a'*41):
   with patch.dict(os.environ,{'GITHUB_SHA':value}):
    evidence=m.failure_evidence(ValueError('secret'))
   self.assertEqual(evidence.get('source_sha'),'a'*40 if value=='a'*40 else None)
 def test_allowlist_and_bounded_scan(self):
  result=m.gradle_indicators('secret '+('x'*140000)+' compilation failed','')
  self.assertTrue(result['compilation']);self.assertFalse(result['memory'])
  self.assertFalse(any(m.gradle_indicators('arbitrary secret exception','').values()))
  middle='x'*70000+'OutOfMemoryError'+'x'*70000
  self.assertFalse(m.gradle_indicators(middle)['memory'])
if __name__=='__main__':unittest.main()
