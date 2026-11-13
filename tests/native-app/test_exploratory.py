import importlib.util,unittest,json,hashlib
from pathlib import Path
from unittest.mock import Mock,patch

def load(name):
 s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
r=load('runner');e=load('exploratory')
class Tests(unittest.TestCase):
 def setup_case(self):
  self.raw=b'apk';self.ident={'apk_sha256':hashlib.sha256(self.raw).hexdigest(),'source_sha':'a'*40,'signer_sha256':'b'*64}
  self.report={**self.ident,'category':'boot_deadline','stage':'boot','result':'FAIL','release_ready':False,'reached':{'apk_verified':True,'boot_completed':False,'installed_verified':False,'launched':False,'home_ready':False},'groups':{k:{'status':'BLOCKED','reason':'not_executed'} for k in r.JOURNEYS},'boot_diagnostics':{},'guest_startup':{},'boot_state_discriminator':{}}
  self.device=Mock(sdk=Path('/sdk'),serial='emulator-5580');self.device.emulator.poll.return_value=None;self.device.actions=[]
  def adb(*args,**kw):
   if args==('get-state',):return 'device'
   if args[:4]==('shell','cmd','package','list'):return 'package:android\npackage:com.android.systemui'
   if args[:3]==('shell','pm','path'):return 'package:/data/app/test/base.apk'
   if args[:3]==('shell','getprop','sys.boot_completed'):return ''
   return ''
  self.device.adb.side_effect=adb
  self.guest=Mock();self.guest.parse.side_effect=['present','found','found','present']
  self.page=Mock(connection_failures=0,flags={'detached':False,'target_crashed':False},port=1)
  self.api=dict(vars(r));self.api['verify_apk']=Mock(return_value=self.ident);self.api['Page']=Mock(return_value=self.page)
 def run_case(self):
  with patch.object(e.subprocess,'run',return_value=Mock(stdout=self.raw)):return e.run(self.api,self.guest,self.device,'apk','receipt',self.report)
 def test_success_never_mutates_original_or_accepts(self):
  self.setup_case();before=json.dumps(self.report,sort_keys=True);out=self.run_case()
  self.assertEqual(json.dumps(self.report,sort_keys=True),before);self.assertEqual(out['original_snapshot'],self.report)
  self.assertEqual(out['result'],'HOME_OBSERVED_NOT_ACCEPTANCE');self.assertFalse(out['release_ready']);self.assertEqual(self.device.actions,[])
  self.assertEqual(out['actions'],['install','launch']);self.page.readiness.assert_called_once();self.assertEqual(out['boot_at_end'],'empty')
 def test_each_prerequisite_failure_prevents_install(self):
  for i in range(4):
   self.setup_case();values=['present','found','found','present'];values[i]='unavailable';self.guest.parse.side_effect=values;out=self.run_case()
   self.assertFalse(out['attempted']);self.api['verify_apk'].assert_not_called();self.assertFalse(any(c.args and c.args[0]=='install' for c in self.device.adb.call_args_list))
 def test_absence_must_be_positive_complete_listing(self):
  for listing in ['','package:'+r.PACKAGE,'error text']:
   self.setup_case();old=self.device.adb.side_effect
   self.device.adb.side_effect=lambda *a,**k:listing if a[:4]==('shell','cmd','package','list') else old(*a,**k)
   self.assertFalse(self.run_case()['attempted']);self.api['verify_apk'].assert_not_called()
 def test_snapshot_failure_and_original_boot_success_deny(self):
  for alter in [lambda x:x['boot_state_discriminator'].update(diagnostic_error=True),lambda x:x['reached'].update(boot_completed=True),lambda x:x.update(category='emulator_exited')]:
   self.setup_case();alter(self.report);self.assertFalse(self.run_case()['attempted']);self.guest.capture.assert_not_called()
 def test_identity_failure_denies_install(self):
  self.setup_case();self.api['verify_apk'].return_value={**self.ident,'source_sha':'c'*40};self.assertFalse(self.run_case()['attempted'])
 def test_detach_no_retry_and_cleanup(self):
  self.setup_case();self.page.readiness.side_effect=r.Failure('target_detached');out=self.run_case();self.assertEqual(out['category'],'target_detached');self.api['Page'].assert_called_once();self.page.ws.close.assert_called_once();self.assertNotIn('home_native_bridge',out['reached'])
 def test_deadline_no_negative_timeout(self):
  with patch.object(r.time,'monotonic',return_value=20):
   self.assertEqual(r.remaining(21,10),1)
   for deadline in [19,20]:
    with self.assertRaises(r.Failure):r.remaining(deadline,10)
 def test_no_journey_or_state_bypass(self):
  source=Path(e.__file__).read_text()
  for forbidden in ['keyevent','force-stop','settings put','pm grant','module.run','reopen_after_intentional_restart']:self.assertNotIn(forbidden,source)
if __name__=='__main__':unittest.main()

class Orchestration(unittest.TestCase):
 def test_helper_import_and_call_errors_preserve_failure_cleanup_and_result(self):
  import tempfile,sys
  for fail_import in [True,False]:
   with self.subTest(fail_import=fail_import),tempfile.TemporaryDirectory() as root:
    output=Path(root)/'result.json';device=Mock();device.boot.side_effect=r.Failure('boot_deadline');device.actions=[];device.versions={};device.boot_diagnostics.return_value={};device.output.snapshot.return_value={};device.sdk=Path('/sdk');device.root=Path(root)
    guest=Mock();guest.collect.return_value={};guest.collect_boot_state.return_value={}
    explore=Mock();explore.run.side_effect=RuntimeError('private arbitrary text')
    def spec(name,path):
     loader=Mock()
     if name=='exploratory' and fail_import:loader.exec_module.side_effect=RuntimeError('private arbitrary text')
     from types import SimpleNamespace
     return SimpleNamespace(loader=loader,name=name)
    def module(spec):return guest if spec.name=='guest_boot' else explore
    argv=['runner','--apk','apk','--receipt','receipt','--result',str(output),'--exploratory-after-boot-failure']
    with patch.object(sys,'argv',argv),patch.dict(r.os.environ,{'ANDROID_HOME':'/sdk','RUNNER_TEMP':root}),patch.object(r,'require_ci'),patch.object(r,'Device',return_value=device),patch.object(r,'verify_apk',return_value={}),patch.object(r.importlib.util,'spec_from_file_location',side_effect=spec),patch.object(r.importlib.util,'module_from_spec',side_effect=module),patch('builtins.print'):
     self.assertEqual(r.main(),1)
    data=json.loads(output.read_text());self.assertEqual(data['category'],'boot_deadline');self.assertEqual(data['result'],'FAIL');self.assertFalse(data['reached']['boot_completed']);self.assertEqual(data['exploratory']['category'],'diagnostic_error');device.close.assert_called_once();self.assertNotIn('private arbitrary',output.read_text())
 def test_partial_page_cleanup_uses_separate_allowance(self):
  p=r.Page.__new__(r.Page);p.deadline=0;p.ws=Mock();p.port=17;p.device=Mock();p.close()
  p.device.cleanup_adb.assert_called_once_with('forward','--remove','tcp:17',timeout=3);p.ws.close.assert_called_once_with(timeout=2);p.device.adb.assert_not_called()

class DeadlineTransport(unittest.TestCase):
 def test_actual_page_constructor_caps_transport_and_cleanup(self):
  import sys
  device=Mock();device.adb.side_effect=['42','webview_devtools_remote_42','1234'];ws=Mock();socket=Mock();socket.create_connection.return_value=ws
  target={'id':'synthetic','webSocketDebuggerUrl':'ws://localhost/devtools/page/synthetic'}
  with patch.dict(sys.modules,{'websocket':socket}),patch.object(r.time,'monotonic',return_value=100),patch.object(r,'targets',return_value=[target]) as targets:
   page=r.Page(device,deadline=102)
  self.assertEqual(socket.create_connection.call_args.kwargs['timeout'],2);targets.assert_called_once_with(1234,102)
  # Expired construction never invokes ADB or a websocket.
  device.reset_mock();socket.reset_mock()
  with patch.dict(sys.modules,{'websocket':socket}),patch.object(r.time,'monotonic',return_value=103):
   with self.assertRaises(r.Failure):r.Page(device,deadline=102)
  device.adb.assert_not_called();socket.create_connection.assert_not_called()
 def test_constructor_failure_removes_forward_without_masking(self):
  import sys
  device=Mock();device.adb.side_effect=['42','webview_devtools_remote_42','1234'];socket=Mock();socket.create_connection.side_effect=ValueError('synthetic')
  with patch.dict(sys.modules,{'websocket':socket}),patch.object(r.time,'monotonic',return_value=100),patch.object(r,'targets',return_value=[{'id':'x','webSocketDebuggerUrl':'ws://localhost/devtools/page/x'}]):
   with self.assertRaises(ValueError):r.Page(device,deadline=102)
  device.cleanup_adb.assert_called_once_with('forward','--remove','tcp:1234',timeout=3)
 def test_http_request_remaining_and_expired_no_request(self):
  response=Mock();response.read.return_value=b'[]';context=Mock();context.__enter__=Mock(return_value=response);context.__exit__=Mock(return_value=False)
  with patch.object(r.time,'monotonic',return_value=100),patch.object(r.LOCAL_OPENER,'open',return_value=context) as op:
   self.assertEqual(r.targets(1234,101),[]);self.assertEqual(op.call_args.kwargs['timeout'],1)
  with patch.object(r.time,'monotonic',return_value=102),patch.object(r.LOCAL_OPENER,'open') as op:
   with self.assertRaises(r.Failure):r.targets(1234,101)
   op.assert_not_called()
 def test_evaluate_caps_send_receive_and_protocol_timeout(self):
  p=r.Page.__new__(r.Page);p.deadline=102;p.sequence=0;p.connection_failures=0;p.flags={};p.ws=Mock();p.ws.recv.return_value=json.dumps({'id':1,'result':{'result':{'value':2}}})
  with patch.object(r.time,'monotonic',return_value=100):self.assertEqual(p.evaluate('1+1'),2)
  self.assertEqual(json.loads(p.ws.send.call_args.args[0])['params']['timeout'],2000);self.assertTrue(all(c.args==(2,) for c in p.ws.settimeout.call_args_list))
  p.ws.reset_mock()
  with patch.object(r.time,'monotonic',return_value=103):
   with self.assertRaises(r.Failure):p.evaluate('1+1')
  p.ws.send.assert_not_called();p.ws.recv.assert_not_called()
 def test_corrupt_admission_group_and_reached_snapshots(self):
  for alter in [lambda x:x.update(groups={}),lambda x:x.update(stage='install'),lambda x:x['reached'].update(launched=True),lambda x:x['reached'].pop('home_ready')]:
   helper=Tests();helper.setup_case();alter(helper.report);self.assertFalse(helper.run_case()['attempted']);helper.api['verify_apk'].assert_not_called()
