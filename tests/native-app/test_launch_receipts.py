"""Offline mock transport and parsers only; no emulator or SDK invoked."""
import importlib.util,json,subprocess,unittest
from pathlib import Path
from unittest.mock import Mock,patch

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
r=load('runner');h=load('launch_reconciliation')
def row(value,code=0,state='complete'):return {'raw':value.encode(),'returncode':code,'state':state}
class Receipt(unittest.TestCase):
    def test_success_one_dispatch_fixed_timeout_boot_before(self):
        device=Mock();device.adb.side_effect=['1','Starting synthetic'];receipt={}
        r.launch_once(device,receipt)
        self.assertTrue(receipt['command_completed']);self.assertTrue(receipt['dispatch_attempted'])
        self.assertEqual(receipt['boot_before_dispatch']['value'],'1')
        self.assertEqual(device.adb.call_args_list[1].args,('shell','am','start','-W','-n',r.PACKAGE+'/'+r.ACTIVITY))
        self.assertEqual(device.adb.call_args_list[1].kwargs,{'timeout':15});self.assertNotIn('reconciliation',receipt)
    def test_expiry_before_dispatch_never_reconciles(self):
        device=Mock();receipt={}
        with patch.object(r.time,'monotonic',return_value=10),patch.object(r.importlib.util,'spec_from_file_location') as importer:
            with self.assertRaises(r.Failure):r.launch_once(device,receipt,deadline=9)
        self.assertFalse(receipt['dispatch_attempted']);device.adb.assert_not_called();importer.assert_not_called()
    def test_original_exception_survives_positive_reconciliation_and_all_helper_failures(self):
        for mode in ('positive','import','collect'):
            device=Mock();error=subprocess.TimeoutExpired('private command',15);device.adb.side_effect=['',error];receipt={};helper=Mock();helper.collect.return_value={'status':'observations_only','process_before':'present','activity':'exact_component_observed','socket':'present'}
            if mode=='collect':helper.collect.side_effect=ValueError('private failure')
            spec=Mock()
            if mode=='import':spec.loader.exec_module.side_effect=RuntimeError('private import')
            with patch.object(r.importlib.util,'spec_from_file_location',return_value=spec),patch.object(r.importlib.util,'module_from_spec',return_value=helper):
                with self.assertRaises(subprocess.TimeoutExpired) as caught:r.launch_once(device,receipt)
            self.assertIs(caught.exception,error);self.assertEqual(device.adb.call_count,2);self.assertFalse(receipt['command_completed']);self.assertEqual(receipt['failure_category'],'TimeoutExpired')
            self.assertNotIn('private',json.dumps(receipt));self.assertIn('reconciliation',receipt)
    def test_boot_sample_failure_does_not_mask_dispatch(self):
        device=Mock();device.adb.side_effect=[ValueError('secret'),None];receipt={};r.launch_once(device,receipt)
        self.assertEqual(receipt['boot_before_dispatch']['value'],'unavailable');self.assertTrue(receipt['command_completed'])
    def test_normal_and_exploratory_use_shared_helper_no_promotion(self):
        source=Path(r.__file__).read_text();explore=Path(r.__file__).with_name('exploratory.py').read_text()
        self.assertIn("device.launch(report['launch'],verified_install=True)",source);self.assertIn("api['launch_once'](bounded,result['launch'],deadline,reconcile_device=device,verified_install=True)",explore)
        self.assertNotIn("bounded.adb('shell','am'",explore);self.assertEqual(r.BOOT_SECONDS,900)
class FirstLaunchWait(unittest.TestCase):
    def test_verified_first60_default_lifecycle15_and_exploratory_budget(self):
        for verified,deadline,want in [(True,None,60),(False,None,15),(1,None,15),(True,120,20),(True,100.5,.5)]:
            device=Mock();device.adb.side_effect=['1',''];receipt={}
            with patch.object(r.time,'monotonic',return_value=100):r.launch_once(device,receipt,deadline=deadline,verified_install=verified)
            self.assertEqual(device.adb.call_count,2);self.assertEqual(device.adb.call_args.kwargs['timeout'],want)
            self.assertEqual(receipt['configured_timeout_seconds'],60 if verified is True else 15);self.assertEqual(receipt['effective_timeout_seconds'],want)
            self.assertTrue(receipt['command_completed'])
    def test_device_lifecycle_launch_remains15_and_single(self):
        device=r.Device(Path('/sdk'),Path('/no-avd'));device.adb=Mock(side_effect=['1',''])
        device.launch();self.assertEqual(device.actions,['launch']);self.assertEqual(device.adb.call_count,2);self.assertEqual(device.adb.call_args.kwargs['timeout'],15)
    def test_initial_expiry_never_sets_timeout_or_dispatch_receipt(self):
        device=Mock();receipt={}
        with patch.object(r.time,'monotonic',return_value=100),patch.object(r.importlib.util,'spec_from_file_location') as imports:
            with self.assertRaises(r.Failure):r.launch_once(device,receipt,deadline=99,verified_install=True)
        device.adb.assert_not_called();imports.assert_not_called();self.assertFalse(receipt['dispatch_attempted']);self.assertNotIn('configured_timeout_seconds',receipt)
    def test_first_timeout_positive_diagnostics_never_reaches_page_or_promotes(self):
        import tempfile,sys
        with tempfile.TemporaryDirectory() as root:
            output=Path(root)/'result.json';device=r.Device(Path('/sdk'),Path(root)/'avd');device.versions={}
            device.provision=Mock();device.boot=Mock();device.close=Mock();device.adb=Mock(side_effect=['35','1',subprocess.TimeoutExpired('private command',60)])
            helper=Mock();helper.collect.return_value={'status':'observations_only','socket':'present'};helper.observe.return_value={'status':'observation_complete_not_acceptance','release_ready':False}
            argv=['runner','--apk','apk','--receipt','receipt','--result',str(output)]
            with patch.object(sys,'argv',argv),patch.dict(r.os.environ,{'ANDROID_HOME':'/sdk','RUNNER_TEMP':root}),patch.object(r,'require_ci'),patch.object(r,'Device',return_value=device),patch.object(r,'verify_apk',return_value={'apk_sha256':'a'*64}),patch.object(r,'install_once'),patch.object(r,'Page') as page,patch.object(r.importlib.util,'spec_from_file_location',return_value=Mock()),patch.object(r.importlib.util,'module_from_spec',return_value=helper),patch('builtins.print'):
                self.assertEqual(r.main(),1)
            report=json.loads(output.read_text());self.assertEqual(report['category'],'TimeoutExpired');self.assertEqual(report['result'],'FAIL');self.assertFalse(report['reached']['launched']);self.assertTrue(report['reached']['installed_verified'])
            self.assertEqual(report['launch']['effective_timeout_seconds'],60);self.assertFalse(report['launch']['command_completed']);page.assert_not_called();device.close.assert_called_once()
            self.assertEqual(sum(call.args[:3]==('shell','am','start') for call in device.adb.call_args_list),1)
            self.assertNotIn('private command',output.read_text())

class Parsers(unittest.TestCase):
    def test_pid_exact_absence_multiple_malformed_capture(self):
        self.assertEqual(h.pid(row('',1)),('absent',None));self.assertEqual(h.pid(row('42')),('present','42'))
        self.assertEqual(h.pid(row('42 43')),('ambiguous',None))
        for value in ['42\n43','0','42suffix','error','']:
            self.assertEqual(h.pid(row(value))[0],'unavailable')
        self.assertEqual(h.pid(row('',1,'truncated'))[0],'unavailable')
    def test_activity_full_relative_conflict_and_malformed(self):
        exact='topResumedActivity=ActivityRecord{ab u0 '+r.PACKAGE+'/'+r.ACTIVITY+' t1}'
        self.assertEqual(h.activity(row(exact),r.PACKAGE,r.ACTIVITY),'exact_component_observed')
        self.assertEqual(h.activity(row('mResumedActivity: ActivityRecord{ab u0 example.app/.Main t1}'),'example.app','example.app.Main'),'exact_component_observed')
        self.assertEqual(h.activity(row(exact+'\nmResumedActivity: ActivityRecord{cd u0 other.app/.Main t2}'),r.PACKAGE,r.ACTIVITY),'ambiguous')
        for value in [exact+' extra','mResumedActivity: secret malformed']:
            self.assertEqual(h.activity(row(value),r.PACKAGE,r.ACTIVITY),'unavailable')
        self.assertEqual(h.activity(row(exact,state='truncated'),r.PACKAGE,r.ACTIVITY),'unavailable')
        self.assertEqual(h.activity(row('no recognized field'),r.PACKAGE,r.ACTIVITY),'not_observed_in_complete_capture')
    def sockets(self,name):return row('Num RefCount Protocol Flags Type St Inode Path\n000: 00000002 00000000 00010000 0001 01 123 '+name)
    def test_socket_full_name_only_and_complete_parse(self):
        self.assertEqual(h.socket(self.sockets('@webview_devtools_remote_42'),'42'),'present')
        for value in ['@webview_devtools_remote_420','@prefix_webview_devtools_remote_42','@webview_devtools_remote_42_suffix']:
            self.assertEqual(h.socket(self.sockets(value),'42'),'not_observed_in_complete_capture')
        self.assertEqual(h.socket(row('garbage'),'42'),'unavailable')
    def test_collector_replacement_and_probe_budget(self):
        device=Mock(sdk=Path('/sdk'),serial='emulator-5580');guest=Mock();spec=Mock()
        guest.capture.side_effect=[row('42'),row(''),self.sockets('@webview_devtools_remote_42'),row('43')]
        with patch.object(h.importlib.util,'spec_from_file_location',return_value=spec),patch.object(h.importlib.util,'module_from_spec',return_value=guest):out=h.collect(device,r.PACKAGE,r.ACTIVITY)
        self.assertFalse(out['same_process_sampled']);self.assertEqual(out['socket'],'unavailable_process_changed_or_unverified');self.assertNotIn('42',json.dumps(out));self.assertEqual(guest.capture.call_count,4)
        guest.reset_mock()
        with patch.object(h.importlib.util,'spec_from_file_location',return_value=spec),patch.object(h.importlib.util,'module_from_spec',return_value=guest),patch.object(h.time,'monotonic',side_effect=[0,13,13,13]):out=h.collect(device,r.PACKAGE,r.ACTIVITY)
        guest.capture.assert_not_called();self.assertEqual(out['probes']['activity']['capture'],'not_started_budget')

class BootBoundary(unittest.TestCase):
    def check_case(self,before,after,value='1'):
        device=r.Device(Path('/sdk'),Path('/no-avd'));device.emulator=Mock();device.emulator.poll.return_value=None;device.adb=Mock(return_value=value)
        with patch.object(r.time,'monotonic',side_effect=[0,before,after]),patch.object(r.time,'sleep'):
            if after>900 or value!='1':
                with self.assertRaisesRegex(r.Failure,'boot_deadline'):device.await_boot()
            else:device.await_boot()
        return device
    def test_first_one_brackets_do_not_backdate_boundary(self):
        for before,after,expected in [(599,600,'observed_by_600'),(599,601,'observation_straddles_600'),(600,601,'observation_straddles_600'),(601,602,'observed_only_after_600'),(899,900,'observed_only_after_600'),(899,901,'response_after_900_not_admitted')]:
            d=self.check_case(before,after);self.assertEqual(d.boot_observations['observation_class'],expected)
            self.assertEqual(d.boot_observations['first_exact_one'],{'start_seconds':before,'end_seconds':after})
            self.assertLessEqual(d.adb.call_args.kwargs['timeout'],900-before)
    def test_nonexact_value_never_admits_at_deadline(self):
        for value in ['','0','1 extra','true']:
            d=self.check_case(899,900,value);self.assertEqual(d.boot_observations['observation_class'],'no_exact_one_observed')

if __name__=='__main__':unittest.main()
