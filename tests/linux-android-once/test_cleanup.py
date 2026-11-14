import json, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import owned_process as o
import restore as fallback

class Tests(unittest.TestCase):
    def state(self,root):
        row={'pid':12345,'start':'100','group':12345,'session':12345,'uid':os.getuid()}
        p=Path(root)/'irth-linux-emulator-owner.json';p.write_text(json.dumps(row));p.chmod(0o600)
        return row,p
    def test_absent_state_dispatches_nothing(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}),patch.object(o.os,'killpg') as kill:
            o.cleanup();kill.assert_not_called()
    def test_replaced_leader_never_signalled(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}):
            row,p=self.state(root)
            with patch.object(o,'identity',return_value={**row,'start':'200'}),patch.object(o.os,'killpg') as kill:
                with self.assertRaises(ValueError):o.cleanup()
                kill.assert_not_called();self.assertTrue(p.exists())
    def test_absent_leader_existing_group_not_killed(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}):
            self.state(root)
            with patch.object(o,'identity',side_effect=FileNotFoundError),patch.object(o.os,'killpg') as kill:
                with self.assertRaises(ValueError):o.cleanup()
                kill.assert_called_once_with(12345,0)
    def test_reaped_group_record_removed(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}):
            _,p=self.state(root)
            with patch.object(o,'identity',side_effect=FileNotFoundError),patch.object(o.os,'killpg',side_effect=ProcessLookupError):o.cleanup()
            self.assertFalse(p.exists())
    def test_fallback_restore_independent_of_cleanup_failure(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root,'ANDROID_HOME':'/sdk'}),patch.object(fallback.owned_process,'cleanup',side_effect=ValueError),patch.object(fallback.subprocess,'run',side_effect=RuntimeError),patch.object(fallback,'KvmAccess') as acl:
            acl.return_value.restore.return_value={'restoration':'verified_exact_acl_identity_mode'}
            self.assertEqual(fallback.restore(),1);acl.return_value.restore.assert_called_once()
            r=json.loads((Path(root)/'irth-linux-evidence/restoration.json').read_text());self.assertTrue(r['acl_restored']);self.assertFalse(r['owned_process_cleanup'])
    def test_fallback_no_mutation_does_not_claim_restoration(self):
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root,'ANDROID_HOME':'/sdk'}),patch.object(fallback.owned_process,'cleanup'),patch.object(fallback,'KvmAccess') as acl:
            acl.return_value.restore.return_value={'restoration':'not_needed'}
            self.assertEqual(fallback.restore(),0)
            r=json.loads((Path(root)/'irth-linux-evidence/restoration.json').read_text());self.assertFalse(r['acl_restored']);self.assertTrue(r['acl_cleanup_complete']);self.assertEqual(r['acl_restoration'],'not_needed')
    def test_device_close_replaced_leader_never_signals(self):
        import experiment as e
        from unittest.mock import Mock
        import subprocess
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}):
            row,_=self.state(root);d=e.LinuxDevice(Path('/sdk'),Path(root)/'avd');d.emulator=Mock(pid=12345);d.emulator.poll.return_value=None;d.emulator.wait.side_effect=subprocess.TimeoutExpired('owned',10)
            with patch.object(d,'adb'),patch.object(e.os,'getpgid',return_value=12345),patch.object(o,'identity',return_value={**row,'start':'changed'}),patch.object(o.os,'killpg') as kill:
                with self.assertRaises(ValueError):d.close()
                kill.assert_not_called()
    def test_device_close_term_kill_rechecks_same_identity(self):
        import experiment as e
        from unittest.mock import Mock
        import subprocess, signal
        with tempfile.TemporaryDirectory() as root,patch.dict(os.environ,{'RUNNER_TEMP':root}):
            row,_=self.state(root);d=e.LinuxDevice(Path('/sdk'),Path(root)/'avd');d.emulator=Mock(pid=12345);d.emulator.poll.return_value=None;d.emulator.wait.side_effect=[subprocess.TimeoutExpired('owned',10),subprocess.TimeoutExpired('owned',5),0]
            with patch.object(d,'adb'),patch.object(e.os,'getpgid',return_value=12345),patch.object(o,'identity',return_value=row) as ident,patch.object(o.os,'killpg') as kill,patch.object(e.r.Device,'close'),patch.object(o,'cleanup'):
                d.close();self.assertEqual(ident.call_count,2);self.assertEqual([c.args for c in kill.call_args_list],[(12345,signal.SIGTERM),(12345,signal.SIGKILL)])
if __name__=='__main__':unittest.main()
