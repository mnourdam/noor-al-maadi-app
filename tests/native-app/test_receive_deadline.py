"""Actual pinned websocket-client parser over fake socket; no network/server."""
import importlib.util,json,socket,unittest
from pathlib import Path
from unittest.mock import Mock,patch
import websocket
spec=importlib.util.spec_from_file_location('receive_runner',Path(__file__).with_name('runner.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

def frame(payload,opcode=1):
    data=payload.encode() if isinstance(payload,str) else payload
    return websocket.ABNF(fin=1,opcode=opcode,mask_value=0,data=data).format()
class FakeSocket:
    def __init__(self,parts,clock):self.parts=list(parts);self.clock=clock;self.timeout=10;self.sent=[];self.closed=False;self.recv_count=0;self.send_error_at=None
    def gettimeout(self):return self.timeout
    def settimeout(self,value):self.timeout=value
    def send(self,data):
        self.sent.append(data)
        if len(self.sent)==self.send_error_at:raise socket.timeout('synthetic send timeout')
        return len(data)
    def recv(self,size):
        self.recv_count+=1
        value=self.parts.pop(0)
        if isinstance(value,Exception):self.clock[0]+=self.timeout;raise value
        if isinstance(value,tuple):self.clock[0]+=value[0];value=value[1]
        else:self.clock[0]+=.01
        if len(value)>size:self.parts.insert(0,value[size:]);value=value[:size]
        return value
    def close(self):self.closed=True
class Tests(unittest.TestCase):
    def setup(self,parts):
        self.clock=[0];self.sock=FakeSocket(parts,self.clock);self.ws=websocket.WebSocket();self.ws.sock=self.sock;self.ws.connected=True
        self.page=r.Page.__new__(r.Page);self.page.ws=self.ws;self.page.sequence=0;self.page.connection_failures=0;self.page.flags={'detached':False,'target_crashed':False,'detach_category':'none'}
    def run_evaluate(self):
        with patch.object(r.time,'monotonic',side_effect=lambda:self.clock[0]):return self.page.evaluate('1+1')
    def response(self,id=1):return frame(json.dumps({'id':id,'result':{'result':{'value':2}}}))
    def test_pinned_real_library_and_delayed_reply_single_request(self):
        self.assertEqual(websocket.__version__,'1.8.0')
        self.setup([socket.timeout(),socket.timeout(),self.response()]);self.assertEqual(self.run_evaluate(),2)
        self.assertEqual(len(self.sock.sent),1);self.assertEqual(self.page.sequence,1);self.assertEqual(self.page.evaluation_receive_timeout_count,2);self.assertEqual(self.page.connection_failures,0);self.assertFalse(self.sock.closed)
        # Actual sent frame is masked; decode using the real frame parser.
        raw=self.sock.sent[0];buf=websocket._abnf.frame_buffer(lambda size:raw_reader(size),False)
        pending=[raw]
        def raw_reader(size):
            value=pending[0][:size];pending[0]=pending[0][size:];return value
        sent=json.loads(buf.recv_frame().data);self.assertEqual(sent['id'],1);self.assertEqual(sent['params']['timeout'],10000)
    def test_partial_header_and_payload_survive_timeout_in_actual_parser(self):
        raw=self.response()
        for split in (1,4,len(raw)-3):
            self.setup([raw[:split],socket.timeout(),raw[split:]])
            self.assertEqual(self.run_evaluate(),2);self.assertEqual(len(self.sock.sent),1);self.assertEqual(self.page.evaluation_receive_timeout_count,1)
    def test_repeated_timeouts_stop_at_original15_no_sixth_read(self):
        self.setup([socket.timeout()]*6)
        with self.assertRaisesRegex(r.Failure,'evaluation_deadline'):self.run_evaluate()
        self.assertEqual(self.clock[0],15);self.assertEqual(self.sock.recv_count,5);self.assertEqual(len(self.sock.sent),1);self.assertEqual(self.page.connection_failures,1)
    def test_successful_receive_returning_after_deadline_rejected(self):
        self.setup([(16,self.response())])
        with self.assertRaisesRegex(r.Failure,'evaluation_deadline'):self.run_evaluate()
        self.assertEqual(self.page.evaluation_response_count,0);self.assertEqual(self.page.connection_failures,1);self.assertEqual(len(self.sock.sent),1)
    def test_detach_crash_and_protocol_errors_after_timeout_still_terminal(self):
        for method,code in [('Inspector.detached','target_detached'),('Inspector.targetCrashed','target_crashed')]:
            self.setup([socket.timeout(),frame(json.dumps({'method':method,'params':{'reason':'target_closed'}}))])
            with self.assertRaisesRegex(r.Failure,code):self.run_evaluate()
            self.assertEqual(self.page.connection_failures,1);self.assertEqual(len(self.sock.sent),1)
        self.setup([socket.timeout(),b'\xc1\x00'])
        with self.assertRaises(websocket.WebSocketProtocolException):self.run_evaluate()
        self.assertEqual(self.page.connection_failures,1)
    def test_closed_send_control_pong_and_unknown_timeout_not_retried(self):
        self.setup([b''])
        with self.assertRaises(websocket.WebSocketConnectionClosedException):self.run_evaluate()
        self.assertEqual(self.sock.recv_count,1)
        self.setup([self.response()]);self.sock.send_error_at=1
        with self.assertRaises(websocket.WebSocketTimeoutException):self.run_evaluate()
        self.assertEqual(self.sock.recv_count,0);self.assertEqual(self.page.evaluation_receive_timeout_count,0)
        self.setup([frame(b'ping',opcode=9),self.response()]);self.sock.send_error_at=2
        with self.assertRaises(websocket.WebSocketTimeoutException):self.run_evaluate()
        self.assertEqual(self.page.evaluation_receive_timeout_count,0);self.assertEqual(len(self.sock.parts),1);self.assertEqual(len(self.sock.sent),2) # original request + library's one automatic pong attempt
        self.setup([]);self.ws.recv=Mock(side_effect=websocket.WebSocketTimeoutException('unknown origin'))
        with self.assertRaises(websocket.WebSocketTimeoutException):self.run_evaluate()
        self.ws.recv.assert_called_once();self.assertEqual(self.page.evaluation_receive_timeout_count,0)
    def test_classifier_failure_preserves_original_receive_timeout(self):
        self.setup([socket.timeout()])
        with patch.object(r,'recoverable_receive_timeout',side_effect=ValueError('private classification')):
            with self.assertRaises(websocket.WebSocketTimeoutException):self.run_evaluate()
        self.assertEqual(self.page.connection_failures,1);self.assertEqual(self.page.evaluation_receive_timeout_count,0);self.assertEqual(len(self.sock.sent),1)
    def test_unrelated_message_then_timeout_matching_response_same_id(self):
        self.setup([self.response(99),socket.timeout(),self.response(1)])
        self.assertEqual(self.run_evaluate(),2);self.assertEqual(self.page.evaluation_response_count,2);self.assertEqual(len(self.sock.sent),1)
    def test_exploratory_remaining_budget_still_caps_total(self):
        self.setup([socket.timeout()]*5);self.page.deadline=4
        with self.assertRaisesRegex(r.Failure,'evaluation_deadline'):self.run_evaluate()
        self.assertEqual(self.clock[0],4);self.assertEqual(self.sock.recv_count,2);self.assertEqual(len(self.sock.sent),1)
if __name__=='__main__':unittest.main()
