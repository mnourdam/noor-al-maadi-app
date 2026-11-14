// Disposable experiment, not an application worker. No credentials or network client.
import sharp from 'sharp';
const MAX=2097152;
class ValidationRejection extends Error {}
sharp.cache(false); sharp.concurrency(1);
try {
  let size=0; const chunks=[];
  for await(const chunk of process.stdin){ size+=chunk.length; if(size>MAX) throw new ValidationRejection(); chunks.push(chunk); }
  const input=Buffer.concat(chunks);
  if(!input.length) throw new ValidationRejection();
  const jpeg=input[0]===255&&input[1]===216&&input[2]===255;
  const png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP';
  if(!jpeg&&!png&&!webp)throw new ValidationRejection();
  // libvips can silently expose APNG as a single PNG frame. Reject animation
  // chunks using bounded PNG framing, not untrusted metadata or substring search.
  if(input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    let offset=8,ended=false;
    while(offset<input.length){
      if(input.length-offset<12) throw new ValidationRejection();
      const length=input.readUInt32BE(offset);
      if(length>input.length-offset-12) throw new ValidationRejection();
      const type=input.toString('ascii',offset+4,offset+8);
      if(['acTL','fcTL','fdAT'].includes(type)) throw new ValidationRejection();
      offset+=length+12;
      if(type==='IEND'){if(length!==0||offset!==input.length)throw new ValidationRejection();ended=true;break;}
    }
    if(!ended)throw new ValidationRejection();
  }
  const options={failOn:'warning',limitInputPixels:24000000,unlimited:false};
  const meta=await sharp(input,options).metadata();
  if(!['jpeg','png','webp'].includes(meta.format) || !meta.width || !meta.height || meta.width*meta.height>24000000 || (meta.pages??1)!==1) throw new ValidationRejection();
  const output=await sharp(input,options).autoOrient().flatten({background:'#ffffff'}).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).timeout({seconds:3}).toBuffer();
  if(!output.length || output.length>MAX) throw Error();
  const verified=await sharp(output,options).metadata();
  if(verified.format!=='jpeg'||!verified.width||!verified.height||verified.width>1600||verified.height>1600||verified.exif||verified.icc||verified.xmp||verified.iptc) throw Error();
  process.stdout.write(output);
} catch (error) { process.exitCode=error instanceof ValidationRejection?2:3; }
