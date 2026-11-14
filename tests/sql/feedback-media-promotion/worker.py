"""Isolated service orchestration; no scheduler, deployment or actor credentials."""
import hashlib

def process(h, attempt, after_put=lambda:None, after_decode=lambda:None):
 if not h.worker('input_admit',attempt):return False
 status,raw=h.storage(h.Q,attempt['source'],h.fields['service'])
 h.require(status==200,'quarantine fetch failed')
 output=h.bound_decode(raw,attempt['input'])
 if output is None:
  h.require(h.worker('reject_input',attempt) is True,'rejection fence failed')
  return False
 after_decode()
 if not h.worker('start',attempt):return False
 status,_=h.storage(h.C,attempt['key'],h.fields['service'],'POST',output)
 h.require(status in (200,201),'immutable output PUT failed')
 after_put() # A simulated crash here retains WRITING and durable cleanup intent.
 status,read=h.storage(h.C,attempt['key'],h.fields['service'])
 h.require(status==200 and read==output and len(read)==len(output),'canonical verification failed')
 attempt=dict(attempt,output=hashlib.sha256(read).hexdigest(),success=True,bytes=len(read))
 h.require(h.worker('terminal',attempt) is True,'terminal receipt rejected')
 return h.worker('attest',attempt)


def cleanup_input(h,attempt,after_delete=lambda:None):
 if not h.worker('input_cleanup',attempt):return False
 status,raw=h.storage(h.Q,attempt['source'],h.fields['service'])
 if status==200:
  h.require(hashlib.sha256(raw).hexdigest()==attempt['input'],'cleanup source digest mismatch')
  h.require(h.worker('input_positive',attempt) is True,'cleanup positive receipt failed')
  h.remove_input(attempt['source'])
  after_delete()
 else:
  h.require(h.object_absent((status,raw)) and h.worker('input_retry_absence',attempt) is True,'absence without trusted cleanup receipt')
 h.require(h.object_absent(h.storage(h.Q,attempt['source'],h.fields['service'])),'cleanup absence unverified')
 h.require(h.input_metadata_absent(attempt['source']),'cleanup metadata remains')
 h.require(h.worker('input_removed',attempt) is True,'cleanup observation rejected')
 return True
