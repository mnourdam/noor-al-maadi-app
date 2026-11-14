import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const MAX=2097152;
/** Test harness only. One child at a time; overflow and deadline kill the child. */
export function createDecoder({worker=new URL('./child.mjs',import.meta.url),deadlineMs=5000}={}){
  let busy=false;
  return async function decode(input){
    if(!Buffer.isBuffer(input)||!input.length||input.length>MAX) throw Error('input_rejected');
    if(busy) throw Error('busy');
    if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>10000) throw Error('deadline');
    busy=true;
    try {return await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--max-old-space-size=128',worker.pathname],{stdio:['pipe','pipe','ignore'],env:{PATH:process.env.PATH,LANG:'C',VIPS_CONCURRENCY:'1'}});
      let reason=null,size=0;const chunks=[];
      const stop=(why)=>{reason??=why;child.kill('SIGKILL');};
      const timer=setTimeout(()=>stop('deadline'),deadlineMs);
      child.on('error',()=>{reason??='spawn';});
      child.stdin.on('error',()=>{});
      child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX)stop('output_limit');else chunks.push(chunk);});
      child.on('close',(code,signal)=>{
        clearTimeout(timer);
        if(reason||code!==0||signal||!size)return reject(Error(reason??(code===2&&!signal?'decode_rejected':'decoder_infrastructure')));
        const bytes=Buffer.concat(chunks);resolve({bytes,sha256:createHash('sha256').update(bytes).digest('hex')});
      });
      child.stdin.end(input);
    });} finally {busy=false;}
  };
}
