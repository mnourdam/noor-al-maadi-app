import ast,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('observer',Path(__file__).with_name('observe.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_boundaries_no_backdating_or_rounding(self):
  self.assertEqual(m.boundary(None),'not_observed')
  for start,end,want in [(599,600,'observed_by_600'),(599,600.00001,'straddled_600'),(600,601,'observed_after_600')]:self.assertEqual(m.boundary({'start_seconds':start,'end_seconds':end}),want)
 def run_observe(self,one_at=None):
  td=tempfile.TemporaryDirectory();self.addCleanup(td.cleanup);device=m.r.Device(Path('/sdk'),Path(td.name)/'avd');process=Mock();process.poll.return_value=None;process.stdout=io.BytesIO(b'');process.stderr=io.BytesIO(b'');clock=[0];events=[]
  def capture(args,**kw):
   if args[-2:]==['getprop','sys.boot_completed']:
    clock[0]+=1;value=b'1' if one_at is not None and clock[0]>=one_at else b'';events.append(clock[0]);return {'state':'complete','returncode':0,'raw':value}
   return {'state':'complete','returncode':0,'raw':b'mBooted=false mBooting=false mCallFinishBooting=false mBootAnimationComplete=false mSystemBooted=false mDisplayEnabled=false'}
  resources={'hardware-qemu.ini':dict(m.EXPECTED),'config.ini':dict(m.EXPECTED)};report={}
  with patch.object(m.r,'command',return_value=''),patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.time,'monotonic',side_effect=lambda:clock[0]),patch.object(m.time,'sleep',side_effect=lambda t:clock.__setitem__(0,clock[0]+t)),patch.object(m.g,'capture',side_effect=capture),patch.object(m.g,'avd_resources',return_value=resources):m.observe(device,report)
  device.output.join();return report,events
 def test_late_natural_boot_without_application_action(self):
  report,events=self.run_observe(701);self.assertEqual(report['result'],'BOOT_OBSERVED_NOT_APP_ACCEPTANCE');self.assertEqual(report['original_600_observation'],'observed_after_600');self.assertEqual([s['label'] for s in report['snapshots']],['300','600','terminal']);self.assertTrue(report['known_configuration_comparable'])
 def test_early_boot_and_900_stop(self):
  report,_=self.run_observe(9);self.assertEqual(report['original_600_observation'],'observed_by_600');self.assertEqual([s['label'] for s in report['snapshots']],['terminal'])
  report,events=self.run_observe();self.assertEqual(report['result'],'NO_BOOT_OBSERVED_WITHIN_900');self.assertIsNone(report['first_one']);self.assertLessEqual(max(events),900)
 def test_authorized_actual_budget_and_observer_limit_with_identical_argv(self):
  self.assertEqual(m.r.BOOT_SECONDS,900);self.assertEqual(m.LIMIT,900)
  tree=ast.parse(Path(m.r.__file__).read_text());calls=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='Popen']
  argv=[x.value for x in calls[0].args[0].elts[1:]];self.assertEqual(argv,m.ARGV)
 def test_workflow_branch_no_app_build_install_or_license_changes(self):
  text=(Path(__file__).resolve().parents[2]/'.github/workflows/v18-boot-observation.yml').read_text()
  for required in ['macos-15-intel','contents: read','persist-credentials: false','accept-android-sdk-licenses: false','if: always()',"refs/heads/v18-01a-outbox-recovery"]:self.assertIn(required,text)
  for forbidden in ['npm','Gradle','gradle','setup-java','setup-node','pip install','--licenses','sudo','chmod','build-full-app','runner.py --apk']:self.assertNotIn(forbidden,text)
 def test_exact_runtime_push_paths_and_explicit_dispatch(self):
  # Parse the deliberately small trigger block without optional YAML dependencies.
  text=(Path(__file__).resolve().parents[2]/'.github/workflows/v18-boot-observation.yml').read_text()
  trigger=text.split('\non:\n',1)[1].split('\npermissions:',1)[0]
  self.assertEqual(trigger,"  push:\n    branches: [v18-01a-outbox-recovery]\n    paths:\n      - '.github/workflows/v18-boot-observation.yml'\n      - 'tests/native-boot-observer/observe.py'\n  workflow_dispatch:")
 def test_no_application_paths_in_observer(self):
  source=Path(m.__file__).read_text()
  for forbidden in ['.install','verify_apk(','.launch(','.home(','.force_stop(','.Page(',"'install'",'settings','keyevent']:self.assertNotIn(forbidden,source)
 def test_failure_retains_result_and_owned_cleanup(self):
  import sys
  with tempfile.TemporaryDirectory() as td:
   output=Path(td)/'result.json';device=Mock();device.versions={'emulator':'37.2.13','image':'2.0.0'};device.output.snapshot.return_value={}
   with patch.object(sys,'argv',['observe','--result',str(output)]),patch.dict(m.os.environ,{'ANDROID_HOME':'/sdk','RUNNER_TEMP':td}),patch.object(m.r,'require_ci'),patch.object(m.r,'command',return_value='a'*40),patch.object(m.r,'Device',return_value=device),patch.object(m,'observe',side_effect=m.r.Failure('emulator_exited')),patch('builtins.print'):
    self.assertEqual(m.main(),1)
   result=json.loads(output.read_text());self.assertEqual(result['category'],'emulator_exited');self.assertFalse(result['release_ready']);self.assertFalse(result['app_started']);device.close.assert_called_once()
 def test_tool_drift_blocks_before_start(self):
  import sys
  with tempfile.TemporaryDirectory() as td:
   output=Path(td)/'result.json';device=Mock();device.versions={'emulator':'changed','image':'2.0.0'};device.output.snapshot.return_value={}
   with patch.object(sys,'argv',['observe','--result',str(output)]),patch.dict(m.os.environ,{'ANDROID_HOME':'/sdk','RUNNER_TEMP':td}),patch.object(m.r,'require_ci'),patch.object(m.r,'command',return_value='a'*40),patch.object(m.r,'Device',return_value=device),patch.object(m,'observe') as observe,patch('builtins.print'):
    self.assertEqual(m.main(),1);observe.assert_not_called()
   self.assertEqual(json.loads(output.read_text())['category'],'tool_revision');device.close.assert_called_once()
if __name__=='__main__':unittest.main()
