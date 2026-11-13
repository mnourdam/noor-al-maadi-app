import importlib.util,json,unittest,os
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('observation',Path(__file__).with_name('provenance.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class Safety(unittest.TestCase):
 def rows(self):return [{'path':x,'bytes':100,'sha256':'a'*64,'source_hashes':[]} for x in p.PATHS]
 def test_exact_image(self):
  good={'Id':p.IMAGE,'RepoDigests':['public.ecr.aws/supabase/storage-api@'+p.DIGEST]};p.image_guard(good)
  for bad in ({**good,'Id':'sha256:'+'0'*64},{**good,'RepoDigests':[]}):
   with self.assertRaises(p.base.Failure):p.image_guard(bad)
 def test_safe_labels_and_no_attestation(self):
  rows=self.rows()
  for name,digest in p.EXPECTED.items():rows[p.PATHS.index('/app/dist/'+name+'.js.map')]['source_hashes']=[digest]
  result=p.sanitize(rows,{'org.opencontainers.image.revision':p.REVISION,'org.opencontainers.image.version':'v1.84.19','secret':'NEVER_PRINT'})
  self.assertTrue(all(result['reviewed_source_matches'].values()));self.assertTrue(result['oci_revision_matches'])
  self.assertEqual(result['provenance_status'],'UNSUPPORTED');self.assertEqual(result['embedded_source_status'],'MATCHED');self.assertFalse(result['compiled_order_attested']);self.assertFalse(result['barrier_authorized']);self.assertNotIn('NEVER_PRINT',json.dumps(result))
 def test_missing_sources_are_not_mapping(self):
  result=p.sanitize([{'path':x,'unavailable':True} for x in p.PATHS],{})
  self.assertEqual(result['embedded_source_status'],'UNSUPPORTED');self.assertFalse(any(result['reviewed_source_matches'].values()));self.assertFalse(result['barrier_authorized'])
 def test_malformed_output_rejected(self):
  for key,value in [('path','/app/.env'),('bytes',1048577),('sha256','SECRET'),('source_hashes',['SECRET'])]:
   rows=self.rows();rows[0][key]=value
   with self.assertRaises(p.base.Failure):p.sanitize(rows,{})
  with self.assertRaises(p.base.Failure):p.sanitize([], {})
 def test_exact_six_files_no_target_execution(self):
  self.assertEqual(len(p.PATHS),6);self.assertIn('O_NOFOLLOW',p.READ_SCRIPT);self.assertIn('1048576',p.READ_SCRIPT)
  for forbidden in ('process.env','readdir','eval(',"require('/app",'import('):self.assertNotIn(forbidden,p.READ_SCRIPT)
 def test_local_stack_refused(self):
  with patch.dict(os.environ,{},clear=True),self.assertRaises(p.base.Failure):p.Observation()
 def test_workflow_boundaries(self):
  s=(p.base.ROOT/'.github/workflows/v18-feedback-media-provenance.yml').read_text()
  expected="""on:
  push:
    branches: [v18-01a-outbox-recovery]
    paths:
      - '.github/workflows/v18-feedback-media-provenance.yml'
      - 'tests/sql/feedback-media-provenance/**'
      - 'tests/sql/feedback-private-images-local-supabase/**'
  workflow_dispatch:
permissions:
  contents: read
"""
  self.assertEqual(s[s.index('on:\n'):s.index('jobs:\n')],expected)
  self.assertIn("if: github.ref == 'refs/heads/v18-01a-outbox-recovery'",s);self.assertIn('persist-credentials: false',s);self.assertIn('if: always()',s)
if __name__=='__main__':unittest.main()
