import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {safeRelative,safeSource,safeOutput} from './build-image-decode.mjs';
test('reject traversal, encoded, absolute and empty segments',()=>{for(const p of ['../x','/x','a//b','a/./b','a\\b','%2e%2e/x',''])assert.throws(()=>safeRelative(p));});
test('reject arbitrary/existing output',()=>{for(const p of ['/tmp','/workspace/output','/tmp/irth-image-decode-a/../assets'])assert.throws(()=>safeOutput(p));});
test('reject symlink assets and directories',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'decode-guards-'));try{fs.writeFileSync(path.join(root,'real'),'x');fs.symlinkSync(path.join(root,'real'),path.join(root,'link'));assert.throws(()=>safeSource(root,'link'));fs.symlinkSync(root,path.join(root,'dir'));assert.throws(()=>safeSource(root,'dir/real'));assert.equal(safeSource(root,'real'),path.join(root,'real'));}finally{fs.rmSync(root,{recursive:true,force:true});}});

import {buildInventory} from './build-image-decode.mjs';
const root=process.cwd();
test('reviewed inventory includes exactly three disjoint interpretive images and source hashes',()=>{
 const inventory=buildInventory(root);
 assert.deepEqual(inventory.counts,{chapter:637,story:1785,interpretive:3,total:2425});
 assert.equal(inventory.paths.length,2425);assert.equal(new Set(inventory.paths).size,2425);
 assert.equal(Object.keys(inventory.sourceHashes).length,3);
 for(const item of inventory.interpretive)assert.equal(inventory.paths.filter(p=>p==='campaign-key-art/'+item.path).length,1);
});
function copyInventory(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'decode-inventory-'));
 const inventory=buildInventory(root);
 for(const relative of [...Object.keys(inventory.sourceHashes),...inventory.interpretive.map(row=>'public/campaign-key-art/'+row.path)]){
  fs.mkdirSync(path.dirname(path.join(temp,relative)),{recursive:true});fs.copyFileSync(path.join(root,relative),path.join(temp,relative));
 }
 return {temp,inventory};
}
for(const mutation of ['missing','wrong bytes','wrong source path','extra source entry','overlap'])test(`inventory rejects ${mutation}`,()=>{
 const {temp,inventory}=copyInventory();
 try {
  const asset=path.join(temp,'public/campaign-key-art/'+inventory.interpretive[0].path);
  const source=path.join(temp,'src/lib/campaign-art/interpretive-chapters.ts');
  if(mutation==='missing')fs.unlinkSync(asset);
  if(mutation==='wrong bytes')fs.writeFileSync(asset,'not the reviewed image');
  if(mutation==='wrong source path')fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('interpretive-v1.webp','unexpected.webp'));
  if(mutation==='extra source entry')fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('] as const;', '  { campaignId: "extra", chapterId: "ch1", path: "chapters/extra/ch1/unreviewed.webp" },\n] as const;'));
  if(mutation==='overlap'){
   const chapter=path.join(temp,'src/lib/campaign-art/chapter-pack.generated.ts');
   fs.writeFileSync(chapter,fs.readFileSync(chapter,'utf8').replace(/"chapters\/[^"\n]+"/,JSON.stringify(inventory.interpretive[0].path)));
  }
  assert.throws(()=>buildInventory(temp));
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
