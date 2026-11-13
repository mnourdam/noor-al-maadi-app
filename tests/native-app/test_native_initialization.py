"""Mocked clock/ADB capture only; no native process or application is started."""
import importlib.util,json,subprocess,unittest
from pathlib import Path
from unittest.mock import Mock,patch

def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
n=load('native_initialization');r=load('runner');p=load('launch_reconciliation')
def row(value='',state='complete',code=0):return {'raw':value.encode(),'state':state,'returncode':code}
def socket(name='@webview_devtools_remote_123456'):
    return row('Num RefCount Protocol Flags Type St Inode Path\n000: 00000002 00000000 00010000 0001 01 123 '+name)
class Observer(unittest.TestCase):
    def setUp(self):
        self.clock=[0];self.guest=Mock();self.device=Mock(sdk=Path('/sdk'),serial='emulator-5580');self.calls=[]
        self.identity={'origin':'launch_reconciliation_same_process','process':'123456'}
        self.receipt={'failure_category':'TimeoutExpired','dispatch_attempted':True,'command_completed':False,'stage':'launch_command'}
        def capture(args,**kwargs):
            self.calls.append((args,kwargs));self.clock[0]+=.1
            if args[-2:]==['pidof',r.PACKAGE]:return row('123456')
            if args[-2:]==['cat','/proc/net/unix']:return socket()
            if 'dumpsys' in args:return row('topResumedActivity=ActivityRecord{ab u0 '+r.PACKAGE+'/'+r.ACTIVITY+' t1}')
            if 'logcat' in args:return row('D/Capacitor(123456): Starting BridgeActivity\nD/Capacitor(123456): App resumed')
            raise AssertionError('unexpected')
        self.guest.capture.side_effect=capture
    def run_case(self,verified=True):
        with patch.object(n,'load',side_effect=lambda name:self.guest if name=='guest_boot_diagnostics' else p),patch.object(n.time,'monotonic',side_effect=lambda:self.clock[0]),patch.object(n.time,'sleep',side_effect=lambda seconds:self.clock.__setitem__(0,self.clock[0]+seconds)):
            return n.observe(self.device,r.PACKAGE,r.ACTIVITY,self.identity,self.receipt,verified)
    def test_all_positive_is_observation_not_acceptance_no_actions(self):
        before=json.dumps(self.receipt,sort_keys=True);out=self.run_case()
        self.assertEqual(before,json.dumps(self.receipt,sort_keys=True));self.assertEqual(out['status'],'observation_complete_not_acceptance');self.assertFalse(out['release_ready'])
        self.assertEqual(len(out['samples']),4);self.assertTrue(out['log_tail']['hints']['bridge_app_resumed']);self.assertEqual(len(self.calls),18)
        self.assertNotIn('123456',json.dumps(out));self.device.adb.assert_not_called()
        self.assertTrue(all(c[1]['timeout']<=2 for c in self.calls));self.assertEqual(sum('logcat' in c[0] for c in self.calls),1)
    def test_admission_negatives_perform_no_commands_or_import(self):
        for key,value in [('failure_category','command_failed'),('dispatch_attempted',False),('command_completed',True),('stage','other')]:
            self.setUp();self.receipt[key]=value
            with patch.object(n,'load') as importer:out=n.observe(self.device,r.PACKAGE,r.ACTIVITY,self.identity,self.receipt,True)
            self.assertEqual(out['status'],'not_admitted');importer.assert_not_called()
        for identity in [{},{'origin':'fresh','process':'123456'},{'origin':'launch_reconciliation_same_process','process':'123 456'}]:
            self.identity=identity;self.assertEqual(self.run_case()['status'],'not_admitted');self.guest.capture.assert_not_called()
        self.setUp();self.assertEqual(self.run_case(False)['status'],'not_admitted');self.guest.capture.assert_not_called()
    def test_pid_uncertainty_stops_before_or_after_every_observation(self):
        # Capture positions 13/15 bracket activity;16/18 bracket log. No successor chosen.
        for position in (1,3,13,15,16,18):
            for bad in [row('999999'),row('',code=1),row('123456 999999'),row('',state='timeout')]:
                self.setUp();original=self.guest.capture.side_effect
                def capture(args,_count=[0],**kwargs):
                    _count[0]+=1
                    return bad if _count[0]==position else original(args,**kwargs)
                self.guest.capture.side_effect=capture;out=self.run_case()
                self.assertEqual(out['status'],'identity_uncertain_stopped');self.assertEqual(self.guest.capture.call_count,position)
                if position==18:self.assertNotIn('log_tail',out)
    def test_exhausted_budget_no_next_probe_and_no_late_admission(self):
        original=self.guest.capture.side_effect
        def capture(args,**kwargs):
            value=original(args,**kwargs);self.clock[0]=61;return value
        self.guest.capture.side_effect=capture;out=self.run_case()
        self.assertEqual(out['status'],'budget_exhausted');self.assertEqual(self.guest.capture.call_count,1)
        self.setUp()
        with patch.object(n,'load',side_effect=lambda name:self.guest if name=='guest_boot_diagnostics' else p),patch.object(n.time,'monotonic',side_effect=[0,61,61,61,61,61]):
            out=n.observe(self.device,r.PACKAGE,r.ACTIVITY,self.identity,self.receipt,True)
        self.guest.capture.assert_not_called();self.assertEqual(out['status'],'budget_exhausted')
    def test_owned_probe_cleanup_failure_stops_more_reads(self):
        for state in ('cleanup_failed','reap_failed'):
            self.setUp();self.guest.capture.return_value=row(state=state);self.guest.capture.side_effect=None
            out=self.run_case();self.assertEqual(out['status'],'capture_cleanup_failed_stopped');self.assertEqual(self.guest.capture.call_count,1)
    def test_marker_exactness_pid_and_truncation(self):
        for text in ['D/Capacitor(123456): Starting BridgeActivity extra','D/Other(123456): App resumed']:
            self.assertFalse(any(n.log_markers(row(text),'123456')['hints'].values()))
        for bad in [row('D/Capacitor(2): App resumed'),row('bad format'),row('D/Capacitor(123456): App resumed',state='truncated')]:
            result=n.log_markers(bad,'123456');self.assertTrue(result['status'].startswith('unavailable'));self.assertFalse(any(result['hints'].values()))
        self.assertTrue(n.log_markers(row('D/Capacitor   ( 123456): App resumed'),'123456')['hints']['bridge_app_resumed'])
    def test_original_timeout_survives_observer_import_collect_or_positive(self):
        for mode in ('import','observe','positive'):
            error=subprocess.TimeoutExpired('private launch',15);device=Mock();device.adb.side_effect=['1',error];receipt={};reconcile=Mock();observer=Mock()
            reconcile.collect.return_value={'status':'observations_only'}
            observer.observe.return_value={'status':'observation_complete_not_acceptance','release_ready':False}
            if mode=='observe':observer.observe.side_effect=ValueError('private detail')
            def spec(name,path):
                result=Mock(name=name)
                if name=='native_initialization' and mode=='import':result.loader.exec_module.side_effect=ValueError('secret')
                result.key=name;return result
            with patch.object(r.importlib.util,'spec_from_file_location',side_effect=spec),patch.object(r.importlib.util,'module_from_spec',side_effect=lambda spec:reconcile if spec.key=='launch_reconciliation' else observer):
                with self.assertRaises(subprocess.TimeoutExpired) as caught:r.launch_once(device,receipt,verified_install=True)
            self.assertIs(caught.exception,error);self.assertFalse(receipt['command_completed']);self.assertEqual(device.adb.call_count,2);self.assertNotIn('private',json.dumps(receipt));self.assertIn('native_initialization',receipt)
    def test_non_timeout_or_unverified_does_not_import_observer(self):
        for error,verified in [(ValueError('secret'),True),(subprocess.TimeoutExpired('secret',15),False)]:
            device=Mock();device.adb.side_effect=['1',error];receipt={};helper=Mock()
            with patch.object(r.importlib.util,'spec_from_file_location',return_value=Mock()) as imports,patch.object(r.importlib.util,'module_from_spec',return_value=helper):
                with self.assertRaises(type(error)):r.launch_once(device,receipt,verified_install=verified)
            self.assertEqual(imports.call_count,1);self.assertNotIn('native_initialization',receipt)
    def test_internal_pid_binding_never_serialized(self):
        guest=Mock();guest.capture.side_effect=[row('123456'),row('mResumedActivity: ActivityRecord{ab u0 '+r.PACKAGE+'/'+r.ACTIVITY+' t1}'),socket(),row('123456')];identity={}
        with patch.object(p.importlib.util,'spec_from_file_location',return_value=Mock()),patch.object(p.importlib.util,'module_from_spec',return_value=guest):out=p.collect(self.device,r.PACKAGE,r.ACTIVITY,identity)
        self.assertEqual(identity,self.identity);self.assertNotIn('123456',json.dumps(out))
    def test_prior_reconciliation_unclean_socket_never_admits_observer(self):
        for state in ('cleanup_failed','reap_failed','truncated','timeout'):
            guest=Mock();guest.capture.side_effect=[row('123456'),row('mResumedActivity: ActivityRecord{ab u0 '+r.PACKAGE+'/'+r.ACTIVITY+' t1}'),row(state=state),row('123456')];identity={}
            with patch.object(p.importlib.util,'spec_from_file_location',return_value=Mock()),patch.object(p.importlib.util,'module_from_spec',return_value=guest):p.collect(self.device,r.PACKAGE,r.ACTIVITY,identity)
            self.assertEqual(identity,{})
            with patch.object(n,'load') as importer:out=n.observe(self.device,r.PACKAGE,r.ACTIVITY,identity,self.receipt,True)
            importer.assert_not_called();self.assertEqual(out['status'],'not_admitted')
if __name__=='__main__':unittest.main()
