"""Pure/synthetic pipe and device mocks; never starts adb or emulator."""
import importlib.util,io,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
s=importlib.util.spec_from_file_location('boot_runner',Path(__file__).with_name('runner.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class BootDiagnostics(unittest.TestCase):
 def setUp(self):
  environment=patch.dict(m.os.environ,{});environment.start();self.addCleanup(environment.stop)
 def test_bounded_stream_split_tokens_and_no_raw_data(self):
  sink=m.EmulatorOutput();data=b'x'*4088+b'FATAL: private-token\nfailed to initialize vulkan\n'+b'x'*100000
  sink.start(io.BytesIO(data),io.BytesIO(b'PANIC: private-url'));sink.join();result=sink.snapshot()
  self.assertTrue(result['indicators']['fatal_marker']);self.assertTrue(result['indicators']['graphics_error']);self.assertFalse(result['read_error'])
  self.assertEqual(set(result['indicators']),set(m.EMULATOR_INDICATORS));self.assertNotIn('private',json.dumps(result));self.assertFalse(hasattr(sink,'raw'))
 def test_incomplete_reader_and_close_failure_are_explicit(self):
  sink=m.EmulatorOutput();thread=Mock();thread.is_alive.return_value=True;sink.threads=[thread]
  sink.join();thread.join.assert_called_once_with(timeout=2)
  self.assertFalse(sink.snapshot()['readers_complete'])
  stream=Mock();stream.read.return_value=b'';stream.close.side_effect=OSError('secret')
  sink.consume(stream);self.assertTrue(sink.snapshot()['read_error'])
  self.assertNotIn('secret',json.dumps(sink.snapshot()))
 def test_unknown_output_is_not_diagnosed(self):
  sink=m.EmulatorOutput();sink.consume(io.BytesIO(b'arbitrary secret exception'))
  self.assertFalse(any(sink.snapshot()['indicators'].values()))
 def test_process_and_property_allowlist(self):
  d=m.Device(Path('/unused'),Path('/unused-avd'));d.emulator=Mock();d.emulator.poll.return_value=None
  with patch.object(d,'adb',side_effect=['device','1','stopped']) as adb:
   result=d.boot_diagnostics()
  self.assertTrue(result['emulator_alive']);self.assertIsNone(result['emulator_returncode']);self.assertEqual(result['adb_state'],'device');self.assertEqual(result['dev_bootcomplete'],'1');self.assertEqual(result['boot_animation'],'stopped')
  self.assertTrue(all(call.kwargs['timeout']==2 for call in adb.call_args_list))
  d.emulator.poll.return_value=7
  with patch.object(d,'adb',side_effect=['private serial',subprocess.TimeoutExpired('secret',2),m.Failure('secret')]):result=d.boot_diagnostics()
  self.assertFalse(result['emulator_alive']);self.assertEqual(result['emulator_returncode'],7);self.assertEqual(result['adb_state'],'other');self.assertEqual(result['dev_bootcomplete'],'timeout');self.assertEqual(result['boot_animation'],'command_failed');self.assertNotIn('private',json.dumps(result))
 def test_boot_timeout_preserved_with_poll_observation(self):
  with tempfile.TemporaryDirectory() as td:
   d=m.Device(Path('/unused'),Path(td)/'avd');process=Mock();process.poll.return_value=None;process.stdout=io.BytesIO(b'');process.stderr=io.BytesIO(b'')
   with patch.object(m,'command',return_value=''),patch.object(m.subprocess,'Popen',return_value=process) as popen,patch.object(m.time,'monotonic',side_effect=[0,1,301]),patch.object(m.time,'sleep'),patch.object(d,'adb',return_value='0'):
    with self.assertRaisesRegex(m.Failure,'boot_deadline'):d.boot()
   d.output.join();self.assertEqual(d.boot_observations['sys_boot_completed'],'0')
   argv=popen.call_args.args[0];self.assertEqual(argv[argv.index('-accel')+1],'on');self.assertEqual(argv[argv.index('-gpu')+1],'swiftshader_indirect')
 def test_boot_success_retains_exact_one_and_exited_fails(self):
  for exitcode in (None,1):
   with tempfile.TemporaryDirectory() as td:
    d=m.Device(Path('/unused'),Path(td)/'avd');process=Mock();process.poll.return_value=exitcode;process.stdout=io.BytesIO(b'');process.stderr=io.BytesIO(b'')
    with patch.object(m,'command',return_value=''),patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.time,'monotonic',side_effect=[0,1]),patch.object(d,'adb',return_value='1'):
     if exitcode is None:d.boot();self.assertEqual(d.boot_observations['sys_boot_completed'],'1')
     else:
      with self.assertRaisesRegex(m.Failure,'emulator_exited'):d.boot()
    d.output.join()
 def test_scope_and_deadline_source_contract(self):
  source=Path(__file__).with_name('runner.py').read_text()
  self.assertNotIn('INSTALLED_FULL_APP_SYNTHETIC',source);self.assertIn('end=time.monotonic()+300',source)
  self.assertIn("'installed_verified':False",source);self.assertIn("'home_ready':False",source)
  self.assertIn("device.verify_installed(report['apk_sha256']);report['reached']['installed_verified']=True",source)
if __name__=='__main__':unittest.main()
