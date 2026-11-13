import importlib.util
from pathlib import Path
import unittest,os,json,hashlib,tempfile
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('media',Path(__file__).with_name('harness.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
class Safety(unittest.TestCase):
 def test_endpoint(self):
  h.endpoint('http://127.0.0.1:55541','http',55541)
  for u in ('https://example.com','http://localhost:55541','http://127.0.0.1:55531','http://127.0.0.1:55541/?token=x','http://u:p@127.0.0.1:55541','http://127.0.0.1:55541#x'):
   with self.assertRaises(h.Failure):h.endpoint(u,'http',55541)
 def test_project(self):
  self.assertTrue(h.PROJECT_RE.fullmatch('irth-v18-feedback-media-123-1'))
  for p in ('prod','irth-v18-authority-123-1','irth-v18-feedback-media-../-1'):self.assertFalse(h.PROJECT_RE.fullmatch(p))
 def test_no_local_execution(self):
  with patch.dict(os.environ,{},clear=True),self.assertRaises(h.Failure):h.Harness()
 def test_event(self):
  with patch.dict(os.environ,{'GITHUB_ACTIONS':'true','GITHUB_REF':'refs/heads/v18-01a-outbox-recovery','GITHUB_EVENT_NAME':'pull_request'},clear=True),self.assertRaises(h.Failure):h.Harness()
 def test_storage_included(self):
  self.assertNotIn('storage-api',h.EXCLUDE.split(','));self.assertIn('("storage", None, None)',Path(h.__file__).read_text())
 def test_status_conflict(self):
  with self.assertRaises(h.Failure):h.status_fields({'API_URL':'x','api':{'url':'y'}})
 def test_no_redirect(self):
  with self.assertRaises(h.Failure):h.NoRedirect().redirect_request(None,None,302,'',{},'http://example.com')
 def test_cleanup_refuses_symlink(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);link=root/'link';link.symlink_to(root,target_is_directory=True);instance=object.__new__(h.Harness);instance.work=link
   with self.assertRaises(h.Failure):instance.cleanup()
 def test_proposal_hash(self):self.assertEqual(hashlib.sha256(h.PROPOSAL.read_bytes()).hexdigest(),h.PROPOSAL_SHA)
 def test_exact_absence(self):
  self.assertTrue(h.Harness.object_absent((404,b'{"code":"NoSuchKey"}')))
  self.assertTrue(h.Harness.object_absent((400,b'{"statusCode":"404","error":"not_found","message":"Object not found"}')))
  for result in ((403,b'{"code":"AccessDenied"}'),(404,b'{"code":"route_missing"}'),(400,b'{"statusCode":"403","error":"not_found","message":"Object not found"}'),(500,b'fail'),(200,b'[]')):self.assertFalse(h.Harness.object_absent(result))
 def test_fixture_does_not_replace_native_services(self):
  sql=Path(__file__).with_name('fixture.sql').read_text().lower()
  for text in ('create schema auth','create schema storage','create function auth.uid','alter role'):self.assertNotIn(text,sql)
 def test_event_allowlist(self):
  for event in ('push','workflow_dispatch'):self.assertTrue(h.admitted_event(event))
  for event in ('pull_request','pull_request_target','schedule','workflow_run','repository_dispatch','',None):self.assertFalse(h.admitted_event(event))
 def test_workflow_narrow(self):
  workflow=(h.ROOT/'.github/workflows/v18-feedback-media-local.yml').read_text()
  expected="""on:
  push:
    branches: [v18-01a-outbox-recovery]
    paths:
      - '.github/workflows/v18-feedback-media-local.yml'
      - 'tests/sql/feedback-private-images-local-supabase/**'
      - 'docs/proposals/v18-feedback-private-images.sql'
  workflow_dispatch:
permissions:
  contents: read
"""
  def exact_boundary(text):
   # Exact complete trigger+permission block, not a permissive substring check.
   return text.split('\non:',1)[1].split('jobs:',1)[0]==expected[3:] if '\non:' in text else False
  self.assertTrue(exact_boundary(workflow))
  for changed in (workflow.replace('  workflow_dispatch:',"      - '**'\n  workflow_dispatch:"),workflow.replace('contents: read','contents: write'),workflow.replace('branches: [v18-01a-outbox-recovery]','branches: [main]'),workflow.replace('  workflow_dispatch:','  schedule:\n  workflow_dispatch:')):
   self.assertFalse(exact_boundary(changed))
if __name__=='__main__':unittest.main()
