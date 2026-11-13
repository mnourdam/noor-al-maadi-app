"""Only mock socket/control responses; no websocket, app, device or network."""
import importlib.util,json,sys,types,unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('readiness_runner',Path(__file__).with_name('runner.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Tests(unittest.TestCase):
 def page(self):
  p=r.Page.__new__(r.Page);p.sequence=0;p.connection_failures=0;p.flags={'detached':False,'target_crashed':False,'detach_category':'none'};p.ws=Mock();p.ws.recv.return_value=json.dumps({'id':1,'result':{'result':{'value':2}}});return p
 def test_success_same_single_request_and_response(self):
  p=self.page();self.assertEqual(p.evaluate('1+1'),2);self.assertEqual(p.evaluation_phase,'complete');self.assertEqual(p.evaluation_response_count,1);self.assertEqual(p.connection_failures,0);p.ws.send.assert_called_once();p.ws.recv.assert_called_once()
  payload=json.loads(p.ws.send.call_args.args[0]);self.assertEqual(payload['params']['expression'],'1+1');self.assertTrue(payload['params']['awaitPromise']);self.assertEqual(payload['params']['timeout'],10000)
 def test_each_transport_phase_preserves_primary_and_one_failure(self):
  for phase in ('websocket_timeout_setup','send','receive_timeout_setup','receive','json_decode','response_dispatch'):
   p=self.page();error=RuntimeError('private details')
   if phase=='websocket_timeout_setup':p.ws.settimeout.side_effect=error
   elif phase=='send':p.ws.send.side_effect=error
   elif phase=='receive_timeout_setup':p.ws.settimeout.side_effect=[None,error]
   elif phase=='receive':p.ws.recv.side_effect=error
   elif phase=='json_decode':p.ws.recv.return_value='not json private details'
   else:p.ws.recv.return_value='[]'
   with self.assertRaises(Exception) as caught:p.evaluate('private expression')
   if phase not in ('json_decode','response_dispatch'):self.assertIs(caught.exception,error)
   self.assertEqual(p.evaluation_phase,phase);self.assertEqual(p.connection_failures,1)
   self.assertEqual(p.evaluation_error_category,{'json_decode':'json_decode','response_dispatch':'attribute_error'}.get(phase,'unknown'))
 def test_expired_deadline_no_transport_and_failed_instrumentation_preserves_error(self):
  p=self.page();p.deadline=0
  with patch.object(r.time,'monotonic',return_value=1),patch.object(r,'diagnostic_error',side_effect=RuntimeError('private instrumentation')):
   with self.assertRaises(r.Failure):p.evaluate('1+1')
  self.assertEqual(p.evaluation_phase,'deadline_setup');self.assertEqual(p.evaluation_error_category,'unknown');self.assertEqual(p.connection_failures,1);p.ws.send.assert_not_called()
 def test_trusted_websocket_types_and_unknown_classname(self):
  class WebSocketTimeoutException(Exception):pass
  class WebSocketConnectionClosedException(Exception):pass
  module=types.ModuleType('websocket');module.WebSocketTimeoutException=WebSocketTimeoutException;module.WebSocketConnectionClosedException=WebSocketConnectionClosedException
  with patch.dict(sys.modules,{'websocket':module}):
   self.assertEqual(r.diagnostic_error(WebSocketTimeoutException('secret')),'websocket_timeout');self.assertEqual(r.diagnostic_error(WebSocketConnectionClosedException('secret')),'websocket_closed')
   impostor=type('WebSocketTimeoutException',(Exception,),{});self.assertEqual(r.diagnostic_error(impostor('secret')),'unknown')
 def test_readiness_retains_completed_earlier_controls_and_success_order(self):
  names=('javascript_control','native_platform','native_bridge','home')
  for index in range(4):
   p=self.page();error=RuntimeError('private details');p.evaluate=Mock(side_effect=[2,True,True,True][:index]+[error])
   with self.assertRaises(RuntimeError) as caught:p.readiness()
   self.assertIs(caught.exception,error);self.assertEqual(p.readiness_phase,names[index]);self.assertEqual(p.readiness_checks,{key:i<index for i,key in enumerate(names)});self.assertEqual(p.evaluate.call_count,index+1)
  p=self.page();p.evaluate=Mock(side_effect=[2,True,True,True]);p.readiness();self.assertEqual(p.readiness_phase,'complete');self.assertTrue(all(p.readiness_checks.values()));self.assertEqual(p.evaluate.call_count,4)
 def test_failed_assertion_does_not_mark_completed(self):
  for index,bad in ((0,3),(1,False),(2,None)):
   p=self.page();p.evaluate=Mock(side_effect=[2,True,True][:index]+[bad])
   with self.assertRaises(r.Failure):p.readiness()
   self.assertFalse(p.readiness_checks[p.readiness_phase])
 def test_diagnostics_lookup_failure_separate_not_target_absence(self):
  p=self.page();p.port=1;p.pid='123';p.target={'id':'secret target'};p.device=Mock();p.device.adb.side_effect=['123','webview_devtools_remote_123'];p.readiness_phase='native_bridge';p.readiness_checks={'javascript_control':True,'native_platform':True};p.evaluation_phase='receive';p.evaluation_error_category='websocket_timeout';p.evaluation_response_count=2000
  with patch.object(r,'targets',side_effect=TimeoutError('secret URL')):out=p.diagnostics()
  self.assertIsNone(out['current_target_count']);self.assertIsNone(out['original_target_present']);self.assertEqual(out['target_probe_error_category'],'timeout');self.assertEqual(out['evaluation_error_category'],'websocket_timeout');self.assertEqual(out['evaluation_response_count'],1000);self.assertFalse(out['readiness_checks']['native_bridge']);self.assertNotIn('secret',json.dumps(out));p.ws.recv.assert_not_called()
 def test_response_count_capped_without_discarding_success_or_retry(self):
  p=self.page();p.ws.recv.side_effect=[json.dumps({'method':'unrelated.event'})]*1001+[json.dumps({'id':1,'result':{'result':{'value':2}}})]
  self.assertEqual(p.evaluate('1+1'),2);self.assertEqual(p.evaluation_response_count,1000);p.ws.send.assert_called_once()
if __name__=='__main__':unittest.main()
