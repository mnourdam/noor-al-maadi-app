import fs from 'node:fs';
import {createHash} from 'node:crypto';
const reviewed=JSON.parse(fs.readFileSync(new URL('./image-decode-interpretive.json',import.meta.url),'utf8'));
const sha256=value=>createHash('sha256').update(value).digest('hex');
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
export function safeRelative(value) {
  if(typeof value!=='string'||!value||value.split('/').some(x=>!x||x==='.'||x==='..')||!/^[a-zA-Z0-9_./-]+$/.test(value)||path.isAbsolute(value))throw Error('invalid asset path');
  return value;
}
export function safeSource(root, relative) {
  safeRelative(relative);let p=root;
  if(fs.lstatSync(root).isSymbolicLink())throw Error('symlink root');
  for(const part of relative.split('/')){p=path.join(p,part);if(fs.lstatSync(p).isSymbolicLink())throw Error('symlink asset');}
  if(!fs.statSync(p).isFile())throw Error('asset not file');return p;
}
export function safeOutput(output) {
  if(typeof output!=='string'||!/^\/tmp\/irth-image-decode-[a-zA-Z0-9_-]+\/assets$/.test(output)||fs.existsSync(output))throw Error('fresh isolated output required');
  const parent=path.dirname(output);if(!fs.existsSync(parent)||fs.lstatSync(parent).isSymbolicLink()||fs.realpathSync(parent)!==parent)throw Error('invalid output parent');return output;
}
export function buildInventory(root) {
  const files=['src/lib/campaign-art/chapter-pack.generated.ts','src/lib/stories/media/offline-pack.generated.ts',reviewed.source];
  const texts=files.map(file=>fs.readFileSync(safeSource(root,file),'utf8'));
  const manifest=text=>JSON.parse(text.slice(text.indexOf('= [')+2,text.lastIndexOf(']')+1).replace(/,\s*]/,']'));
  const chapter=manifest(texts[0]),story=manifest(texts[1]);
  if(chapter.length!==637||story.length!==1785)throw Error('review required for changed manifest');
  if(sha256(texts[2])!==reviewed.sourceSha256)throw Error('interpretive source drift');
  const tuples=[...texts[2].matchAll(/\{ campaignId: "([^"]+)", chapterId: "([^"]+)", path: "([^"]+)" \}/g)].map(([,campaignId,chapterId,path])=>({campaignId,chapterId,path}));
  if(tuples.length!==3||JSON.stringify(tuples)!==JSON.stringify(reviewed.assets.map(({sha256,...row})=>row)))throw Error('interpretive manifest mismatch');
  const paths=[...chapter.map(x=>'campaign-key-art/'+safeRelative(x)),...story.map(x=>'story-media/'+safeRelative(x)+'.webp'),...tuples.map(row=>'campaign-key-art/'+safeRelative(row.path))];
  if(paths.length!==2425||new Set(paths).size!==2425)throw Error('duplicate asset or overlapping manifests');
  for(const item of reviewed.assets)if(sha256(fs.readFileSync(safeSource(path.join(root,'public'),'campaign-key-art/'+item.path)))!==item.sha256)throw Error('interpretive asset drift');
  return {paths,counts:{chapter:637,story:1785,interpretive:3,total:2425},sourceHashes:Object.fromEntries(files.map((file,i)=>[file,sha256(texts[i])])),interpretive:reviewed.assets};
}
async function main(output) {
  safeOutput(output);const root=process.cwd();
  const inventory=buildInventory(root),{paths}=inventory;
  const sources=paths.map(x=>safeSource(path.join(root,'public'),x));
  const expected=['src/lib/image-cache.ts','src/lib/stories/media/url.ts','src/lib/campaign-art/interpretive-chapters.ts'];const seen=new Set();
  await build({configFile:false,envDir:false,publicDir:false,logLevel:'warn',resolve:{alias:{'@':path.join(root,'src')}},plugins:[{name:'no-backend',enforce:'pre',resolveId(id){if(id==='@/integrations/supabase/client'||id===path.join(root,'src/integrations/supabase/client')||id===path.join(root,'src/integrations/supabase/client.ts'))return '\0forbidden-sdk';if(id.includes('supabase'))throw Error('unexpected SDK dependency');},load(id){if(id==='\0forbidden-sdk')return 'export const supabase=new Proxy({}, {get(){globalThis.__decodeForbidden++;throw Error("Signing forbidden");}});';},transform(_code,id){if(id.includes('/src/integrations/')||id.includes('/node_modules/@supabase/'))throw Error('backend dependency');for(const item of expected)if(id===path.join(root,item))seen.add(item);},generateBundle(){if(seen.size!==expected.length)throw Error('canonical resolver missing');}}],build:{outDir:output,emptyOutDir:false,minify:false,rolldownOptions:{input:'tests/offline/browser/image-decode-fixture.ts',output:{entryFileNames:'fixture.js'}}}});
  let bytes=0;paths.forEach((p,i)=>{const target=path.join(output,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(sources[i],target);bytes+=fs.statSync(target).size;});
  fs.writeFileSync(path.join(output,'malformed.webp'),'not an image');
  fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="/fixture.js"></script>');
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({...inventory,bytes}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main(process.argv[2]);
