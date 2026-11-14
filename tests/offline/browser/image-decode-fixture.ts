import {resolveImageUrl} from '@/lib/image-cache';
import {resolveCachedStoryMediaUrl} from '@/lib/stories/media/url';
import {OFFLINE_CHAPTER_IMAGE_PATHS} from '@/lib/campaign-art/chapter-pack.generated';
import {OFFLINE_STORY_MEDIA_IDS} from '@/lib/stories/media/offline-pack.generated';
import {INTERPRETIVE_CHAPTER_IMAGES} from '@/lib/campaign-art/interpretive-chapters';
const g=globalThis as any;
g.__decodeForbidden=0;
const denied=()=>{g.__decodeForbidden++;throw Error('API/cache access forbidden');};
g.fetch=denied;Object.defineProperty(g,'caches',{configurable:true,value:{open:denied}});
async function decode(src:string){const img=new Image();let timer:ReturnType<typeof setTimeout>|undefined;try{img.src=src;await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('decode deadline')),15000);})]);if(!img.naturalWidth||!img.naturalHeight)throw Error('empty image');return [img.naturalWidth,img.naturalHeight];}finally{clearTimeout(timer);img.removeAttribute('src');}}
g.runDecode=async()=>{
 const deadline=performance.now()+600000;let index=0,count=0,maxWidth=0,maxHeight=0;
 const jobs=[...[...OFFLINE_CHAPTER_IMAGE_PATHS,...INTERPRETIVE_CHAPTER_IMAGES.map(row=>row.path)].map(p=>({expected:'/campaign-key-art/'+p,resolve:()=>resolveImageUrl('https://synthetic.invalid/storage/v1/object/sign/campaign-key-art/'+p+'?token=synthetic')})),...OFFLINE_STORY_MEDIA_IDS.map(id=>({expected:'/story-media/'+id+'.webp',resolve:()=>resolveCachedStoryMediaUrl({id,storage_bucket:'story-media',storage_path:'synthetic.webp'})}))];
 if(jobs.length!==2425||INTERPRETIVE_CHAPTER_IMAGES.length!==3||new Set(jobs.map(job=>job.expected)).size!==2425)throw Error('manifest changed');
 async function worker(){while(index<jobs.length){if(performance.now()>deadline)throw Error('total deadline');const job=jobs[index++];const result=await job.resolve();if(result!==job.expected)throw Error('wrong resolved path');const [w,h]=await decode(result);maxWidth=Math.max(maxWidth,w);maxHeight=Math.max(maxHeight,h);count++;}}
 await Promise.all(Array.from({length:4},worker));
 for(const src of ['/malformed.webp','/missing.webp']){let rejected=false;try{await decode(src);}catch(error){rejected=error instanceof DOMException && error.name==='EncodingError';}if(!rejected)throw Error('negative decode accepted');}
 if(count!==2425||g.__decodeForbidden!==0)throw Error('incomplete or network access');return {count,chapter:637,story:1785,interpretive:3,maxWidth,maxHeight,negativeControls:2,forbidden:g.__decodeForbidden};
};
