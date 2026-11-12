"""Pure fail-closed tests: no Docker, database, Auth, or network operations."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import harness as h

CONFIG = '''project_id = "old"
[api]
port = 54321
schemas = ["public", "storage"]
[db]
port = 54322
major_version = 17
shadow_port = 54320
[db.migrations]
enabled = true
[db.seed]
enabled = true
'''
class Safety(unittest.TestCase):
    def test_exact_endpoints(self):
        h.endpoint('http://127.0.0.1:55531','http',55531)
        h.endpoint('postgresql://postgres:secret@127.0.0.1:55532/postgres','postgresql',55532,'/postgres',True)
        for url in ('http://localhost:55531','https://127.0.0.1:55531','http://127.0.0.1:55421','http://remote.example:55531','http://127.0.0.1:55531/x','http://user@127.0.0.1:55531','http://127.0.0.1:55531?secret=x',' http://127.0.0.1:55531'):
            with self.subTest(url=url),self.assertRaises(h.Failure):h.endpoint(url,'http',55531)
    def test_config_disabled_implicit_execution(self):
        cfg=h.tomllib.loads(h.configure(CONFIG,'irth-v18-authority-123-1'))
        self.assertEqual(cfg['api']['port'],55531)
        self.assertEqual(cfg['api']['schemas'],['public'])
        self.assertEqual(cfg['db']['shadow_port'],55530)
        self.assertFalse(cfg['db']['migrations']['enabled']);self.assertFalse(cfg['db']['seed']['enabled'])
        for bad in ('prod','irth-v18-authority-../../bad','irth-v18-authority-1-1\n'):
            with self.assertRaises(h.Failure):h.configure(CONFIG,bad)
        with self.assertRaises(h.Failure):h.configure(CONFIG.replace('major_version = 17','major_version = 16'),'irth-v18-authority-1-1')
    def test_status_rejects_conflict(self):
        fields={'API_URL':'http://127.0.0.1:55531','DB_URL':'postgresql://postgres:x@127.0.0.1:55532/postgres','ANON_KEY':'anon','SERVICE_ROLE_KEY':'service'}
        self.assertEqual(h.status_fields(fields)['anon'],'anon')
        with self.assertRaises(h.Failure):h.status_fields(dict(fields,api={'url':'https://remote.example'}))
    def test_redirect_denied(self):
        with self.assertRaises(h.Failure):h.NoRedirect().redirect_request(None,None,302,'',{},'https://remote.example')
    def test_not_github_rejected(self):
        with patch.dict(os.environ,{},clear=True),self.assertRaises(h.Failure):h.Harness()
    def make(self,root):
        env={'GITHUB_REF':'refs/heads/v18-01a-outbox-recovery','GITHUB_SHA':'a'*40,'GITHUB_ACTIONS':'true','RUNNER_TEMP':root,'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1','SUPABASE_ACCESS_TOKEN':'secret','PGSERVICE':'remote','DATABASE_URL':'remote','DOCKER_HOST':'tcp://remote','DOCKER_CONTEXT':'remote'}
        with patch.dict(os.environ,env,clear=True): obj=h.Harness()
        return obj
    def test_environment_scrubbed_and_socket_pinned(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.make(root)
            self.assertEqual(obj.env['DOCKER_HOST'],'unix:///var/run/docker.sock')
            self.assertNotIn('DOCKER_CONTEXT',obj.env)
            self.assertNotIn('SUPABASE_ACCESS_TOKEN',obj.env)
            self.assertNotIn('PGSERVICE',obj.env)
            self.assertNotIn('DATABASE_URL',obj.env)
            self.assertEqual(obj.env['HOME'],str(obj.work/'private-home'))
    def prepared(self,root):
        obj=self.make(root);(obj.work/'supabase').mkdir(parents=True)
        (obj.work/'supabase/config.toml').write_text(h.configure(CONFIG,obj.project))
        obj.fields={'api':'http://127.0.0.1:55531','db':'postgresql://postgres:x@127.0.0.1:55532/postgres','anon':'a','service':'s'}
        return obj
    def test_isolation_rejects_linked_and_migrations(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.prepared(root);obj.isolation()
            linked=obj.work/'supabase/.temp/project-ref';linked.parent.mkdir();linked.write_text('remote')
            with self.assertRaises(h.Failure):obj.isolation()
            linked.unlink();migration=obj.work/'supabase/migrations/bad.sql';migration.parent.mkdir();migration.write_text('select 1')
            with self.assertRaises(h.Failure):obj.isolation()
    def test_wrong_container_identity_cannot_enable_endpoints(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.prepared(root)
            record={'Name':'/supabase_db_'+obj.project,'Config':{'Labels':{'com.supabase.cli.project':'other'},'Image':'image'},'State':{'Running':True},'NetworkSettings':{'Ports':{'5432/tcp':[{'HostPort':str(h.DB_PORT)}]}}}
            with patch.object(obj,'command',return_value=json.dumps([record])),self.assertRaises(h.Failure):obj.containers()
            self.assertFalse(obj.endpoints_verified)
            record['Config']['Labels']['com.supabase.cli.project']=obj.project
            record['NetworkSettings']['Ports']['5432/tcp'][0]['HostPort']='54322'
            with patch.object(obj,'command',return_value=json.dumps([record])),self.assertRaises(h.Failure):obj.containers()
            self.assertFalse(obj.endpoints_verified)
    def test_cleanup_symlink_never_invokes_cli(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.make(root);outside=Path(root)/'outside';outside.mkdir();obj.work.symlink_to(outside,target_is_directory=True)
            with patch.object(obj,'cli') as cli,self.assertRaises(h.Failure):obj.cleanup()
            cli.assert_not_called()
    def test_no_sql_or_http_before_container_verification(self):
        obj=h.Harness.__new__(h.Harness);obj.endpoints_verified=False
        with self.assertRaises(h.Failure):obj.sql('select 1')
        with self.assertRaises(h.Failure):obj.request('/rest/v1/')
    def test_subprocess_failure_redacted(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.prepared(root)
            result=subprocess.CompletedProcess(['supabase','status'],1,'SECRET-TOKEN','SECRET-PASSWORD')
            with patch.object(h.subprocess,'run',return_value=result),self.assertRaises(h.Failure) as error:obj.command(['supabase','status'])
            self.assertNotIn('SECRET',str(error.exception));self.assertNotIn('SECRET',json.dumps(obj.report))
    def test_cleanup_exact_project_only(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.prepared(root)
            with patch.object(obj,'cli') as cli:
                obj.cleanup();cli.assert_called_once_with('stop','--project-id',obj.project,'--no-backup',timeout=120)
            (obj.work/'supabase/config.toml').write_text(CONFIG)
            with patch.object(obj,'cli') as cli,self.assertRaises(h.Failure):obj.cleanup()
            cli.assert_not_called()
    def test_rejection_requires_expected_semantics(self):
        self.assertTrue(h.Harness.rejection((400,{'message':'prototype:foreign-evidence','code':'P0001'}),'prototype:foreign-evidence'))
        for response in ((200,{}),(500,{'message':'prototype:foreign-evidence'}),(404,{'code':'unrelated'}),(401,'bad')):
            self.assertFalse(h.Harness.rejection(response,codes=('42501',)))
    def test_mode_is_required_and_source_has_no_claim_fixtures(self):
        source=Path(h.__file__).read_text()
        self.assertIn('choices=("run", "cleanup")',source)
        self.assertNotIn("set_config('request.jwt",source)
        self.assertNotIn('SET request.jwt',source)
        self.assertNotIn('print(self.fields',source)
        self.assertNotIn('print(transaction',source)
    def test_run_failure_still_cleans_and_writes_safe_report(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.make(root)
            with patch.object(obj,'command',side_effect=h.Failure('fixed safe failure')),patch.object(obj,'cleanup') as cleanup:
                self.assertEqual(obj.run(),1);cleanup.assert_called_once()
            report=json.loads((obj.evidence/'acceptance.json').read_text())
            self.assertEqual(report['result'],'FAIL');self.assertEqual(report['failure'],'fixed safe failure')
if __name__=='__main__':unittest.main()
