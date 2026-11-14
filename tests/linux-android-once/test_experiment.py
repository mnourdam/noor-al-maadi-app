import importlib.util, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import experiment as e

class Device:
    def __init__(self,*a):self.versions={};self.boot_observations={};self.actions=[];self.sdk=Path('/sdk');self.closed=False
    def provision(self):pass
    def verify_acceleration(self):pass
    def boot(self):pass
    def launch(self,*a,**kw):self.actions.append('launch')
    def close(self):self.closed=True
class Lease:
    restored=0
    def acquire(self):return {'grant':'verified_named_uid_only'}
    def restore(self):Lease.restored+=1;return {'restoration':'verified_exact_acl_identity_mode'}
class Page:
    def __init__(self,d):self.readiness_checks={'javascript_control':True};self.readiness_phase='native_bridge'
    def readiness(self):raise RuntimeError('synthetic')
    def close(self):pass
class Tests(unittest.TestCase):
    def exercise(self,device=Device,page=Page,lease=Lease):
        import json
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ,{'RUNNER_TEMP':root,'ANDROID_HOME':'/sdk'}),patch.object(e.r,'require_ci'),patch.object(e,'LinuxDevice',device),patch.object(e,'KvmAccess',lease),patch.object(e.r,'Page',page),patch.object(e.r,'verify_apk',return_value={'apk_sha256':'a'*64}),patch.object(e.r,'install_once') as install,patch.object(e.r,'command'),patch.object(e.visual,'observe',return_value={'screen_observed':True}) as screen:
            code=e.execute('/apk','/receipt',str(Path(root)/'irth-linux-evidence'))
            return code,json.loads((Path(root)/'irth-linux-evidence/result.json').read_text()),install.call_count,screen.call_count
    def test_bridge_failure_retains_screen_and_single_launch(self):
        code,r,inst,screen=self.exercise();self.assertEqual(code,1);self.assertTrue(r['visual']['screen_observed']);self.assertEqual(r['native_actions'],['launch']);self.assertEqual((inst,screen),(1,1));self.assertTrue(r['acl_restored']);self.assertEqual(r['six_feature_journeys'],'NOT_EXECUTED')
    def test_launch_failure_screen_but_no_readiness(self):
        class D(Device):
            def launch(self,*a,**kw):self.actions.append('launch');raise TimeoutError()
        with patch.object(Page,'readiness') as ready:
            code,r,_,screen=self.exercise(device=D);ready.assert_not_called();self.assertEqual(screen,1);self.assertEqual(code,1)
    def test_cleanup_error_does_not_skip_restore(self):
        class D(Device):
            def close(self):raise RuntimeError()
        before=Lease.restored;_,r,_,_=self.exercise(device=D);self.assertGreater(Lease.restored,before);self.assertFalse(r['cleanup_complete'])
    def test_permission_error_no_boot_install_launch(self):
        class L(Lease):
            def acquire(self):raise PermissionError()
        _,r,inst,screen=self.exercise(lease=L);self.assertEqual((inst,screen),(0,0));self.assertTrue(r['acl_restored'])
    def test_restore_error_blocks_success(self):
        class P(Page):
            def readiness(self):pass
        class L(Lease):
            def restore(self):raise RuntimeError()
        code,r,_,_=self.exercise(page=P,lease=L);self.assertEqual(code,1);self.assertEqual(r['result'],'BLOCKED')
    def test_workflow_scope(self):
        root=Path(__file__).resolve().parents[2]
        s=(root/'.github/workflows/v18-linux-android-once.yml').read_text()
        self.assertNotIn("'tests/linux-android-once/**'",s);self.assertNotIn("'tests/native-app/**'",s)
        self.assertIn("'.github/workflows/v18-linux-android-once.yml'",s)
        self.assertNotIn("github.event_name == 'workflow_dispatch'",s)
        self.assertEqual(s.count('runs-on: ubuntu-24.04'),2)
        self.assertIn('artifact-ids: ${{ needs.build.outputs.artifact_id }}',s)
        self.assertIn('tests/native-app/transfer.py verify',s)
        self.assertIn('if: always()\n        run: python3 tests/linux-android-once/restore.py',s)
        self.assertNotIn('chmod',s);self.assertNotIn('usermod',s)
if __name__=='__main__':unittest.main()
