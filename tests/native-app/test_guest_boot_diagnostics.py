"""Synthetic local process/parser controls only; never adb/emulator."""
import importlib.util,json,subprocess,sys,unittest
from pathlib import Path
from unittest.mock import patch,Mock
s=importlib.util.spec_from_file_location('guest',Path(__file__).with_name('guest_boot_diagnostics.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def row(raw=b'',code=0,state='complete'):return {'raw':raw,'returncode':code,'state':state}
class GuestDiagnostics(unittest.TestCase):
 def test_specific_service_not_substring(self):
  self.assertEqual(m.parse('service','activity',row(b'Service activity: found')),'found')
  self.assertEqual(m.parse('service','activity',row(b'Service activity: not found')),'not_found')
  for text in [b'Service package: found',b'found',b'Service activity: found secret']:
   self.assertEqual(m.parse('service','activity',row(text)),'unavailable')
 def test_negative_is_not_unavailable(self):
  self.assertEqual(m.parse('pid','',row(b'',1)),'absent')
  self.assertEqual(m.parse('pid','',row(b'123 456')),'present')
  for bad in [row(b'',0),row(b'secret',1),row(b'',2),row(b'',1,'timeout')]:self.assertEqual(m.parse('pid','',bad),'unavailable')
 def test_fixed_properties_package_and_uptime(self):
  self.assertEqual(m.parse('init','',row(b'running')),'running')
  self.assertEqual(m.parse('init','',row(b'private')),'unavailable')
  self.assertEqual(m.parse('package','',row(b'package:/system/framework/framework-res.apk')),'present')
  for value in [b'package:relative',b'package:/x y',b'',b'Error: secret']:self.assertEqual(m.parse('package','',row(value)),'unavailable')
  self.assertEqual(m.parse('uptime','',row(b'301.25 400.0')),301.25)
  for value in [b'nan 1',b'inf 1',b'9999999 0',b'123 secret']:self.assertEqual(m.parse('uptime','',row(value)),'unavailable')
 def test_actual_capture_success_exit_and_merged_stderr(self):
  result=m.capture([sys.executable,'-c','import sys; print("control"); print("error",file=sys.stderr); sys.exit(7)'])
  self.assertEqual(result['state'],'complete');self.assertEqual(result['returncode'],7);self.assertIn(b'error',result['raw'])
 def test_actual_timeout_and_cap_reap(self):
  original=m.subprocess.Popen;started=[]
  def record(*a,**kw):
   process=original(*a,**kw);started.append(process);return process
  with patch.object(m.subprocess,'Popen',side_effect=record):
   timed=m.capture([sys.executable,'-c','import time; time.sleep(3)'],timeout=.05)
   capped=m.capture([sys.executable,'-c','import sys; sys.stderr.write("x"*100000)'],cap=1024)
  self.assertEqual(timed['state'],'timeout');self.assertEqual(capped['state'],'truncated');self.assertEqual(len(capped['raw']),1024)
  self.assertTrue(all(p.poll() is not None and p.stdout.closed for p in started))
 def test_read_error_still_reaps(self):
  original=m.subprocess.Popen;started=[];read_patch=patch.object(m.os,'read',side_effect=OSError('secret'))
  def record(*a,**kw):
   process=original(*a,**kw);started.append(process);read_patch.start();return process
  try:
   with patch.object(m.subprocess,'Popen',side_effect=record):result=m.capture([sys.executable,'-c','print("control")'])
  finally:read_patch.stop()
  self.assertEqual(result['state'],'unavailable');self.assertIsNotNone(started[0].poll());self.assertTrue(started[0].stdout.closed)
 def test_cleanup_failures_do_not_skip_reap_or_pipe_close(self):
  for failing in ('selector','kill'):
   process=Mock();process.poll.return_value=None;process.stdout.fileno.return_value=5
   selector=Mock();selector.select.return_value=[True]
   if failing=='selector':selector.close.side_effect=OSError('private selector')
   else:process.kill.side_effect=OSError('private kill')
   with patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.os,'set_blocking'),patch.object(m.selectors,'DefaultSelector',return_value=selector),patch.object(m.os,'read',side_effect=OSError('private read')):
    result=m.capture(['synthetic'])
   self.assertEqual(result['state'],'cleanup_failed');process.kill.assert_called_once();process.wait.assert_called_once_with(timeout=1);process.stdout.close.assert_called_once()
   self.assertNotIn('private',str(result))
 def test_failed_reap_still_closes_pipe(self):
  process=Mock();process.poll.return_value=None;process.stdout.fileno.return_value=5;process.wait.side_effect=subprocess.TimeoutExpired('private',1)
  selector=Mock();selector.select.return_value=[True]
  with patch.object(m.subprocess,'Popen',return_value=process),patch.object(m.os,'set_blocking'),patch.object(m.selectors,'DefaultSelector',return_value=selector),patch.object(m.os,'read',side_effect=OSError('private')):
   result=m.capture(['synthetic'])
  self.assertEqual(result['state'],'reap_failed');process.stdout.close.assert_called_once()
 def test_fixed_batch_no_payload_retained(self):
  with patch.object(m,'capture',return_value=row(b'private-token AVC: denied FATAL EXCEPTION:')) as capture:
   result=m.collect(Path('/fake/adb'),'private-serial')
  self.assertEqual(capture.call_count,11);self.assertNotIn('private',json.dumps(result))
  self.assertTrue(result['logcat']['indicators']['selinux_denial']);self.assertTrue(result['logcat']['indicators']['fatal_exception'])
  calls=[c.args[0][3:] for c in capture.call_args_list]
  self.assertEqual(calls[-1],['logcat','-d','-b','main','-b','system','-b','crash','-t','64'])
  self.assertTrue(all(c[:3]==['shell','getprop','init.svc.'+name] for c,name in zip(calls[:5],m.SERVICE_NAMES)))
 def test_runner_failure_only_gate(self):
  source=Path(__file__).with_name('runner.py').read_text()
  self.assertIn("if report['stage']=='boot' and not report['reached']['boot_completed']:",source)
  self.assertIn('end=time.monotonic()+BOOT_SECONDS',source)
if __name__=='__main__':unittest.main()
