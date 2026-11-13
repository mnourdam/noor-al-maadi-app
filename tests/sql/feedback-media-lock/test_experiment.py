import importlib.util,json,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('experiment',Path(__file__).with_name('experiment.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Guards(unittest.TestCase):
 def test_unsigned_key(self):
  p='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003'
  self.assertEqual(m.object_key(p),self.reference('feedback-images/'+p));self.assertGreaterEqual(m.object_key(p),0);self.assertLess(m.object_key(p),2**32)
 def reference(self,s):
  h=5381
  for c in s:h=((h*33)^ord(c))%2**32
  return h
 def test_path_rejected(self):
  for p in ('x','a;DROP','../x',''):
   with self.assertRaises((m.b.Failure,ValueError)):m.object_key(p)
 def test_all_three_required(self):
  rows=[{'path':'/app/dist/'+n+'.js','sha256':h} for n,h in m.COMPILED.items()]
  self.assertTrue(m.correspondence(rows));self.assertFalse(m.correspondence(rows[:-1]));rows[0]['sha256']='0'*64;self.assertFalse(m.correspondence(rows))
 def test_timeout_never_denial(self):
  self.assertEqual(m.upload_category(None),'TRANSPORT_OR_REQUEST_TIMEOUT')
  for code in ('LockTimeout','DatabaseTimeout','InternalError','Unknown','AccessDenied'):
   self.assertNotEqual(m.upload_category((500,json.dumps({'code':code}).encode())),'KNOWN_PERMISSION_FAILURE')
 def test_permission_and_acceptance(self):
  self.assertEqual(m.upload_category((403,b'{"code":"AccessDenied"}')),'KNOWN_PERMISSION_FAILURE')
  self.assertEqual(m.upload_category((200,b'{}')),'ACCEPTED')
  self.assertEqual(m.upload_category((403,b'not json')),'OTHER_HTTP_FAILURE')
 def test_sanitized_diagnostics_do_not_broaden_denial(self):
  body=json.dumps({'code':'AccessDenied','error':'Forbidden','statusCode':'403','message':'private details','token':'secret'}).encode()
  self.assertEqual(m.response_diagnostic((403,body)),{'code':'AccessDenied','error':'Forbidden','statusCode':403})
  legacy=(403,b'{"error":"Forbidden","statusCode":403}')
  self.assertEqual(m.upload_category(legacy),'OTHER_HTTP_FAILURE')
  self.assertEqual(m.response_diagnostic(legacy),{'error':'Forbidden','statusCode':403})
  for body in (b'[]',b'invalid',b'{"code":"secret","error":"unrecognized","statusCode":true}',b'{"statusCode":"999","message":"secret"}'):
   self.assertEqual(m.response_diagnostic((400,body)),{})
 def test_reproduction(self):
  evidence=json.loads(Path(__file__).with_name('portable-comparison.json').read_text())
  self.assertTrue(evidence['all_match']);self.assertEqual(len(evidence['comparisons']),3)
  self.assertFalse(evidence['target_modules_executed'])
  import hashlib
  self.assertEqual(evidence['script_sha256'],hashlib.sha256(Path(__file__).with_name('reproduce.cjs').read_bytes()).hexdigest())
 def test_workflow_scope(self):
  text=(Path(__file__).resolve().parents[3]/'.github/workflows/v18-feedback-media-lock.yml').read_text()
  self.assertIn('contents: read',text);self.assertIn('branches: [v18-01a-outbox-recovery]',text)
  paths=text.split('    paths:\n')[1].split('  workflow_dispatch:')[0]
  self.assertEqual([x.strip()[3:-1] for x in paths.strip().splitlines()],[ '.github/workflows/v18-feedback-media-lock.yml','tests/sql/feedback-media-lock/**'])

class WallBounds(unittest.TestCase):
 def test_request_timeout_kills_and_reaps(self):
  from unittest.mock import Mock
  r=m.BoundedRequest.__new__(m.BoundedRequest)
  r.clock=lambda:100;r.deadline=101;r.reader=Mock();r.reader.poll.return_value=False
  r.process=Mock();r.process.is_alive.side_effect=[True,False]
  self.assertIsNone(r.finish());r.reader.poll.assert_called_once_with(1)
  r.process.kill.assert_called_once();r.process.join.assert_called_once_with(timeout=2);r.reader.close.assert_called_once()
 def test_controller_failure_still_retires_request(self):
  from unittest.mock import Mock
  request=Mock();request.finish.return_value=None
  def fail():raise ValueError('controller')
  with self.assertRaisesRegex(ValueError,'controller'):m.finalize_resources(fail,request)
  request.finish.assert_called_once()
  request.finish.side_effect=RuntimeError('child')
  with self.assertRaisesRegex(ValueError,'controller'):m.finalize_resources(fail,request)
 def test_sql_uses_preverified_args_only(self):
  from unittest.mock import Mock,patch
  h=m.Experiment.__new__(m.Experiment);h.fixed_admin_args=['fixed'];h.env={};h.work='.'
  h.admin_args=Mock(side_effect=AssertionError('guard entered timed interval'))
  with patch.object(m.subprocess,'run',side_effect=m.subprocess.TimeoutExpired('fixed',2)) as run:
   self.assertEqual(h.bounded_sql('select 1',timeout=2),(False,''))
   self.assertEqual(run.call_args.args[0],['fixed']);self.assertEqual(run.call_args.kwargs['timeout'],2)
  h.admin_args.assert_not_called()
 def test_postretirement_same_waiter_and_holder(self):
  row={'pid':42,'role':'supabase_storage_admin','waiting':True,'blocked':True,'holder':True,'query':True}
  self.assertEqual(m.exact_waiter([row],42),42)
  self.assertIsNone(m.exact_waiter([row],43));self.assertIsNone(m.exact_waiter([row,row],42))
  for k in ('waiting','blocked','holder','query'):
   self.assertIsNone(m.exact_waiter([dict(row,**{k:False})],42))
 def test_outcome_never_greens_late_accept_or_lost_order(self):
  e={'post_retirement_waiter':True,'controller_released':True,'retirement':'COMMITTED','upload':'KNOWN_PERMISSION_FAILURE','service_visibility':'RECOGNIZED_ABSENCE','metadata_count':0,'reservation_count':0,'queue_count':1}
  self.assertTrue(m.observation_result(e).startswith('LOCAL STACK PASS'))
  self.assertTrue(m.observation_result(dict(e,upload='ACCEPTED')).startswith('COUNTEREXAMPLE'))
  for delta in ({'post_retirement_waiter':False},{'controller_released':False},{'upload':'NATIVE_LOCK_OR_DATABASE_TIMEOUT'},{'metadata_count':1},{'queue_count':0},{'reservation_count':1},{'service_visibility':'OTHER_HTTP_RESULT'}):
   self.assertTrue(m.observation_result(dict(e,**delta)).startswith('UNSUPPORTED'))

class RealProcessControls(unittest.TestCase):
 def test_noncooperating_child_deadline_and_reap(self):
  import time,os
  def stall():
   time.sleep(30)
   return 200,b'late'
  started=time.monotonic();request=m.BoundedRequest(stall,seconds=.08);pid=request.process.pid
  self.assertIsNone(request.finish())
  self.assertLess(time.monotonic()-started,3)
  self.assertFalse(request.process.is_alive())
  self.assertIsNotNone(request.process.exitcode)
  with self.assertRaises(ProcessLookupError):os.kill(pid,0)
 def test_small_child_success(self):
  request=m.BoundedRequest(lambda:(200,b'synthetic'),seconds=2)
  self.assertEqual(request.finish(),(200,b'synthetic'))
  self.assertFalse(request.process.is_alive())
 def test_controller_termination_is_session_and_key_scoped(self):
  marker='irth_lock_'+'a'*32
  sql=m.terminate_controller_sql(123,marker,4294967295)
  for clause in ("a.pid=123", "a.application_name='"+marker+"'", "a.datname=current_database()", "a.usename='supabase_admin'", "l.pid=a.pid", "l.granted", "l.classid=0", "l.objid=4294967295", "l.objsubid=1"):
   self.assertIn(clause,sql)
  self.assertNotIn('pg_terminate_backend(123)',sql)
  for bad in ('irth_lock_bad',"irth_lock_'"+'a'*31):
   with self.assertRaises(m.b.Failure):m.terminate_controller_sql(123,bad,1)

if __name__=='__main__':unittest.main()
