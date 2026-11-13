import asyncio,importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('shell',Path(__file__).with_name('reread-shell-browser.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Diagnostics(unittest.TestCase):
 def test_number_bounds(self):
  for n in (float('inf'),float('nan'),1000001,'secret',True):self.assertIsNone(m.bounded_number(n))
  self.assertEqual(m.bounded_number(1.23456),1.235)
 def test_geometry_shape_and_failure_preserved(self):
  names=('content','multiline','positive_box','viewport','horizontal_scroll','vertical_scroll','unclamped','not_ellipsis','ranges_contained')
  metrics=('left','right','top','bottom','width','height','client_width','scroll_width','client_height','scroll_height','line_count','min_left','max_right','min_top','max_bottom','viewport_width')
  raw={'tests':dict.fromkeys(names,True),'numbers':dict.fromkeys(metrics,1),'text':'must not escape'}
  raw['tests']['ranges_contained']=False
  result=m.geometry_evidence(raw);self.assertFalse(all(result['tests'].values()));self.assertNotIn('text',result)
  raw['tests']['unrecognized']=True
  with self.assertRaises(ValueError):m.geometry_evidence(raw)
 def test_primary_error_survives_close_failure(self):
  class Context:
   async def close(self):raise RuntimeError('cleanup')
  async def run():
   try:raise AssertionError('primary')
   finally:await m.close_preserving_primary(Context())
  with self.assertRaisesRegex(AssertionError,'primary'):asyncio.run(run())
  with self.assertRaisesRegex(RuntimeError,'cleanup'):asyncio.run(m.close_preserving_primary(Context()))
 def test_shell_prints_failure_json_and_preserves_exit(self):
  with tempfile.TemporaryDirectory() as td:
   script="set -euo pipefail; status=0; python -c 'import json; print(json.dumps({\"result\":\"FAIL\"})); raise SystemExit(7)' > result.json || status=$?; cat result.json; exit \"$status\""
   result=subprocess.run(['bash','-c',script],cwd=td,capture_output=True,text=True)
   self.assertEqual(result.returncode,7);self.assertEqual(json.loads(result.stdout),{'result':'FAIL'})
 def test_discovery_failure_preserves_status_and_initial_record(self):
  workflow=(Path(__file__).resolve().parents[3]/'.github/workflows/v18-reread-shell-browser.yml').read_text()
  lines=workflow.splitlines()
  start=next(i for i,line in enumerate(lines) if 'set -euo pipefail' in line)
  end=next(i for i in range(start,len(lines)) if 'exit "$status"' in lines[i])
  script='\n'.join(line[10:] for line in lines[start:end+1])
  discovery=next(line for line in script.splitlines() if line.startswith('CHROMIUM_EXECUTABLE_PATH='))
  self.assertNotIn('export CHROMIUM_EXECUTABLE_PATH="$(',script)
  script=script.replace(discovery,'''CHROMIUM_EXECUTABLE_PATH="$(exit 23)"''')
  with tempfile.TemporaryDirectory() as td:
   result=subprocess.run(['bash','-c',script],cwd=td,capture_output=True,text=True)
   self.assertEqual(result.returncode,23)
   self.assertEqual(json.loads((Path(td)/'reread-shell-result.json').read_text()),{'result':'FAIL','stage':'executable_discovery'})
 def test_workflow_always_retains(self):
  text=(Path(__file__).resolve().parents[3]/'.github/workflows/v18-reread-shell-browser.yml').read_text()
  self.assertIn('if: always()',text);self.assertIn('exit "$status"',text)
  self.assertIn('with sync_playwright() as p:',text)
if __name__=='__main__':unittest.main()
