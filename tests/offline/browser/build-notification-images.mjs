import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
const output = process.argv[2];
if (!output || !path.isAbsolute(output) || !path.resolve(output).startsWith('/tmp/irth-notification-images-')) throw Error('isolated temporary output required');
await build({ configFile: false, envFile: false, publicDir: false, logLevel: 'warn',
  resolve: { alias: { '@': path.resolve('src') } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: output, emptyOutDir: false, minify: false,
    rolldownOptions: { input: path.resolve('tests/offline/browser/notification-images-fixture.tsx'), output: { entryFileNames: 'fixture.js' } } },
});
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Synthetic notification image acceptance</title>
<style>body{margin:0}article{height:100px;display:flex;align-items:start}article img,article>span:first-child{width:56px;height:56px;flex-shrink:0}article>span:first-child{display:block}#action{position:fixed;right:0;top:0;z-index:2}</style>
<div id="app"></div><script type="module" src="/fixture.js"></script>`);
