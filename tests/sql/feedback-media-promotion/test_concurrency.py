import copy,importlib.util,unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('concurrency',Path(__file__).with_name('concurrency.py'));c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Tests(unittest.TestCase):
 def rows(self):
  a=dict(pid=101,started='one',marker='holder',role='supabase_admin',database='postgres',state='idle in transaction',query='SELECT winner',xid='42',holds_xid=True)
  b=dict(pid=102,started='two',marker='waiter',role='supabase_admin',database='postgres',query='SELECT loser',wait='transactionid',blocking=[101],wait_xid='42')
  return [a,b]
 def test_exact_wait_and_negatives(self):
  rows=self.rows();a,b=copy.deepcopy(rows)
  self.assertTrue(c.exact_wait(rows,a,b,'SELECT winner','SELECT loser'))
  for index,key,value in [(0,'started','reused'),(1,'pid',103),(1,'query','other'),(1,'wait_xid','43'),(1,'blocking',[]),(0,'state','idle'),(0,'holds_xid',False),(1,'role','other'),(1,'database','other')]:
   changed=copy.deepcopy(rows);changed[index][key]=value;self.assertFalse(c.exact_wait(changed,a,b,'SELECT winner','SELECT loser'))
  self.assertFalse(c.exact_wait(rows+[rows[1]],a,b,'SELECT winner','SELECT loser'))
 def test_identity_waits_for_marker_but_not_wrong_identity(self):
  pair=object.__new__(c.Pair);pair.identities=[];row=self.rows()[1];pair.snapshots=Mock(side_effect=[[],[row]])
  session={'marker':'waiter','process':Mock()};session['process'].poll.return_value=None
  self.assertEqual(pair.identity(session),row);self.assertEqual(pair.snapshots.call_count,2)
  pair.snapshots=Mock(return_value=[dict(row,role='wrong')])
  with self.assertRaises(RuntimeError):pair.identity(session)
 def test_identity_missing_marker_has_deadline(self):
  pair=object.__new__(c.Pair);pair.identities=[];pair.snapshots=Mock(return_value=[])
  session={'marker':'waiter','process':Mock()};session['process'].poll.return_value=None
  with patch.object(c.time,'monotonic',side_effect=[0,0,0,4]):
   with self.assertRaises(RuntimeError):pair.identity(session)
 def fake(self):
  pair=Mock();rows=self.rows();sessions=[dict(marker='holder',sql='SELECT winner',process=Mock()),dict(marker='waiter',sql='SELECT loser',process=Mock())]
  for s in sessions:s['process'].poll.return_value=None
  pair.start.side_effect=sessions;pair.identity.side_effect=rows;pair.snapshots.return_value=rows;pair.line.side_effect=['t',''];pair.cleanup.return_value=True
  h=Mock();h.report={};return pair,h
 def test_success_requires_actual_results_and_cleanup(self):
  pair,h=self.fake()
  with patch.object(c,'Pair',return_value=pair):result=c.run_order(h,'SELECT winner','t','SELECT loser','')
  self.assertTrue(all(result.values()));self.assertEqual(pair.commit.call_count,2);pair.cleanup.assert_called_once()
 def test_bad_holder_never_starts_waiter(self):
  pair,h=self.fake();pair.line.side_effect=['f']
  with patch.object(c,'Pair',return_value=pair):
   with self.assertRaises(RuntimeError):c.run_order(h,'SELECT winner','t','SELECT loser','')
  self.assertEqual(pair.start.call_count,1);pair.cleanup.assert_called_once()
 def test_primary_preserved_with_cleanup_failure(self):
  pair,h=self.fake();original=RuntimeError('known');pair.line.side_effect=original;pair.cleanup.return_value=False
  with patch.object(c,'Pair',return_value=pair):
   with self.assertRaises(RuntimeError) as caught:c.run_order(h,'SELECT winner','t','SELECT loser','')
  self.assertIs(caught.exception,original);self.assertFalse(h.report['transaction_orders'][0]['cleanup_verified'])
 def test_cleanup_exception_preserves_primary(self):
  pair,h=self.fake();original=RuntimeError('known');pair.line.side_effect=original;pair.cleanup.side_effect=OSError()
  with patch.object(c,'Pair',return_value=pair):
   with self.assertRaises(RuntimeError) as caught:c.run_order(h,'SELECT winner','t','SELECT loser','')
  self.assertIs(caught.exception,original);self.assertFalse(h.report['transaction_orders'][0]['cleanup_verified'])
 def test_sql_timeout_not_false_loser(self):
  pair,h=self.fake();pair.line.side_effect=['t',TimeoutError()]
  with patch.object(c,'Pair',return_value=pair):
   with self.assertRaises(TimeoutError):c.run_order(h,'SELECT winner','t','SELECT loser','')
  self.assertEqual(pair.commit.call_count,1);pair.cleanup.assert_called_once()
 def test_cleanup_independent_and_identity_guarded(self):
  pair=object.__new__(c.Pair);p=Mock();p.stdin.closed=False;p.stdout.closed=False;p.stdin.write.side_effect=OSError();p.wait.side_effect=[TimeoutError(),None];p.poll.return_value=None
  pair.sessions=[{'process':p,'marker':'owned'}];pair.identities=[{'pid':101,'started':'stamp','marker':'owned'}];pair.query=Mock(return_value='0');pair.snapshots=Mock(return_value=[])
  self.assertFalse(pair.cleanup());p.kill.assert_called_once();self.assertEqual(p.wait.call_count,2)
  sql=pair.query.call_args_list[0].args[0]
  for expected in ("pid=101","backend_start::text='stamp'","application_name='owned'","datname='postgres'","usename='supabase_admin'"):self.assertIn(expected,sql)
if __name__=='__main__':unittest.main()
