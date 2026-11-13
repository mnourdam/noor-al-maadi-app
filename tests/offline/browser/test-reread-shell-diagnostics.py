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
 def character_fixture(self):
  counts={c:{'characters':0,'rectangles':0,'zero_width':0,'outside':0} for c in ('ASCII_SPACE','LINE_BREAK','OTHER_WHITESPACE','NON_WHITESPACE')}
  counts['ASCII_SPACE'].update(characters=1,rectangles=1,outside=1)
  return {'limit':2048,'record_limit':16,'total':1,'inspected':1,'truncated':False,'counts':counts,
   'violations':[{'category':'ASCII_SPACE','node':0,'start':0,'end':1,'left':27.016,'right':29,'top':1,'bottom':2,'width':1.984,'height':1,'text':'PRIVATE'}],
   'style':{'white_space':'pre-wrap','direction':'rtl','overflow_x':'visible','overflow_y':'secret'},'text':'PRIVATE'}
 def test_character_redaction_and_caps(self):
  raw=self.character_fixture();safe=m.character_evidence(raw)
  self.assertNotIn('PRIVATE',json.dumps(safe));self.assertNotIn('secret',json.dumps(safe))
  self.assertEqual(safe['style']['overflow_y'],'other')
  self.assertEqual(safe['violations'][0]['left'],27.016)
  raw['violations']*=17
  with self.assertRaises(ValueError):m.character_evidence(raw)
 def test_character_truncation_and_category_fail_closed(self):
  raw=self.character_fixture();raw.update(total=2049,inspected=2048,truncated=True)
  raw['counts']['ASCII_SPACE']['characters']=2048
  self.assertTrue(m.character_evidence(raw)['truncated'])
  raw['truncated']=False
  with self.assertRaises(ValueError):m.character_evidence(raw)
  raw=self.character_fixture();raw['violations'][0]['category']='raw text'
  with self.assertRaises(ValueError):m.character_evidence(raw)
 def test_character_probe_does_not_replace_original_failure(self):
  source=Path(__file__).with_name('reread-shell-browser.py').read_text()
  self.assertIn("if not REPORT['geometry']['tests']['ranges_contained']:",source)
  self.assertIn("REPORT['characters']=character_evidence(await element.evaluate(CHARACTER_PROBE))",source)
  self.assertIn("assert all(REPORT['geometry']['tests'].values())",source)
 def test_actual_character_probe_node_execution(self):
  program=r'''
const assert=require('node:assert/strict'), fs=require('node:fs');
const probe=eval('('+fs.readFileSync(0,'utf8')+')');
const text=String.fromCodePoint(32,9,10,13,0xA0,0x627,115,0x1F600);
let index=0;const node={textContent:text},offsets=[];
global.NodeFilter={SHOW_TEXT:4};
global.getComputedStyle=()=>({whiteSpace:'pre-wrap',direction:'rtl',overflowX:'visible',overflowY:'visible'});
global.document={
 createTreeWalker:()=>({currentNode:node,nextNode:()=>index++===0}),
 createRange:()=>{let start,end;return {setStart:(_,v)=>start=v,setEnd:(_,v)=>end=v,getClientRects:()=>{
 offsets.push([start,end]);return [{left:-2,right:0,top:0,bottom:1,width:2,height:1}];
 }}}
};
const result=probe({getBoundingClientRect:()=>({left:0,right:20,top:0,bottom:20})});
assert.equal(result.total,8);assert.equal(result.inspected,8);assert.equal(result.truncated,false);
assert.equal(result.counts.ASCII_SPACE.characters,1);
assert.equal(result.counts.LINE_BREAK.characters,2);
assert.equal(result.counts.OTHER_WHITESPACE.characters,2);
assert.equal(result.counts.NON_WHITESPACE.characters,3);
assert.deepEqual(offsets,[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,9]]);
assert.deepEqual(result.violations.map(x=>x.category),['ASCII_SPACE','OTHER_WHITESPACE','LINE_BREAK','LINE_BREAK','OTHER_WHITESPACE','NON_WHITESPACE','NON_WHITESPACE','NON_WHITESPACE']);
index=0;node.textContent='s'.repeat(2050);offsets.length=0;
const capped=probe({getBoundingClientRect:()=>({left:0,right:20,top:0,bottom:20})});
assert.equal(capped.total,2050);assert.equal(capped.inspected,2048);assert.equal(capped.truncated,true);
assert.equal(capped.violations.length,16);assert.equal(offsets.length,2048);
'''
  result=subprocess.run(['node','-e',program],input=m.CHARACTER_PROBE,capture_output=True,text=True,timeout=10)
  self.assertEqual(result.returncode,0,result.stderr)
 def test_workflow_always_retains(self):
  text=(Path(__file__).resolve().parents[3]/'.github/workflows/v18-reread-shell-browser.yml').read_text()
  self.assertIn('if: always()',text);self.assertIn('exit "$status"',text)
  self.assertIn('with sync_playwright() as p:',text)
if __name__=='__main__':unittest.main()
