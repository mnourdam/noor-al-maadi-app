import {build} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const output=process.argv[2];
if(!output||!path.isAbsolute(output))throw Error('absolute isolated output required');
await build({configFile:false,envFile:false,publicDir:false,resolve:{alias:{'@':path.resolve('src')}},define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('https://native-content.invalid'),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('synthetic-native-only'),'process.env.SUPABASE_URL':JSON.stringify('https://native-content.invalid'),'process.env.SUPABASE_PUBLISHABLE_KEY':JSON.stringify('synthetic-native-only'),'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:output,emptyOutDir:false,minify:false,rolldownOptions:{input:path.resolve('tests/offline/browser/native-content-entry.ts'),output:{entryFileNames:'fixture.js'}}}});
fs.writeFileSync(path.join(output,'index.html'),'<meta charset="utf-8"><script type="module" src="/fixture.js"></script>');
