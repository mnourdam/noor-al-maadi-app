import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FeedbackReplyComposer} from '@/components/feedback/FeedbackReplyComposer';
import {getIssueThread} from '@/lib/feedback/api';
import {FeedbackMessageImages} from '@/components/feedback/FeedbackMessageImages';
import {feedbackAttachmentProtocol} from '@/lib/feedback/attachment-protocol';
import {FeedbackImages} from '@/components/feedback/FeedbackImages';
import {supabase} from '@/integrations/supabase/client';
import {setActiveOwnerInternal} from '@/lib/identity/owner';
import {parseCanonicalImage,type CanonicalImage} from '@/lib/feedback/canonical-images';
const g=globalThis as any;
let descriptor:CanonicalImage,owner:string,started=false;
const root=createRoot(document.getElementById('root')!);
let sent=0;
function SenderScene({issue,staff}:{issue:string;staff:boolean}){const [messages,setMessages]=useState<any[]>([]);return <><FeedbackReplyComposer imageProtocol={feedbackAttachmentProtocol} staff={staff} issueId={issue} onSent={async()=>{sent++;const result=await getIssueThread(issue);if(result.issue.id!==issue || result.issue.status!=='new' || !Array.isArray(result.messages) || result.messages.length!==(staff?3:2))throw Error('canonical refresh');const canonical=result.messages.filter(m=>m.canonical_attachments_v1?.length);if(canonical.length!==1 || canonical[0].body!=='canonical browser send')throw Error('canonical thread projection');g.__threadEvidence={status:result.issue.status,count:result.messages.length,canonicalCount:canonical.length,authorRole:canonical[0].author_role,internal:canonical[0].is_internal,legacyRetained:result.messages.some(m=>m.body==='legacy public'&&JSON.stringify(m.attachments)==='[{"legacy_fixture":true}]')};setMessages(result.messages);}}/>{messages.map(m=><section key={m.id}><p>{m.body}</p><FeedbackMessageImages message={m}/></section>)}</>;}
const records:{url:string;revoked:boolean;sha256:string|null}[]=[];
const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
URL.createObjectURL=(blob:Blob|MediaSource)=>{
 if(!(blob instanceof Blob))throw Error('fixture expects Blob');
 const url=create(blob),record={url,revoked:false,sha256:null as string|null};records.push(record);
 void blob.arrayBuffer().then(b=>crypto.subtle.digest('SHA-256',b)).then(d=>{record.sha256=Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,'0')).join('');});
 return url;
};
URL.revokeObjectURL=(url:string)=>{const record=records.find(r=>r.url===url);if(record)record.revoked=true;revoke(url);};
function show(){root.render(<FeedbackImages protocol="canonical-v1" attachments={[descriptor]}/>);}
g.canonicalBrowser={
 async start(p:{api:string;anon:string;email:string;password:string;uid:string;mid:string}){
  if(started)throw Error('already started');started=true;
  g.__canonicalFixture={api:p.api,anon:p.anon};
  const auth=await supabase.auth.signInWithPassword({email:p.email,password:p.password});
  if(auth.error || auth.data.user?.id!==p.uid)throw Error('actor login');
  owner=p.uid;setActiveOwnerInternal(`user:${owner}`);
  const response=await supabase.rpc('fixture_canonical_descriptor' as never,{mid:p.mid} as never);
  const parsed=parseCanonicalImage(response.data);if(response.error || !parsed || parsed.message_id!==p.mid)throw Error('actor descriptor');descriptor=parsed;show();return true;
 },
 showSender(p:{issue:string;staff:boolean}){root.render(<SenderScene issue={p.issue} staff={p.staff}/>);},
 sent(){return sent;},
 retireIdentity(){setActiveOwnerInternal('guest:canonical-browser');},
 restoreIdentity(){setActiveOwnerInternal(`user:${owner}`);show();},
 evidence(){const image=document.querySelector('img');return {created:records.length,revoked:records.filter(r=>r.revoked).length,exactCurrentOwned:!!image && records.some(r=>r.url===image.getAttribute('src')&&!r.revoked),sha256:records.at(-1)?.sha256??null,complete:image?.complete??false,width:image?.naturalWidth??0,height:image?.naturalHeight??0};},
};
