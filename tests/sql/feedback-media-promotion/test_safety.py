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
  h,a=self.fixture();self.assertTrue(w.process(h,a));self.assertEqual([x.args[0] for x in h.worker.call_args_list],['start','terminal','attest']);receipt=h.worker.call_args_list[1].args[1];self.assertEqual(receipt['bytes'],9);self.assertEqual(receipt['output'],hashlib.sha256(b'canonical').hexdigest())
 def test_stale_before_put(self):
  h,a=self.fixture();h.worker.return_value=False;self.assertFalse(w.process(h,a));self.assertEqual(h.storage.call_count,1)
 def test_wrong_output_no_receipt(self):
  h,a=self.fixture();h.storage.side_effect=[(200,b'input'),(200,b''),(200,b'wrong')]
  with self.assertRaises(ValueError):w.process(h,a)
  self.assertEqual(h.worker.call_count,1)
 def test_crash_after_put_no_receipt(self):
  h,a=self.fixture()
  with self.assertRaises(RuntimeError):w.process(h,a,lambda:(_ for _ in ()).throw(RuntimeError()))
  self.assertEqual(h.storage.call_count,2);self.assertEqual(h.worker.call_count,1)
 def test_failed_put_no_receipt(self):
  h,a=self.fixture();h.storage.side_effect=[(200,b'input'),(500,b'')]
  with self.assertRaises(ValueError):w.process(h,a)
  self.assertEqual(h.worker.call_count,1)
 def test_source_guards(self):
  s=Path(__file__).with_name('fixture.sql').read_text()
  for text in ("auth.role() IS DISTINCT FROM 'service_role'",'REVOKE ALL ON ALL FUNCTIONS','auth.uid()','r.generation<>a.generation','a.cleaning','state=\'TERMINAL\'','REVOKE ALL ON FUNCTION'):
   self.assertIn(text,s)
  self.assertNotIn('DELETE FROM',s)
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
if __name__=='__main__':unittest.main()
