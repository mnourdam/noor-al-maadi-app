import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import fs from 'node:fs';import {outputPath,records} from './build-source-disclosure.mjs';
test('only isolated empty build output, pinned source identities',()=>{for(const p of ['/tmp/other/assets','/workspace/assets','/tmp/irth-source-disclosure-x/../assets'])assert.throws(()=>outputPath(p));assert.equal(outputPath('/tmp/irth-source-disclosure-example/assets'),'/tmp/irth-source-disclosure-example/assets');const r=records();assert.equal(r.duraid.body.sources.length,6);assert.equal(r.dinar.body.references.length,6);});
test('actual route guard rejects origin/method-shape escape variants',()=>{const result=spawnSync('python',['-c',`import importlib.util
s=importlib.util.spec_from_file_location('guard','tests/offline/browser/source-disclosure-browser.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
o='http://127.0.0.1:1234';paths={'/index.html','/fixture.js'}
assert m.admitted(o+'/index.html',o,paths)
for u in ['http://localhost:1234/index.html','http://127.0.0.1:1235/index.html','https://127.0.0.1:1234/index.html',o+'/index.html?q=1',o+'/%69ndex.html',o+'/../index.html',o+'/index.html#x','http://u@127.0.0.1:1234/index.html','https://example.com/fixture.js']:
 assert not m.admitted(u,o,paths),u
`],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);});
test('workflow constrained branch/manual/read-only and screenshot-only artifact scope',()=>{const s=fs.readFileSync('.github/workflows/v18-source-disclosure-visual.yml','utf8');assert.match(s,/branches: \[v18-01a-outbox-recovery\]/);assert.match(s,/workflow_dispatch:/);assert.match(s,/permissions:\n  contents: read/);assert.ok(!s.includes('tests/**'));assert.match(s,/playwright==1\.62\.0/);assert.match(s,/retention-days: 7/);assert.match(s,/source-disclosure-evidence\/receipt.json/);assert.match(s,/source-disclosure-evidence\/\*\.png/);});
test('server cleanup attempts all owned steps and preserves primary failure',()=>{const result=spawnSync('python',['-c',`import importlib.util
s=importlib.util.spec_from_file_location('guard','tests/offline/browser/source-disclosure-browser.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for primary in [True,False]:
 calls=[]
 class Server:
  def shutdown(self):calls.append('shutdown');raise RuntimeError('first')
  def server_close(self):calls.append('close');raise RuntimeError('second')
 class Thread:
  def join(self,timeout):calls.append('join')
  def is_alive(self):return False
 try:m.stop_server(Server(),Thread(),primary)
 except RuntimeError:assert not primary
 else:assert primary
 assert calls==['shutdown','close','join']
`],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(result.status,0,result.stderr);});
