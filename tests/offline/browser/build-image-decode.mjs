import fs from 'node:fs';
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
async function main(output) {
  safeOutput(output);const root=process.cwd();
  const manifest=(file)=>{const text=fs.readFileSync(file,'utf8');const body=text.slice(text.indexOf('= [')+2,text.lastIndexOf(']')+1);return JSON.parse(body.replace(/,\s*]/,']'));};
  const chapter=manifest('src/lib/campaign-art/chapter-pack.generated.ts'),story=manifest('src/lib/stories/media/offline-pack.generated.ts');
  if(chapter.length!==637||story.length!==1785)throw Error('review required for changed manifest');
  const paths=[...chapter.map(x=>'campaign-key-art/'+safeRelative(x)),...story.map(x=>'story-media/'+safeRelative(x)+'.webp')];
  if(new Set(paths).size!==2422)throw Error('duplicate asset');
  const sources=paths.map(x=>safeSource(path.join(root,'public'),x));
  const expected=['src/lib/image-cache.ts','src/lib/stories/media/url.ts'];const seen=new Set();
  await build({configFile:false,envDir:false,publicDir:false,logLevel:'warn',resolve:{alias:{'@':path.join(root,'src')}},plugins:[{name:'no-backend',enforce:'pre',resolveId(id){if(id==='@/integrations/supabase/client'||id===path.join(root,'src/integrations/supabase/client')||id===path.join(root,'src/integrations/supabase/client.ts'))return '\0forbidden-sdk';if(id.includes('supabase'))throw Error('unexpected SDK dependency');},load(id){if(id==='\0forbidden-sdk')return 'export const supabase=new Proxy({}, {get(){globalThis.__decodeForbidden++;throw Error("Signing forbidden");}});';},transform(_code,id){if(id.includes('/src/integrations/')||id.includes('/node_modules/@supabase/'))throw Error('backend dependency');for(const item of expected)if(id===path.join(root,item))seen.add(item);},generateBundle(){if(seen.size!==expected.length)throw Error('canonical resolver missing');}}],build:{outDir:output,emptyOutDir:false,minify:false,rolldownOptions:{input:'tests/offline/browser/image-decode-fixture.ts',output:{entryFileNames:'fixture.js'}}}});
  let bytes=0;paths.forEach((p,i)=>{const target=path.join(output,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(sources[i],target);bytes+=fs.statSync(target).size;});
  fs.writeFileSync(path.join(output,'malformed.webp'),'not an image');
  fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="/fixture.js"></script>');
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({paths,bytes}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main(process.argv[2]);
