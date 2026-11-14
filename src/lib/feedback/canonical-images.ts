import {supabase} from '@/integrations/supabase/client';
import {getActiveUserId} from '@/lib/identity/owner';
import {currentImageScope} from './images';
import {downloadCanonical,type CanonicalImage} from './canonical-image-contract';
export {parseCanonicalImage,type CanonicalImage} from './canonical-image-contract';
// No current product caller opts into this protocol; legacy remains the default.
export function downloadCanonicalImage(image:CanonicalImage):Promise<Blob>{
 return downloadCanonical(image,{scope:currentImageScope,user:getActiveUserId,session:()=>supabase.auth.getSession(),download:(bucket,key)=>supabase.storage.from(bucket).download(key)});
}
