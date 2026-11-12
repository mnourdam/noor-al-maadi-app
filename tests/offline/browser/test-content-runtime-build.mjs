import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const script='tests/offline/browser/build-content-runtime.mjs';
for(const origin of ['https://example.com','http://127.0.0.1.evil:55439','http://user:pass@127.0.0.1:55439','http://127.0.0.1:55439/?host=evil']){
 test(`reject nonexact origin ${origin}`,()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'content-guard-'));
  try{const output=path.join(directory,'assets');const result=spawnSync(process.execPath,[script,output,origin],{encoding:'utf8'});assert.notEqual(result.status,0);assert.equal(existsSync(output),false)}finally{rmSync(directory,{recursive:true,force:true})}
 });
}
test('unknown counterfactual mode fails before build',()=>{
 const result=spawnSync(process.execPath,[script,path.join(tmpdir(),'unused-content-output'),'http://127.0.0.1:55439','--unknown'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/unknown build mode/);
});
