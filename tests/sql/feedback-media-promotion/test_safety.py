import importlib.util,unittest,hashlib
from pathlib import Path
from unittest.mock import Mock
spec=importlib.util.spec_from_file_location('worker',Path(__file__).with_name('worker.py'));w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class Tests(unittest.TestCase):
 def fixture(self):
  h=Mock();h.Q='q';h.C='c';h.fields={'service':'synthetic'}
  h.require=lambda ok,msg:None if ok else (_ for _ in ()).throw(ValueError(msg))
  h.bound_decode.return_value=b'canonical';h.storage.side_effect=[(200,b'input'),(200,b''),(200,b'canonical')];h.worker.return_value=True
  a={'source':'source','input':hashlib.sha256(b'input').hexdigest(),'key':'unique'}
  return h,a
 def test_actual_worker_order_and_receipt(self):
  h,a=self.fixture();self.assertTrue(w.process(h,a));self.assertEqual([x.args[0] for x in h.worker.call_args_list],['input_admit','start','terminal','attest']);receipt=h.worker.call_args_list[2].args[1];self.assertEqual(receipt['bytes'],9);self.assertEqual(receipt['output'],hashlib.sha256(b'canonical').hexdigest())
 def test_stale_before_put(self):
  h,a=self.fixture();h.worker.return_value=False;self.assertFalse(w.process(h,a));self.assertEqual(h.storage.call_count,0)
 def test_wrong_output_no_receipt(self):
  h,a=self.fixture();h.storage.side_effect=[(200,b'input'),(200,b''),(200,b'wrong')]
  with self.assertRaises(ValueError):w.process(h,a)
  self.assertEqual(h.worker.call_count,2)
 def test_crash_after_put_no_receipt(self):
  h,a=self.fixture()
  with self.assertRaises(RuntimeError):w.process(h,a,lambda:(_ for _ in ()).throw(RuntimeError()))
  self.assertEqual(h.storage.call_count,2);self.assertEqual(h.worker.call_count,2)
 def test_failed_put_no_receipt(self):
  h,a=self.fixture();h.storage.side_effect=[(200,b'input'),(500,b'')]
  with self.assertRaises(ValueError):w.process(h,a)
  self.assertEqual(h.worker.call_count,2)
 def test_source_guards(self):
  s=Path(__file__).with_name('fixture.sql').read_text()
  for text in ("auth.role() IS DISTINCT FROM 'service_role'",'REVOKE ALL ON ALL FUNCTIONS','auth.uid()','r.generation<>a.generation','a.cleaning','state=\'TERMINAL\'','REVOKE ALL ON FUNCTION'):
   self.assertIn(text,s)
  self.assertNotIn('DELETE FROM',s)
class Cleanup(unittest.TestCase):
 def fixture(self):
  h=Mock();h.Q='q';h.fields={'service':'synthetic'};h.worker.return_value=True
  h.require=lambda ok,msg:None if ok else (_ for _ in ()).throw(ValueError(msg))
  h.object_absent=lambda r:r==(404,b'missing');h.input_metadata_absent.return_value=True
  h.storage.side_effect=[(200,b'original'),(404,b'missing')]
  return h,{'source':'exact','input':hashlib.sha256(b'original').hexdigest()}
 def test_verified_remove_and_receipt(self):
  h,a=self.fixture();self.assertTrue(w.cleanup_input(h,a));h.remove_input.assert_called_once_with('exact')
  self.assertEqual([c.args[0] for c in h.worker.call_args_list],['input_cleanup','input_positive','input_removed'])
 def test_unknown_writer_never_reads_or_deletes(self):
  h,a=self.fixture();h.worker.return_value=False;self.assertFalse(w.cleanup_input(h,a));h.storage.assert_not_called();h.remove_input.assert_not_called()
 def test_wrong_bytes_never_deletes(self):
  h,a=self.fixture();h.storage.side_effect=[(200,b'wrong')]
  with self.assertRaises(ValueError):w.cleanup_input(h,a)
  h.remove_input.assert_not_called();self.assertEqual(h.worker.call_count,1)
 def test_delete_failure_and_crash_never_ack(self):
  for crash in (False,True):
   h,a=self.fixture()
   if not crash:h.remove_input.side_effect=RuntimeError()
   with self.assertRaises(RuntimeError):w.cleanup_input(h,a,(lambda:(_ for _ in ()).throw(RuntimeError())) if crash else lambda:None)
   self.assertNotIn('input_removed',[c.args[0] for c in h.worker.call_args_list])
 def test_absence_needs_prior_positive_receipt(self):
  h,a=self.fixture();h.storage.side_effect=[(404,b'missing')];h.worker.side_effect=[True,False]
  with self.assertRaises(ValueError):w.cleanup_input(h,a)
  h.remove_input.assert_not_called()
 def test_decoder_infrastructure_not_rejection(self):
  h,a=Tests().fixture();h.bound_decode.side_effect=RuntimeError('infrastructure')
  with self.assertRaises(RuntimeError):w.process(h,a)
  self.assertEqual([c.args[0] for c in h.worker.call_args_list],['input_admit'])

class ReceiptMutation(unittest.TestCase):
 def test_exact_patch_and_diagnostic(self):
  spec=importlib.util.spec_from_file_location('experiment',Path(__file__).with_name('experiment.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  aid='11111111-1111-4111-8111-111111111111'
  self.assertEqual(m.receipt_request('PATCH',aid)[0],'/rest/v1/fixture_promotion_receipts?id=eq.'+aid)
  self.assertEqual(m.receipt_request('POST',aid)[0],'/rest/v1/fixture_promotion_receipts')
  for method,bad in [('DELETE',aid),('PATCH',aid+'?x=1')]:
   with self.assertRaises(Exception):m.receipt_request(method,bad)
  self.assertEqual(m.receipt_diagnostic(0,'PATCH',403,{'code':'42501','message':'private'})['code'],'42501')
  self.assertEqual(m.receipt_diagnostic(0,'PATCH',400,{'code':'private','details':'private'})['code'],'OTHER')
  self.assertNotIn('private',str(m.receipt_diagnostic(0,'POST',400,{'code':'private','message':'private'})))
class RpcDispatch(unittest.TestCase):
 def test_actual_thread_helper_exact_actor_post_without_network(self):
  spec=importlib.util.spec_from_file_location('rpc_experiment',Path(__file__).with_name('experiment.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  h=object.__new__(m.Experiment);h.request=Mock(return_value=(200,b'{"issue":{},"messages":[]}'))
  payload={'p_issue_id':'11111111-1111-4111-8111-111111111111'}
  self.assertEqual(h.call('get_feedback_issue_thread','synthetic-actor',payload),(200,{'issue':{},'messages':[]}))
  h.request.assert_called_once_with('/rest/v1/rpc/get_feedback_issue_thread','synthetic-actor',payload,'POST',service=False)
  for name in ('unlisted','get_feedback_issue_thread?x=1','../get_feedback_issue_thread','get_feedback_issue_thread/','GET_FEEDBACK_ISSUE_THREAD'):
   h.request.reset_mock()
   with self.assertRaises(m.b.Failure):h.call(name,'synthetic-actor',payload)
   h.request.assert_not_called()
if __name__=='__main__':unittest.main()
