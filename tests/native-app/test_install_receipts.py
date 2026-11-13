import importlib.util,unittest,subprocess,hashlib,json
from pathlib import Path
from unittest.mock import Mock,patch
s=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('runner.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def device(self):return Mock(sdk=Path('/sdk'),serial='emulator-5580')
 def test_budget_exact_gate(self):
  self.assertEqual(m.BOOT_SECONDS,600)
  source=Path(m.__file__).read_text();self.assertIn("if value=='1':return",source)
 def test_success_single_install_and_hash(self):
  d=self.device();d.adb.side_effect=['package:android','','package:/data/app/test/base.apk'];r={}
  with patch.object(m,'installed_digest',return_value=hashlib.sha256(b'apk').hexdigest()):m.install_once(d,'apk',hashlib.sha256(b'apk').hexdigest(),r)
  self.assertEqual(r,{'stage':'verified','install_issued':True,'verified':True});self.assertEqual(sum(c.args[0]=='install' for c in d.adb.call_args_list),1)
 def test_present_and_unknown_never_install(self):
  for listing in ['', 'invalid', 'package:'+m.PACKAGE]:
   d=self.device();d.adb.return_value=listing;r={}
   with self.assertRaises(m.Failure):m.install_once(d,'apk','a'*64,r)
   self.assertFalse(r['install_issued']);self.assertNotIn('reconciliation',r);self.assertEqual(d.adb.call_count,1)
 def test_install_timeout_matching_reconcile_still_raises(self):
  d=self.device();d.adb.side_effect=['package:android',subprocess.TimeoutExpired('private',120),'package:'+m.PACKAGE,'package:/data/app/test/base.apk'];r={}
  with patch.object(m,'installed_digest',return_value=hashlib.sha256(b'apk').hexdigest()):
   with self.assertRaises(subprocess.TimeoutExpired):m.install_once(d,'apk',hashlib.sha256(b'apk').hexdigest(),r)
  self.assertEqual(r['stage'],'install_command');self.assertFalse(r['verified']);self.assertEqual(r['reconciliation']['status'],'exact_hash');self.assertEqual(sum(c.args[0]=='install' for c in d.adb.call_args_list),1);self.assertNotIn('private',json.dumps(r))
 def test_path_and_hash_timeouts_have_distinct_stages(self):
  for stage in ['pm_path','installed_hash']:
   d=self.device();r={};d.adb.side_effect=['package:android','',subprocess.TimeoutExpired('secret',15) if stage=='pm_path' else 'package:/data/app/test/base.apk','package:android']
   with patch.object(m,'installed_digest',side_effect=subprocess.TimeoutExpired('secret',30)):
    with self.assertRaises(subprocess.TimeoutExpired):m.install_once(d,'apk','a'*64,r)
   self.assertEqual(r['stage'],stage);self.assertEqual(r['reconciliation']['status'],'absent');self.assertFalse(r['verified'])
 def test_reconcile_unavailable_mismatch_and_invalid_path(self):
  for outputs,raw,status in [(['package:'+m.PACKAGE,'package:/data/app/x/base.apk'],b'wrong','hash_mismatch'),(['package:'+m.PACKAGE,'bad'],b'','present_unverified'),(['bad'],b'','unavailable')]:
   d=self.device();d.adb.side_effect=outputs
   with patch.object(m,'installed_digest',side_effect=m.Failure('installed_path') if outputs[-1]=='bad' else None,return_value=hashlib.sha256(raw).hexdigest()) as proc:result=m.reconcile_install(d,'a'*64)
   self.assertEqual(result['status'],status)
   if outputs==['bad']:proc.assert_not_called()
   self.assertFalse(any(c.args[0]=='install' for c in d.adb.call_args_list))
 def test_reconciliation_failure_cannot_replace_original(self):
  d=self.device();d.adb.side_effect=['package:android',subprocess.TimeoutExpired('private',120)];receipt={}
  with patch.object(m,'reconcile_install',side_effect=RuntimeError('secret')):
   with self.assertRaises(subprocess.TimeoutExpired):m.install_once(d,'apk','a'*64,receipt)
  self.assertEqual(receipt['failure_category'],'TimeoutExpired');self.assertEqual(receipt['reconciliation']['category'],'diagnostic_error')
 def test_expired_after_absence_never_dispatches_or_reconciles(self):
  d=self.device();d.adb.return_value='package:android';receipt={}
  with patch.object(m,'remaining',side_effect=[5,m.Failure('exploratory_deadline')]),patch.object(m,'reconcile_install') as reconcile:
   with self.assertRaises(m.Failure):m.install_once(d,'apk','a'*64,receipt,deadline=1)
   reconcile.assert_not_called()
  self.assertFalse(receipt['install_issued']);self.assertEqual(d.adb.call_count,1)
if __name__=='__main__':unittest.main()
