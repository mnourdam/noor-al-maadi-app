/** Inactive v1 contract. Digest equality is integrity, never authorization. */
export const CANONICAL_BUCKET = 'feedback-images-canonical';
export type CanonicalImage = { version: 1; id: string; message_id: string; key: string; mime: 'image/jpeg'; bytes: number; sha256: string };
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const idPattern=new RegExp(`^${uuid}$`),keyPattern=new RegExp(`^${uuid}/${uuid}$`);
export function parseCanonicalImage(value: unknown): CanonicalImage|null {
 if(!value || typeof value!=='object' || Array.isArray(value))return null;
 const v=value as CanonicalImage;
 if(Object.keys(v).sort().join(',')!=='bytes,id,key,message_id,mime,sha256,version' || v.version!==1 || typeof v.id!=='string' || !idPattern.test(v.id) || typeof v.message_id!=='string' || !idPattern.test(v.message_id) || typeof v.key!=='string' || !keyPattern.test(v.key) || v.key.split('/')[1]!==v.id || v.mime!=='image/jpeg' || !Number.isInteger(v.bytes) || v.bytes<1 || v.bytes>2097152 || typeof v.sha256!=='string' || !/^[0-9a-f]{64}$/.test(v.sha256))return null;
 return {version:1,id:v.id,message_id:v.message_id,key:v.key,mime:v.mime,bytes:v.bytes,sha256:v.sha256};
}
export type CanonicalClient = {
 scope:()=>string; user:()=>string|null;
 session:()=>Promise<{data:{session:{user:{id:string}}|null};error:unknown}>;
 download:(bucket:string,key:string)=>Promise<{data:Blob|null;error:unknown}>;
};
export async function downloadCanonical(image:CanonicalImage,client:CanonicalClient):Promise<Blob>{
 const parsed=parseCanonicalImage(image);if(!parsed)throw new Error('Invalid canonical attachment');
 const scope=client.scope(),user=client.user();
 const check=()=>{if(!user || client.user()!==user || client.scope()!==scope)throw new Error('Attachment identity retired');};
 const session=async()=>{check();const result=await client.session();check();if(result.error || result.data.session?.user.id!==user)throw new Error('Attachment session mismatch');};
 await session();const result=await client.download(CANONICAL_BUCKET,parsed.key);check();
 if(result.error || !result.data)throw new Error('Attachment unavailable');
 const blob=result.data;if(blob.type!==parsed.mime || blob.size!==parsed.bytes)throw new Error('Attachment metadata mismatch');
 const bytes=await blob.arrayBuffer();check();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');check();
 if(digest!==parsed.sha256 || new Uint8Array(bytes)[0]!==255 || new Uint8Array(bytes)[1]!==216 || new Uint8Array(bytes)[2]!==255)throw new Error('Attachment integrity mismatch');
 await session();check();return blob;
}
