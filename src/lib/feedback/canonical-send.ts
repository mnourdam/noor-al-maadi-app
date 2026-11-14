import {supabase} from '@/integrations/supabase/client';
import {getActiveOwner,getActiveUserId,getIdentityEpoch} from '@/lib/identity/owner';
import {validateImageFile,type ImageMessageDraft} from './images';
export class CanonicalImagePending extends Error { constructor(){super('Canonical image pending');} }
/** Dormant owner-only, one-image prototype contract. No client worker authority. */
export async function sendCanonicalFeedbackImage(d:ImageMessageDraft,valid:()=>boolean=()=>true):Promise<void>{
 const check=()=>{if(!valid() || d.owner!==getActiveOwner() || d.epoch!==getIdentityEpoch() || !getActiveUserId())throw new Error('Attachment scope retired');};
 const session=async()=>{check();const {data,error}=await supabase.auth.getSession();check();if(error || data.session?.user.id!==getActiveUserId())throw new Error('Attachment session mismatch');};
 if(d.internal || d.images.length!==1 || d.body.length>5000)throw new Error('Canonical sending supports one owner image only');
 const image=d.images[0];if(image.blob.type!=='image/jpeg')throw new Error('Canonical sender requires prepared JPEG');
 await session();await validateImageFile(image.blob);check();
 const bytes=await image.blob.arrayBuffer();check();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');check();
 const binding={p_message_id:d.id,p_issue_id:d.issueId,p_body:d.body,p_image_id:image.id,p_digest:digest,p_bytes:image.blob.size};
 const reservation=await supabase.rpc('reserve_canonical_feedback_image_v1' as never,binding as never);check();if(reservation.error)throw reservation.error;
 const r=reservation.data as unknown as {version:number;image_id:string;path:string;status:string};
 if(!r || Object.keys(r).sort().join(',')!=='image_id,path,status,version' || r.version!==1 || r.image_id!==image.id || r.path!==`${getActiveUserId()}/${image.id}` || !['upload','ready'].includes(r.status))throw new Error('Invalid canonical reservation');
 if(!image.uploaded && r.status!=='ready'){
  await session();const upload=await supabase.storage.from('feedback-images-quarantine').upload(r.path,image.blob,{contentType:'image/jpeg',upsert:false});check();
  // A 409 is uncertain, not an upload receipt or trusted terminal-writer fact.
  if(upload.error)throw upload.error;await session();image.uploaded=true;
 }
 await session();const result=await supabase.rpc('finalize_canonical_feedback_image_v1' as never,binding as never);check();if(result.error)throw result.error;
 await session();const receipt=result.data as unknown as {status:string;message_id:string};
 if(!receipt || Object.keys(receipt).sort().join(',')!=='message_id,status' || receipt.message_id!==d.id)throw new Error('Invalid canonical publication receipt');
 if(receipt.status==='pending')throw new CanonicalImagePending();if(receipt.status!=='published')throw new Error('Unconfirmed canonical publication');
}
