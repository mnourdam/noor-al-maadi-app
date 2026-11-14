import type {OriginalReference} from '@/types/encyclopediaArticle';
/** Link only an explicitly authored safe URL; never derive one from citation text. */
function safeUrl(value:string){
 if(!/^https?:\/\//i.test(value)||/[\u0000-\u0020\u007f]/.test(value)||value.trim()!==value)return false;
 try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!!url.hostname;}catch{return false;}
}
export function EncyclopediaOriginalReferences({references}:{references?:OriginalReference[]}){
 if(!references?.length)return null;
 return <aside lang="ar" dir="rtl" aria-label="المراجع الأصلية" className="mt-6">
  <h2>المراجع كما وردت في المصدر الأصلي؛ عرضها لا يعني التحقق منها</h2>
  {references.map((ref,i)=><p key={i} className="whitespace-pre-wrap">
   {typeof ref==='string' ? ref : <>
    {ref.label}{' — '}{ref.value}
    {ref.url!==undefined && <>{' '}{safeUrl(ref.url)
     ? <a href={ref.url} target="_blank" rel="noreferrer noopener">{ref.url}</a>
     : <span>{ref.url}</span>}</>}
   </>}
  </p>)}
 </aside>;
}
