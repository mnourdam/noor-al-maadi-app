"""Isolated service orchestration; no scheduler, deployment or actor credentials."""
import hashlib

def process(h, attempt, after_put=lambda:None):
 status,raw=h.storage(h.Q,attempt['source'],h.fields['service'])
 h.require(status==200,'quarantine fetch failed')
 output=h.bound_decode(raw,attempt['input'])
 h.require(output is not None,'validation rejected')
 if not h.worker('start',attempt):return False
 status,_=h.storage(h.C,attempt['key'],h.fields['service'],'POST',output)
 h.require(status in (200,201),'immutable output PUT failed')
 after_put() # A simulated crash here retains WRITING and durable cleanup intent.
 status,read=h.storage(h.C,attempt['key'],h.fields['service'])
 h.require(status==200 and read==output and len(read)==len(output),'canonical verification failed')
 attempt=dict(attempt,output=hashlib.sha256(read).hexdigest(),success=True,bytes=len(read))
 h.require(h.worker('terminal',attempt) is True,'terminal receipt rejected')
 return h.worker('attest',attempt)
