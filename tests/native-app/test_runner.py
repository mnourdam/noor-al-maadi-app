"""Offline guards only: no SDK, child process, emulator, network or WebView started."""
import importlib.util,json,unittest,tempfile,zipfile,hashlib
from pathlib import Path
from unittest.mock import patch,Mock
spec=importlib.util.spec_from_file_location('runner',Path(__file__).with_name('runner.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_origin(self):
  self.assertTrue(m.packaged('https://localhost/index.html'))
  for u in ['https://evil.test/','http://localhost/','https://localhost:99/','https://x@localhost/']:self.assertFalse(m.packaged(u))
 def test_no_other_platform(self):
  d=m.Device(Path('/unused'),Path('/unused-avd'))
  with patch.object(m.platform,'system',return_value='Linux'),patch.object(m,'command') as c:
   with self.assertRaisesRegex(m.Failure,'intel_macos'):d.provision()
   c.assert_not_called()
 def test_missing_license(self):
  d=m.Device(Path('/unused'),Path('/unused-avd'))
  with patch.object(m.platform,'system',return_value='Darwin'),patch.object(m.platform,'machine',return_value='x86_64'),patch.object(Path,'is_file',return_value=False),patch.object(m,'command') as c:
   with self.assertRaisesRegex(m.Failure,'existing_license'):d.provision()
   c.assert_not_called()
 def test_hvf_requires_positive_tool_output(self):
  d=m.Device(Path('/unused'),Path('/unused-avd'))
  with patch.object(m.platform,'system',return_value='Darwin'),patch.object(m.platform,'machine',return_value='x86_64'),patch.object(Path,'is_file',return_value=True),patch.object(m,'command',side_effect=['','not HV accelerator']) as c:
   with self.assertRaisesRegex(m.Failure,'hvf_unverified'):d.provision()
   self.assertEqual(c.call_args_list[0].kwargs['input'],b'')
 def page(self,rows):
  p=m.Page.__new__(m.Page);p.sequence=0;p.connection_failures=0;p.flags={'detached':False,'target_crashed':False,'detach_category':'none'};p.ws=Mock();p.ws.recv.side_effect=[json.dumps(x) for x in rows];return p
 def test_detach_fails_no_reconnect_raw_reason_not_emitted(self):
  p=self.page([{'method':'Inspector.detached','params':{'reason':'secret user contents'}}])
  with self.assertRaisesRegex(m.Failure,'target_detached'):p.evaluate('1+1')
  self.assertEqual(p.flags['detach_category'],'other');self.assertTrue(p.flags['detached']);self.assertEqual(p.ws.send.call_count,1)
 def test_js_response_and_error(self):
  p=self.page([{'id':1,'result':{'result':{'value':2}}}]);self.assertEqual(p.evaluate('1+1'),2)
  for r in [{'id':1,'error':{}},{'id':1,'result':{'exceptionDetails':{}}}]:
   with self.assertRaisesRegex(m.Failure,'evaluation_error'):self.page([r]).evaluate('1+1')
 def test_current_target_diagnostic(self):
  p=self.page([]);p.port=1;p.target={'id':'original'};p.pid='17';p.device=Mock();p.device.adb.return_value='17'
  with patch.object(m,'targets',return_value=[{'id':'new'}]):r=p.diagnostics()
  self.assertEqual(r['current_target_count'],1);self.assertFalse(r['original_target_present']);self.assertTrue(r['original_process_present']);self.assertNotIn('new',json.dumps(r))
 def test_installed_bytes_checked(self):
  d=m.Device(Path('/sdk'),Path('/avd'));d.adb=Mock(return_value='package:/data/app/abc/base.apk')
  with patch.object(m.subprocess,'run',return_value=Mock(stdout=b'wrong')):
   with self.assertRaisesRegex(m.Failure,'installed_hash'):d.verify_installed('0'*64)
 def test_unsafe_installed_path_never_read(self):
  d=m.Device(Path('/sdk'),Path('/avd'));d.adb=Mock(return_value='package:/etc/passwd')
  with patch.object(m.subprocess,'run') as run:
   with self.assertRaisesRegex(m.Failure,'installed_path'):d.verify_installed('0'*64)
   run.assert_not_called()
 def test_driver_native_actions(self):
  d=m.Device(Path('/sdk'),Path('/avd'));d.adb=Mock();d.back();d.home();d.launch()
  self.assertEqual(d.actions,['back','home','launch']);self.assertEqual(d.adb.call_args_list[0].args,('shell','input','keyevent','KEYCODE_BACK'))
 def test_redacted_unknown_failure(self):
  self.assertEqual(m.category(m.Failure('private arbitrary text')),'assertion_failure')
 def test_redirect_refused(self):
  with self.assertRaisesRegex(m.Failure,'debug_redirect'):m.NoRedirect().redirect_request(None,None,None,None,None,None)
 def test_home_not_splash_contract(self):
  self.assertIn('home-stat-investigations',m.HOME_READY);self.assertIn('irth-boot-splash',m.HOME_READY);self.assertIn("location.pathname==='/'",m.HOME_READY)
 def test_apk_identity_and_config_boundaries(self):
  with tempfile.TemporaryDirectory() as root:
   root=Path(root);apk=root/'test.apk';receipt=root/'receipt.json';sha='a'*40;cert='b'*64
   def prepare(config):
    assets={'assets/public/index.html':b'<main>synthetic</main>','assets/capacitor.config.json':json.dumps(config).encode()}
    with zipfile.ZipFile(apk,'w') as z:
     for n,v in assets.items():z.writestr(n,v)
    receipt.write_text(json.dumps({'apk_sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'source_sha':sha,'signer_sha256':cert,'assets_sha256':{n:hashlib.sha256(v).hexdigest() for n,v in assets.items()}}))
   def responses(args,*a,**kw):
    args=[str(x) for x in args]
    if args[0]=='git':return sha
    if 'badging' in args:return "package: name='"+m.PACKAGE+"'"
    if 'permissions' in args:return ''
    if 'resources' in args:return ''
    if '--print-certs' in args:return 'Signer #1 certificate SHA-256 digest: '+cert
    raise AssertionError('unexpected command')
   with patch.object(m,'command',side_effect=responses):
    prepare({'appId':m.PACKAGE});self.assertEqual(m.verify_apk(apk,receipt,root)['source_sha'],sha)
    for config in [{'appId':'production'},{'appId':m.PACKAGE,'server':{'url':'https://external.invalid'}},{'appId':m.PACKAGE,'android':{'allowMixedContent':True}}]:
     prepare(config)
     with self.assertRaisesRegex(m.Failure,'capacitor_config'):m.verify_apk(apk,receipt,root)
    prepare({'appId':m.PACKAGE});r=json.loads(receipt.read_text());r['assets_sha256']['assets/public/index.html']='0'*64;receipt.write_text(json.dumps(r))
    with self.assertRaisesRegex(m.Failure,'asset_hash'):m.verify_apk(apk,receipt,root)
 def test_ci_gate(self):
  with patch.dict(m.os.environ,{},clear=True):
   with self.assertRaisesRegex(m.Failure,'ci_context'):m.require_ci()
  good={'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/v18-01a-outbox-recovery','GITHUB_EVENT_NAME':'workflow_dispatch'}
  with patch.dict(m.os.environ,good,clear=True):m.require_ci()
  for k,v in [('GITHUB_ACTIONS','false'),('GITHUB_REF','refs/heads/main'),('GITHUB_EVENT_NAME','pull_request')]:
   with patch.dict(m.os.environ,{**good,k:v},clear=True):
    with self.assertRaisesRegex(m.Failure,'ci_context'):m.require_ci()
 def test_socket_and_release_static_boundaries(self):
  source=Path(m.__file__).read_text()
  self.assertIn("http_no_proxy=['localhost','127.0.0.1']",source)
  self.assertIn("'release_ready':False",source)
  self.assertIn('PASS_SIX_SYNTHETIC_FIXTURE_GROUPS_NOT_RELEASE',source)
 def test_group_statuses_no_partial_success(self):
  groups={name:{'status':'BLOCKED','reason':'not_executed'} for name in m.JOURNEYS}
  self.assertFalse(m.complete_groups(groups))
  name=next(iter(m.JOURNEYS));m.record_group(groups,name,'PASS','passed')
  self.assertFalse(m.complete_groups(groups))
  with self.assertRaises(m.Failure):m.record_group(groups,name,'PASS','passed')
  for key in m.JOURNEYS-{name}:m.record_group(groups,key,'PASS','passed')
  self.assertTrue(m.complete_groups(groups))
  groups[name]={'status':'FAIL','reason':'assertion_failed'};self.assertFalse(m.complete_groups(groups))
 def test_group_schema_rejects_missing_or_arbitrary_text(self):
  with self.assertRaises(m.Failure):m.complete_groups({})
  groups={name:{'status':'BLOCKED','reason':'not_executed'} for name in m.JOURNEYS}
  with self.assertRaises(m.Failure):m.record_group(groups,next(iter(m.JOURNEYS)),'PASS','fixture_missing')
  with self.assertRaises(m.Failure):m.record_group(groups,next(iter(m.JOURNEYS)),'FAIL','sensitive raw error')
 def test_reconnect_requires_intentional_native_sequence(self):
  page=self.page([]);page.device=Mock();page.device.actions=['launch'];page.close=Mock()
  with self.assertRaisesRegex(m.Failure,'unplanned_reconnect'):page.reopen_after_intentional_restart()
  page.close.assert_not_called()
  page.device.actions=['force_stop','launch'];page.restart_action_count=2
  with self.assertRaisesRegex(m.Failure,'unplanned_reconnect'):page.reopen_after_intentional_restart()
 def test_restart_positive_and_failure_flags(self):
  page=self.page([]);page.device=Mock();page.device.actions=['force_stop','launch'];page.close=Mock();page.readiness=Mock()
  # A minimal replacement's data, not Mock internals, models a fresh connection.
  from types import SimpleNamespace
  replacement=SimpleNamespace(flags={'detached':False,'target_crashed':False},connection_failures=0,port=99)
  with patch.object(m,'Page',return_value=replacement):page.reopen_after_intentional_restart()
  page.close.assert_called_once();page.readiness.assert_called_once();self.assertEqual(page.intentional_restarts,1);self.assertEqual(page.port,99)
  with self.assertRaisesRegex(m.Failure,'unplanned_reconnect'):page.reopen_after_intentional_restart()
  for flag in ['detached','target_crashed']:
   bad=self.page([]);bad.device=Mock();bad.device.actions=['force_stop','launch'];bad.flags[flag]=True;bad.close=Mock()
   with self.assertRaisesRegex(m.Failure,'unplanned_reconnect'):bad.reopen_after_intentional_restart()
   bad.close.assert_not_called()
if __name__=='__main__':unittest.main()
