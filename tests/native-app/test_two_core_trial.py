import sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).parent))
import runner as r
import visual_observation as v

class TwoCoreTests(unittest.TestCase):
 def test_strict_request(self):
  for value in [True,False,1,3,'2',2.0]:
   with self.assertRaises(r.Failure):r.Device(Path('/sdk'),Path('/avd'),guest_cores=value)
 def boot_args(self,cores):
  with tempfile.TemporaryDirectory() as tmp:
   device=r.Device(Path('/sdk'),Path(tmp)/'fresh',guest_cores=cores)
   with patch.object(r,'command',return_value='List of devices attached\n'),patch.object(r.subprocess,'Popen') as launch,patch.object(device.output,'start'),patch.object(device,'await_boot'),patch.dict(r.os.environ,{},clear=False):
    device.boot();return launch.call_args.args[0]
 def test_only_cpu_argv_change(self):
  default=self.boot_args(None);trial=self.boot_args(2)
  self.assertEqual(default,['/sdk/emulator/emulator','-avd','irth-full-acceptance','-port','5580','-accel','on','-no-window','-no-audio','-no-snapshot','-no-boot-anim','-gpu','swiftshader_indirect'])
  self.assertEqual(trial,default+['-cores','2']);self.assertEqual(r.BOOT_SECONDS,900)
 def test_online_parser(self):
  self.assertEqual(v.online_cpu_set(b'0-1\n'),{0,1});self.assertEqual(v.online_cpu_set(b'0,1'),{0,1})
  for raw in [b'',b'0,0',b'0-1,1',b'1-0',b'0;echo x',b'0-999',b'0\n1']:
   with self.assertRaises(ValueError):v.online_cpu_set(raw)
 def verify(self,core=2,online=b'0-1',state='complete',changes=None):
  device=SimpleNamespace(versions=dict(v.BASELINE_VERSIONS),root=Path('/owned'),sdk=Path('/sdk'),serial='emulator-5580')
  hardware={**v.BASELINE_HARDWARE,'hw.cpu.ncore':core,**(changes or {})};receipt={}
  with patch.object(v.probes,'avd_resources',return_value={'hardware-qemu.ini':hardware}),patch.object(v.probes,'capture',return_value={'state':state,'returncode':0,'raw':online}):
   v.verify_two_core_trial(device,receipt)
  return receipt
 def test_effective_positive(self):self.assertEqual(self.verify()['status'],'verified_two_core_comparison')
 def test_mismatch_and_unknown_block(self):
  for args in [{'core':1},{'core':3},{'online':b'0'},{'online':b'0-2'},{'state':'timeout'},{'state':'cleanup_failed'},{'changes':{'hw.ramSize':2048}}]:
   with self.subTest(args=args),self.assertRaises(ValueError):self.verify(**args)
 def test_actual_main_mismatch_prevents_install(self):
  with tempfile.TemporaryDirectory() as tmp:
   args=['visual','--apk','fake.apk','--receipt','fake.json','--evidence',str(Path(tmp)/'evidence')]
   device=Mock();device.boot_observations={};device.actions=[]
   with patch.object(sys,'argv',args),patch.dict(v.os.environ,{'ANDROID_HOME':'/sdk','RUNNER_TEMP':tmp}),patch.object(r,'require_ci'),patch.object(r,'Device',return_value=device) as constructor,patch.object(r,'verify_apk',return_value={'apk_sha256':'a'*64}),patch.object(v,'verify_two_core_trial',side_effect=ValueError()),patch.object(r,'install_once') as install,patch.object(v,'observe') as observe:
    self.assertEqual(v.main(),1);install.assert_not_called();observe.assert_not_called();device.launch.assert_not_called();device.close.assert_called_once();self.assertEqual(constructor.call_args.kwargs,{'guest_cores':2})
if __name__=='__main__':unittest.main()
