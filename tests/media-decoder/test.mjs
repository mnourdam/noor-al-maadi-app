import {test} from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {createHash} from 'node:crypto';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {createDecoder} from './runner.mjs'; import {crc32,deflateSync} from 'node:zlib';
const base={create:{width:24,height:12,channels:4,background:{r:20,g:40,b:60,alpha:0}}};
for(const format of ['jpeg','png','webp'])test(`actual ${format} accepted, canonical JPEG and digest`,async()=>{const input=await sharp(base)[format]().toBuffer();const out=await createDecoder()(input);const m=await sharp(out.bytes).metadata();assert.equal(m.format,'jpeg');assert.equal(m.width,24);assert.equal(m.height,12);assert.equal(out.sha256,createHash('sha256').update(out.bytes).digest('hex'));assert.equal(m.exif,undefined);});
test('orientation, resize, metadata stripping and white flatten',async()=>{const input=await sharp({create:{width:1700,height:20,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).withMetadata({orientation:6}).png().toBuffer();const source=await sharp(input).metadata();assert(source.exif);const out=await createDecoder()(input);const m=await sharp(out.bytes).metadata();assert.equal(m.height,1600);assert(m.width<20);for(const key of ['exif','icc','xmp','iptc','orientation'])assert.equal(m[key],undefined);const {data}=await sharp(out.bytes).raw().toBuffer({resolveWithObject:true});assert(data.every(x=>x>=250));});
test('malformed, truncated, unsupported and byte oversized rejected',async()=>{const jpg=await sharp(base).jpeg().toBuffer();for(const b of [Buffer.from('not an image'),jpg.subarray(0,40),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>'),Buffer.alloc(2097153)])await assert.rejects(createDecoder()(b));});
test('over pixel budget rejected using compact synthetic PNG',async()=>{const b=await sharp(base).png().toBuffer();b.writeUInt32BE(4900,16);b.writeUInt32BE(4900,20);b.writeUInt32BE(crc32(b.subarray(12,29)),29);assert(b.length<2097152);const m=await sharp(b,{limitInputPixels:false}).metadata();assert.equal(m.width*m.height,24010000);await assert.rejects(createDecoder()(b));});
test('animated WebP rejected rather than first-frame accepted',async()=>{const pixels=Buffer.alloc(4*4*3*2,128);pixels.fill(255,4*4*3);const b=await sharp(pixels,{raw:{width:4,height:8,channels:3,pageHeight:4}}).webp({loop:0,delay:[100,100]}).toBuffer();assert.equal((await sharp(b).metadata()).pages,2);await assert.rejects(createDecoder()(b));});
test('hard parent deadline kills noncooperating child; concurrency refuses second admission',async()=>{const dir=await mkdtemp(join(tmpdir(),'decoder-control-'));try{const file=join(dir,'hang.mjs');const marker=join(dir,'pid');await writeFile(file,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);const run=createDecoder({worker:pathToFileURL(file),deadlineMs:500});const pending=run(Buffer.from('x'));await assert.rejects(run(Buffer.from('x')),/busy/);await assert.rejects(pending,/deadline/);const pid=Number(await readFile(marker,'utf8'));assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});await assert.rejects(run(Buffer.from('x')),/deadline/);}finally{await rm(dir,{recursive:true,force:true});}});

test('parent bounds emitted output even from synthetic faulty child',async()=>{const dir=await mkdtemp(join(tmpdir(),'decoder-overflow-'));try{const file=join(dir,'overflow.mjs');await writeFile(file,`process.stdout.write(Buffer.alloc(2097153));setInterval(()=>{},1000);`);await assert.rejects(createDecoder({worker:pathToFileURL(file)})(Buffer.from('x')),/output_limit/);}finally{await rm(dir,{recursive:true,force:true});}});

test('two-frame APNG rejects even when native metadata reports only a static PNG',async()=>{
  function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(1,0);ih.writeUInt32BE(1,4);ih[8]=8;ih[9]=6;
  const ac=Buffer.alloc(8);ac.writeUInt32BE(2);
  function fc(seq){const b=Buffer.alloc(26);b.writeUInt32BE(seq,0);b.writeUInt32BE(1,4);b.writeUInt32BE(1,8);b.writeUInt16BE(1,20);b.writeUInt16BE(10,22);return b;}
  const first=deflateSync(Buffer.from([0,255,0,0,255]));
  const second=Buffer.concat([Buffer.from([0,0,0,2]),deflateSync(Buffer.from([0,0,255,0,255]))]);
  const b=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('acTL',ac),chunk('fcTL',fc(0)),chunk('IDAT',first),chunk('fcTL',fc(1)),chunk('fdAT',second),chunk('IEND',Buffer.alloc(0))]);
  const m=await sharp(b).metadata();assert.equal(m.format,'png');assert.equal(m.pages,undefined);
  // Non-vacuous counterfactual: the unchanged native pipeline accepts frame one.
  assert((await sharp(b).jpeg().toBuffer()).length>0);
  await assert.rejects(createDecoder()(b));
});
test('ordinary PNG containing animation words in text remains accepted',async()=>{
  const png=await sharp(base).png().toBuffer();
  const type=Buffer.from('tEXt'),data=Buffer.from('Comment\0acTL fcTL fdAT'),size=Buffer.alloc(4),crc=Buffer.alloc(4);
  size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  const b=Buffer.concat([png.subarray(0,33),size,type,data,crc,png.subarray(33)]);
  assert.equal((await sharp(b).metadata()).format,'png');
  assert.equal((await sharp((await createDecoder()(b)).bytes).metadata()).format,'jpeg');
});
test('PNG framing truncation, oversized chunk and missing IEND reject',async()=>{
  const png=await sharp(base).png().toBuffer();const oversized=Buffer.from(png);oversized.writeUInt32BE(0xffffffff,8);
  for(const b of [png.subarray(0,15),oversized,png.subarray(0,png.length-12),Buffer.concat([png,Buffer.from('trailing')])]) await assert.rejects(createDecoder()(b));
});

test('nonvalidation child exits and signals are infrastructure, not malformed input',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'decoder-infrastructure-'));
 try {
  for(const [name,source] of [['exit', 'process.exit(1)'],['signal', "process.kill(process.pid,'SIGKILL')"]]) {
   const file=join(dir,name+'.mjs');await writeFile(file,source);
   await assert.rejects(createDecoder({worker:pathToFileURL(file)})(Buffer.from('x')),/decoder_infrastructure/);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('child Sharp processing failure is infrastructure, never validation rejection',async()=>{
 // JPEG magic passes the explicit gate but invalid native metadata must fail closed.
 await assert.rejects(createDecoder()(Buffer.from([255,216,255,0,1])),/decoder_infrastructure/);
});
