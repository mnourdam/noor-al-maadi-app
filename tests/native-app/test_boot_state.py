import importlib.util,tempfile,unittest,json
from pathlib import Path
from unittest.mock import patch,Mock
s=importlib.util.spec_from_file_location('bootstate',Path(__file__).with_name('guest_boot_diagnostics.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def row(text='',state='complete',code=0):return {'raw':text.encode(),'state':state,'returncode':code}
class BootState(unittest.TestCase):
 def test_booleans_false_missing_duplicate_truncated(self):
  self.assertEqual(m.parse_boot_fields(row('mBooting=false mBooted=true'),m.AMS_FIELDS),{'mBooting':'false','mBooted':'true','mCallFinishBooting':'unavailable','mBootAnimationComplete':'unavailable'})
  self.assertEqual(m.parse_boot_fields(row('mBooting=true mBooting=false'),m.AMS_FIELDS)['mBooting'],'ambiguous')
  for result in [row('mBooting=true','truncated'),row('mBooting=true',code=1),row('mBooting=secret')]:self.assertEqual(m.parse_boot_fields(result,m.AMS_FIELDS)['mBooting'],'unavailable')
 def test_home_and_setup_no_identity(self):
  self.assertEqual(m.parse_home(row('com.android.launcher/.Launcher')),'present')
  self.assertEqual(m.parse_home(row('No activity found')),'absent')
  for text in ['private path','pkg/.A\npkg/.B','']:self.assertEqual(m.parse_home(row(text)),'unavailable')
  self.assertEqual(m.parse_enum(row('null'),{'0','1'}),'empty');self.assertEqual(m.parse_enum(row('0'),{'0','1'}),'0');self.assertEqual(m.parse_enum(row('secret'),{'0','1'}),'unavailable')
 def test_memory_bounds_and_duplicates(self):
  self.assertEqual(m.parse_memory(row('MemTotal: 2048000 kB\nMemAvailable: 1234 kB')),{'MemTotal_kib':2048000,'MemAvailable_kib':1234})
  self.assertEqual(m.parse_memory(row('MemTotal: 1 kB\nMemTotal: 2 kB'))['MemTotal_kib'],'ambiguous')
  self.assertEqual(m.parse_memory(row('MemTotal: private'))['MemTotal_kib'],'unavailable')
 def test_resource_allowlist_and_symlinks(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td).resolve();folder=root/'irth-full-acceptance.avd';folder.mkdir();path=folder/'config.ini';path.write_text('hw.ramSize=2048\nhw.cpu.ncore=2\nvm.heapSize=256\nhw.lcd.width=1080\nsecret.path=private\nhw.lcd.height=1920\nhw.lcd.density=420\n')
   output=m.avd_resources(root);self.assertEqual(output['config.ini']['hw.ramSize'],2048);self.assertNotIn('private',json.dumps(output));self.assertEqual(output['hardware-qemu.ini']['hw.ramSize'],'unavailable')
   path.write_text('hw.ramSize=1\nhw.ramSize=2\nhw.cpu.ncore=999999');output=m.avd_resources(root);self.assertEqual(output['config.ini']['hw.ramSize'],'ambiguous');self.assertEqual(output['config.ini']['hw.cpu.ncore'],'unavailable')
   path.unlink();path.symlink_to(root/'outside');self.assertEqual(m.avd_resources(root)['config.ini']['hw.ramSize'],'unavailable')
 def test_event_numbers_fixed_tags_and_incomplete(self):
  result=m.parse_boot_events(row('I/boot_progress_ams_ready: 1234\nI/private_tag: 7\nI/wm_boot_animation_done: 2000'))
  self.assertEqual(result['boot_progress_ams_ready'],1234);self.assertEqual(result['wm_boot_animation_done'],2000);self.assertNotIn('private',json.dumps(result))
  self.assertEqual(m.parse_boot_events(row('I/wm_boot_animation_done: 1\nI/wm_boot_animation_done: 2'))['wm_boot_animation_done'],'ambiguous')
  self.assertEqual(m.parse_boot_events(row('I/wm_boot_animation_done: 1\nI/wm_boot_animation_done: malformed'))['wm_boot_animation_done'],'ambiguous')
  self.assertTrue(all(x=='unavailable' for x in m.parse_boot_events(row('I/wm_boot_animation_done: 1','truncated')).values()))
 def test_independent_evidence_survives_other_probe_failure(self):
  spec=importlib.util.spec_from_file_location('state_runner',Path(__file__).with_name('runner.py'));runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
  device=Mock(sdk=Path('/unused'),serial='unused',root=Path('/unused-avd'))
  for failed in ('collect','collect_boot_state'):
   guest=Mock();guest.collect.return_value={'first':True};guest.collect_boot_state.return_value={'second':True};getattr(guest,failed).side_effect=ValueError('private')
   report={};runner.collect_guest_evidence(report,guest,device)
   self.assertEqual(report['guest_startup'],{'diagnostic_error':True} if failed=='collect' else {'first':True})
   self.assertEqual(report['boot_state_discriminator'],{'diagnostic_error':True} if failed=='collect_boot_state' else {'second':True})
   guest.collect.assert_called_once();guest.collect_boot_state.assert_called_once();self.assertNotIn('private',json.dumps(report))
 def test_batch_fixed_and_nonleaking(self):
  with tempfile.TemporaryDirectory() as td,patch.object(m,'capture',return_value=row('private component data')) as capture:
   result=m.collect_boot_state(Path('/unused/adb'),'private-serial',Path(td).resolve())
  self.assertEqual(capture.call_count,10);self.assertNotIn('private',json.dumps(result));self.assertEqual(result['user_scope'],0)
  args=[c.args[0][3:] for c in capture.call_args_list];self.assertEqual(args[0],['shell','dumpsys','activity','processes']);self.assertEqual(args[1],['shell','dumpsys','window','windows']);self.assertEqual(args[-1][-1],'*:S')
if __name__=='__main__':unittest.main()
