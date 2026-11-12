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
    def admin_prepared(self, root):
        obj=self.prepared(root);obj.endpoints_verified=True
        obj.db_identity={'id':'a'*64,'image':h.ADMIN_IMAGE_ID,'name':'supabase_db_'+obj.project}
        obj.report['containers']=[{'component':'db','image_id':h.ADMIN_IMAGE_ID,'image':h.ADMIN_IMAGE_REFERENCE,'repo_digests':[h.ADMIN_IMAGE_DIGEST]}]
        obj.admin_socket='/tmp'
        return obj
    def test_admin_refuses_unverified_container(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.prepared(root);obj.admin_socket='/tmp'
            with patch.object(obj,'command') as command,self.assertRaises(h.Failure):obj.socket_admin_sql('SELECT 1;')
            command.assert_not_called()
    def test_admin_container_identity_must_not_change(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root)
            good={'Id':'a'*64,'Name':'/'+obj.db_identity['name'],'Image':obj.db_identity['image'],'Config':{'Labels':{'com.supabase.cli.project':obj.project}},'State':{'Running':True},'NetworkSettings':{'Ports':{'5432/tcp':[{'HostPort':str(h.DB_PORT)}]}}}
            for field,value in (('Id','c'*64),('Image','sha256:'+'d'*64),('Name','/other')):
                with patch.object(obj,'command',return_value=json.dumps([dict(good,**{field:value})])) as command,self.assertRaises(h.Failure):obj.socket_admin_sql('SELECT 1;')
                self.assertEqual(command.call_count,1)
    def test_admin_command_contains_only_fixed_role_and_private_env_reference(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root)
            with patch.object(obj,'verify_admin_container',return_value='a'*64),patch.object(obj,'command',return_value='t') as command:
                self.assertEqual(obj.socket_admin_sql('SELECT true;'),'t')
            args=command.call_args.args[0];script=args[-1];sql=command.call_args.kwargs['input']
            self.assertEqual(args[:6],['docker','exec','-i','a'*64,'/bin/sh','-c'])
            self.assertIn('-w -h /tmp -p 5432 -U supabase_admin -d postgres',script)
            self.assertIn('PGPASSWORD="$POSTGRES_PASSWORD"',script)
            self.assertIn("session_user IS DISTINCT FROM 'supabase_admin'",sql)
            self.assertIn('inet_client_addr() IS NOT NULL',sql)
            self.assertIn('rolsuper AND rolcanlogin',sql)
            self.assertNotIn('ALTER ROLE',sql)
    def test_admin_unknown_image_cannot_execute(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root);obj.report['containers'][0]['image_id']='unreviewed'
            with patch.object(obj,'command') as command,self.assertRaises(h.Failure):obj.socket_admin_sql('SELECT 1;')
            command.assert_not_called()
    def test_enabled_admin_route_still_guards_every_sql_call(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root);obj.socket_admin=True
            with patch.object(obj,'verify_admin_container',return_value='a'*64) as verify,patch.object(obj,'command',return_value='t') as command:
                obj.sql('SELECT 1;');obj.sql('SELECT 2;')
            self.assertEqual(verify.call_count,2)
            for call in command.call_args_list:
                sql=call.kwargs['input']
                self.assertLess(sql.index("current_user IS DISTINCT FROM 'supabase_admin'"),sql.index('END $$;'))
                self.assertTrue(sql.strip().endswith(('SELECT 1;','SELECT 2;')))
    def test_admin_wrong_role_session_never_enabled(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root)
            replies=[json.dumps({'superuser':False,'create_role':True}),'t','/tmp']
            wrong={'role':'postgres','session':'postgres','database':'postgres','superuser':False,'socket':True}
            with patch.object(obj,'sql',side_effect=replies),patch.object(obj,'socket_admin_sql',return_value=json.dumps(wrong)),self.assertRaises(h.Failure):obj.select_local_admin()
            self.assertFalse(obj.socket_admin)
    def test_admin_absent_catalog_or_unknown_socket_never_attempted(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root)
            for replies in ([json.dumps({'superuser':False}),'f'],[json.dumps({'superuser':False}),'t','/unreviewed']):
                with patch.object(obj,'sql',side_effect=replies),patch.object(obj,'socket_admin_sql') as command,self.assertRaises(h.Failure):obj.select_local_admin()
                command.assert_not_called();self.assertFalse(obj.socket_admin)
    def test_admin_exact_session_enables_only_local_route(self):
        with tempfile.TemporaryDirectory() as root:
            obj=self.admin_prepared(root)
            exact={'role':'supabase_admin','session':'supabase_admin','database':'postgres','superuser':True,'socket':True}
            with patch.object(obj,'sql',side_effect=[json.dumps({'superuser':False}),'t','/tmp']),patch.object(obj,'socket_admin_sql',return_value=json.dumps(exact)):obj.select_local_admin()
            self.assertTrue(obj.socket_admin);self.assertEqual(obj.report['admin_session'],exact)
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
