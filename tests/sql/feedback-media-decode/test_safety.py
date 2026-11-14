import importlib.util,unittest,time,json
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('decode_experiment',Path(__file__).with_name('experiment.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_strict_permission(self):
  self.assertTrue(m.permission((400,b'{"code":"AccessDenied"}')))
  for response in ((500,b'{"code":"AccessDenied"}'),(400,b'{"code":"LockTimeout"}'),(403,b'unknown'),(404,b'{"code":"NoSuchKey"}')):self.assertFalse(m.permission(response))
 def test_wall_bound_and_success(self):
  self.assertEqual(m.bounded(lambda:(200,b'ok'),1),(200,b'ok'))
  start=time.monotonic()
  with self.assertRaises(m.b.Failure):m.bounded(lambda:time.sleep(20),.05)
  self.assertLess(time.monotonic()-start,3)
 def test_invalid_input(self):
  for raw in (b'',b'x'*(m.MAX+1),'text'):
   with self.assertRaises(m.b.Failure):m.decode(raw)
 def test_actual_malformed_decoder(self):
  self.assertIsNone(m.decode(b'malformed PNG'))
 def test_actual_positive_decoder(self):
  raw=m.subprocess.run(['node','--input-type=module','-e',"import sharp from 'sharp';process.stdout.write(await sharp({create:{width:3,height:2,channels:3,background:'#123456'}}).png().toBuffer());"],cwd=m.ROOT,capture_output=True,check=True,timeout=8).stdout
  output=m.decode(raw)
  self.assertTrue(output.startswith(b'\xff\xd8'))
  self.assertNotEqual(output,raw)
 def test_inherited_isolation_and_no_local_stack(self):
  self.assertFalse(m.b.admitted_event('pull_request'))
  self.assertTrue(m.b.admitted_event('push'))
  with patch.dict(m.os.environ,{'GITHUB_ACTIONS':'false'}):
   with self.assertRaises(m.b.Failure):m.Experiment()
 def test_scope_static(self):
  source=Path(__file__).with_name('experiment.py').read_text()
  self.assertIn('super().probe()',source)
  self.assertNotIn('CREATE POLICY fixture_decode_canonical',source)
  self.assertIn('response.read(MAX+1)',source)
  self.assertIn('start_new_session=True',source)
  self.assertIn('os.killpg(process.pid,signal.SIGKILL)',source)

class Boundaries(unittest.TestCase):
 def test_substitution_never_decodes(self):
  with patch.object(m,'decode') as decode:
   with self.assertRaises(m.b.Failure):m.bound_decode(b'substituted',m.hashlib.sha256(b'expected').hexdigest())
   decode.assert_not_called()
 def test_infrastructure_not_malformed(self):
  from unittest.mock import MagicMock
  p=MagicMock();p.communicate.return_value=(b'',None);p.returncode=3
  with patch.object(m.subprocess,'Popen',return_value=p),patch.object(m,'finish_decoder',return_value=True):
   with self.assertRaises(m.b.Failure):m.decode(b'x')
 def test_cleanup_attempts_independent(self):
  from unittest.mock import MagicMock
  p=MagicMock();p.is_alive.return_value=True;p.kill.side_effect=OSError()
  self.assertFalse(m.finish_child(p));p.join.assert_called_once()
  p=MagicMock();p.stdin.close.side_effect=OSError()
  with patch.object(m.os,'killpg',side_effect=OSError()):self.assertFalse(m.finish_decoder(p))
  p.wait.assert_called_once();p.stdout.close.assert_called_once()
 def test_timeout_primary_preserved(self):
  from unittest.mock import MagicMock
  p=MagicMock();original=m.subprocess.TimeoutExpired('redacted',8);p.communicate.side_effect=original
  with patch.object(m.subprocess,'Popen',return_value=p),patch.object(m,'finish_decoder',return_value=False):
   with self.assertRaises(m.subprocess.TimeoutExpired) as caught:m.decode(b'x')
  self.assertIs(caught.exception,original);self.assertTrue(original.cleanup_uncertain)
 def test_shared_buffer_size_and_failures(self):
  for call in (lambda:(200,b'x'*(m.MAX+1)),lambda:(200,'notbytes'),lambda:(_ for _ in ()).throw(ValueError())):
   with self.assertRaises(m.b.Failure):m.bounded(call,1)
 def test_workflow_dependencies(self):
  text=(m.ROOT/'.github/workflows/v18-feedback-media-decode.yml').read_text()
  expected=[".github/workflows/v18-feedback-media-decode.yml","tests/sql/feedback-media-decode/**","tests/media-decoder/**","tests/sql/feedback-private-images-local-supabase/**","docs/proposals/v18-feedback-private-images.sql","package.json","package-lock.json"]
  import re
  def valid(value):
   paths=re.findall(r"^      - '([^']+)'$",value,re.M)
   return (paths==expected and value.count('    branches: [v18-01a-outbox-recovery]')==1
    and value.count('  workflow_dispatch:')==1 and 'pull_request' not in value
    and value.count('permissions:\n  contents: read\njobs:')==1
    and value.count("if: github.ref == 'refs/heads/v18-01a-outbox-recovery'")==1)
  self.assertTrue(valid(text))
  for changed in (text.replace('contents: read','contents: write'),text.replace('tests/media-decoder/**','tests/other/**'),text.replace('branches: [v18-01a-outbox-recovery]','branches: [main]'),text.replace('  workflow_dispatch:','  pull_request:'),text.replace("      - 'package-lock.json'",'')):
   self.assertFalse(valid(changed))

if __name__=='__main__':unittest.main()
