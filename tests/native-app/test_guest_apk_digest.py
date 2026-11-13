import importlib.util,unittest,subprocess
from pathlib import Path
from unittest.mock import Mock,patch
s=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('runner.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_exact_guest_hash_command_and_output(self):
  for path in ['/data/app/test/base.apk','/data/app/~~A_b-12==/app.lovable.irth.acceptance-A_b==/base.apk']:
   for spaces in [' ','  ']:
    d=Mock();d.adb.return_value='A'*64+spaces+path
    self.assertEqual(m.installed_digest(d,'package:'+path),'a'*64)
    d.adb.assert_called_once_with('shell','/system/bin/toybox','sha256sum',path,timeout=30)
 def test_paths_are_shell_inert_and_segment_canonical(self):
  for tail in ['../x','./x','x/../y','x//y','x;y','x$(id)','x`id`','x y','x\ny','x\ty','x\\y','x&y','x|y','x>y','x<y','x\"y',"x'y",'x?y','x*y','x[y]','x/y/z','x/'+'a'*256]:
   d=Mock()
   with self.assertRaises(m.Failure):m.installed_digest(d,'package:/data/app/'+tail+'/base.apk')
   d.adb.assert_not_called()
 def test_exact_single_digest_filename_only(self):
  path='/data/app/test/base.apk';good='a'*64+'  '+path
  for bad in ['', 'a'*63+'  '+path,'g'*64+'  '+path,good+'\n'+good,'warning\n'+good,good+' extra','a'*64+'  /data/app/other/base.apk','a'*64+'\t'+path,'a'*64+'   '+path]:
   with self.assertRaises(m.Failure):m.installed_digest(Mock(adb=Mock(return_value=bad)),'package:'+path)
 def test_unavailable_or_timeout_fail_without_fallback(self):
  for error in [m.Failure('command_failed'),subprocess.TimeoutExpired('private',30)]:
   d=Mock();d.adb.side_effect=error
   with self.assertRaises(type(error)):m.installed_digest(d,'package:/data/app/test/base.apk')
   self.assertEqual(d.adb.call_count,1)
 def test_remaining_budget_and_expiry(self):
  d=Mock();d.adb.return_value='a'*64+' /data/app/test/base.apk'
  with patch.object(m.time,'monotonic',return_value=10):
   m.installed_digest(d,'package:/data/app/test/base.apk',12);self.assertEqual(d.adb.call_args.kwargs['timeout'],2)
   d.reset_mock()
   with self.assertRaises(m.Failure):m.installed_digest(d,'package:/data/app/test/base.apk',9)
   d.adb.assert_not_called()
 def test_mismatch_still_prevents_verified_install(self):
  d=Mock();d.adb.side_effect=['package:android','','package:/data/app/test/base.apk','b'*64+' /data/app/test/base.apk','package:android'];receipt={}
  with self.assertRaisesRegex(m.Failure,'installed_hash'):m.install_once(d,'apk','a'*64,receipt)
  self.assertFalse(receipt['verified']);self.assertEqual(receipt['stage'],'installed_hash');self.assertEqual(receipt['reconciliation']['status'],'absent')
if __name__=='__main__':unittest.main()
