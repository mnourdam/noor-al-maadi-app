import {build} from 'vite';
import tailwind from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
const output=process.argv[2];
if(!output || !path.isAbsolute(output) || !path.resolve(output).startsWith('/tmp/irth-reread-shell-'))throw Error('isolated temporary output required');
const root=process.cwd();
const stubs=new Map([
 ['@tanstack/react-router',`import React from 'react';export const Link=({to,children,...props})=>React.createElement('a',{...props,href:to},children);export const useRouterState=({select})=>select({location:{pathname:'/synthetic'}});`],
 [path.resolve('src/components/HUD.tsx'),'export const HUD=()=>null;'],
 [path.resolve('src/components/FriendNotificationsPoller.tsx'),'export const FriendNotificationsPoller=()=>null;'],
 [path.resolve('src/lib/androidFreezeDiagnostics.ts'),'export const androidMark=()=>{};export const isAndroidUltraStableMode=()=>false;'],
 [path.resolve('src/lib/androidQuietMode.ts'),'export const isSectionEnabled=()=>false;'],
 [path.resolve('src/lib/navigation/overlay-registration.tsx'),'export const OverlayDismissRegistration=()=>null;'],
]);
const expected=['src/components/AppShell.tsx','src/components/UiLanguageChooser.tsx','src/lib/ui-language/store.ts','src/lib/ui-language/messages.ts','src/components/imported-campaign/ChapterReadingReview.tsx','src/components/imported-campaign/RichReadingText.tsx','src/components/ui/dialog.tsx'];
const seen=new Set();
const boundary={name:'synthetic-shell-boundary',enforce:'pre',async resolveId(id,importer){
 for(const ext of ['', '.ts','.tsx'])if(stubs.has(id+ext))return '\0shell-stub:'+id+ext;
 if(importer && id.startsWith('.')){const candidate=path.resolve(path.dirname(importer),id);for(const ext of ['', '.ts','.tsx'])if(stubs.has(candidate+ext))return '\0shell-stub:'+candidate+ext;}
 if(id.includes('/integrations/') || id.includes('supabase'))throw Error('backend module prohibited');
},load(id){if(id.startsWith('\0shell-stub:'))return stubs.get(id.slice('\0shell-stub:'.length));},transform(_code,id){
 if(id.includes('/src/integrations/')||id.includes('/node_modules/@supabase/'))throw Error('backend module prohibited');
 for(const item of expected)if(id===path.join(root,item))seen.add(item);
},generateBundle(){if(expected.some(x=>!seen.has(x)))throw Error('real surface dependency missing');}};
await build({configFile:false,envDir:false,publicDir:false,plugins:[boundary,tailwind()],logLevel:'warn',resolve:{alias:{'@':path.resolve('src')}},define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:output,emptyOutDir:false,minify:false,rolldownOptions:{input:path.resolve('tests/offline/browser/reread-shell-fixture.tsx'),output:{entryFileNames:'fixture.js',assetFileNames:'assets/[name]-[hash][extname]'}}}});
const css=fs.readdirSync(path.join(output,'assets')).filter(x=>x.endsWith('.css'));
if(!css.length)throw Error('production CSS absent');
fs.writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="ar" dir="rtl" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+css.map(x=>`<link rel="stylesheet" href="/assets/${x}">`).join('')+'</head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>');
