import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const EXPECTED=[
 ['cordoba-golden-age','ch5','b8f991c4adb80ae6f3b02d44d23ca7805def2d74e89d36738707def1b36f696c',167780],
 ['ottoman-golden-age','ch10','4e1221e90c6cf9d1fb2972421f9869277dbbb3b235499dc8d5a1865b1ad698b6',201540],
 ['rise-of-the-ottoman-state','ch2','9e5575223f5eba541d53f1234f7b3cb3465c4d8cea5fed1512a911b81cb79159',313360],
].map(([campaign,chapter,sha256,bytes])=>({campaign,chapter,sha256,bytes,path:`chapters/${campaign}/${chapter}/interpretive-v1.webp`}));
export function validateBindings(records,map){
 if(!Array.isArray(records)||records.length!==3)throw Error('manifest_count');
 const tuples=[...map.matchAll(/\{ campaignId: "([^"]+)", chapterId: "([^"]+)", path: "([^"]+)" \}/g)];
 if(tuples.length!==3)throw Error('map_count');
 for(const x of EXPECTED){
  const rows=records.filter(r=>r.campaign_id===x.campaign&&r.chapter_id===x.chapter);
  if(rows.length!==1)throw Error('manifest_identity');
  const r=rows[0];
  if(r.path!==x.path||r.sha256!==x.sha256||r.bytes!==x.bytes||r.width!==1600||r.height!==900)throw Error('manifest_binding');
  if(tuples.filter(t=>t[1]===x.campaign&&t[2]===x.chapter&&t[3]===x.path).length!==1)throw Error('map_binding');
 }
}
export async function verifySource(root=ROOT){
 const base=path.join(root,'public/campaign-key-art');
 validateBindings(JSON.parse(fs.readFileSync(path.join(base,'interpretive-chapters.manifest.json'),'utf8')).records,fs.readFileSync(path.join(root,'src/lib/campaign-art/interpretive-chapters.ts'),'utf8'));
 for(const x of EXPECTED){
  let current=root;
  for(const part of ['public','campaign-key-art',...x.path.split('/')]){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('source_symlink');}
  const b=fs.readFileSync(current);
  if(b.length!==x.bytes||crypto.createHash('sha256').update(b).digest('hex')!==x.sha256)throw Error('source_hash');
  const {data,info}=await sharp(b,{failOn:'warning'}).raw().toBuffer({resolveWithObject:true});
  if(info.width!==1600||info.height!==900||info.channels!==3||data.length!==1600*900*3)throw Error('source_decode');
 }
 return EXPECTED;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await verifySource()));}catch{console.error('source_image_validation_failed');process.exitCode=1;}
}
