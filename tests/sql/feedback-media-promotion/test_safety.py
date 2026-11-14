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
if __name__=='__main__':unittest.main()
