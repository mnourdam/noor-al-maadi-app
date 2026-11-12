/** Dormant pre-transport intent storage. No dispatch, confirmation, delivery or admission. */
import { getActiveOwner, getIdentityEpoch, onOwnerChange } from '@/lib/identity/owner';
import { openSettlementDatabase } from './database';
import type { Json } from './transaction';
export interface JournalTarget { key: string; terms: string; level: 'activity' | 'chapter' | 'campaign' }
export interface JournalCommandInput {
  commandId: string;
  commandType: 'chapter-progress-attempt';
  protocol: 1;
  campaignId: string;
  chapterId: string;
  activityId: string;
  payload: Json;
  targets: JournalTarget[];
}
export interface JournalIntent extends JournalCommandInput {
  version: 1; owner: string; commandRevision: 1; payloadCanonical: string; commandCanonical: string;
}
export interface JournalEntitlement {
  version: 2; owner: string; key: string; terms: string;
  source: 'journal'; progress: 'pending'; reward: 'awaiting_confirmation';
  binding: { kind: 'journal-command-v1'; commandId: string; commandRevision: 1; payloadCanonical: string; commandCanonical: string };
}
const fail = (reason: string): never => { throw new Error(`journal:${reason}`); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
/** Exact canonical representation, not a cryptographic digest or authenticity proof. */
function canonical(v: unknown): string {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (Object.getOwnPropertySymbols(v).length || Object.keys(v).length !== v.length) fail('invalid-json');
    return '[' + Array.from({length:v.length},(_,i)=> {
      const d=Object.getOwnPropertyDescriptor(v,String(i));
      if (!d || !('value' in d)) fail('invalid-json');
      return canonical(d!.value);
    }).join(',') + ']';
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    if (Object.getOwnPropertySymbols(v).length) fail('invalid-json');
    return '{' + Object.keys(v).sort().map(k=> {
      const d=Object.getOwnPropertyDescriptor(v,k)!;
      if (!('value' in d)) fail('invalid-json');
      return JSON.stringify(k)+':'+canonical(d.value);
    }).join(',') + '}';
  }
  return fail('invalid-json');
}
function exactKeys(v: object, keys: string[]) {
  if (Object.keys(v).sort().join('|') !== keys.sort().join('|')) fail('invalid-shape');
}
function validateInput(input: JournalCommandInput) {
  exactKeys(input,['commandId','commandType','protocol','campaignId','chapterId','activityId','payload','targets']);
  if (!text(input.commandId) || input.commandType !== 'chapter-progress-attempt' || input.protocol !== 1 ||
      !text(input.campaignId) || !text(input.chapterId) || !text(input.activityId) ||
      !Array.isArray(input.targets) || !input.targets.length) fail('invalid-command');
  const payload=input.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.campaignId !== input.campaignId || payload.chapterId !== input.chapterId) fail('scope-mismatch');
  const seen=new Set<string>();
  for (const target of input.targets) {
    if (!target || typeof target !== 'object') fail('invalid-target');
    exactKeys(target,['key','terms','level']);
    if (!text(target.key) || !text(target.terms) || !['activity','chapter','campaign'].includes(target.level) || seen.has(target.key)) fail('invalid-target');
    seen.add(target.key);
  }
}
function entitlement(intent: JournalIntent, target: JournalTarget): JournalEntitlement {
  return {version:2,owner:intent.owner,key:target.key,terms:target.terms,source:'journal',progress:'pending',reward:'awaiting_confirmation',
    binding:{kind:'journal-command-v1',commandId:intent.commandId,commandRevision:1,payloadCanonical:intent.payloadCanonical,commandCanonical:intent.commandCanonical}};
}
function validateIntent(row: JournalIntent, owner: string, id: string) {
  if (!row || row.version !== 1 || row.owner !== owner || row.commandId !== id || row.commandRevision !== 1) fail('corrupt-intent');
  const {version,owner:_owner,commandRevision,payloadCanonical,commandCanonical,...input}=row;
  validateInput(input);
  if (payloadCanonical !== canonical(input.payload) || commandCanonical !== canonical(input)) fail('corrupt-intent');
}
const address=(owner:string,key:string)=>JSON.stringify([owner,key]);
export function journalIntentsForOwner(owner: string) {
  const epoch=getIdentityEpoch();
  const guard=()=> {if (!/^(user|guest):.+/.test(owner) || getActiveOwner()!==owner || getIdentityEpoch()!==epoch) fail('identity-changed');};
  guard();
  async function access(id: string, proposed?: JournalIntent): Promise<JournalIntent | undefined> {
    guard(); if (!text(id)) fail('invalid-command');
    const db=await openSettlementDatabase();
    try {
      guard();
      return await new Promise<JournalIntent | undefined>((resolve,reject)=> {
        const tx=db.transaction(['intents','entitlements'],proposed?'readwrite':'readonly');
        let error:unknown, result:JournalIntent|undefined;
        const abort=(e:unknown)=>{error=e;try{tx.abort();}catch{/* already committed */}};
        const off=onOwnerChange(()=>abort(new Error('journal:identity-changed')));
        const checked=(work:()=>void)=>{try{guard();work();}catch(e){abort(e);}};
        tx.oncomplete=()=>{off();try{guard();resolve(result?structuredClone(result):undefined);}catch(e){reject(e);}};
        tx.onabort=()=>{off();reject(error??tx.error??new Error('journal:storage-failed'));};
        checked(()=>{
          const intents=tx.objectStore('intents'), rows=tx.objectStore('entitlements');
          const request=intents.get(address(owner,id));
          const presence=intents.getKey(address(owner,id));
          presence.onsuccess=()=>checked(()=>{
            const present=presence.result !== undefined;
            const existing=request.result as JournalIntent|undefined;
            if (present) {validateIntent(existing as JournalIntent,owner,id);if(proposed && canonical(existing)!==canonical(proposed))fail('command-conflict');}
            const command=present ? existing : proposed;
            if (!command) return;
            let remaining=command.targets.length;
            for (const target of command.targets) {
              const expected=entitlement(command,target);
              const read=rows.get(address(owner,target.key));
              const rowPresence=rows.getKey(address(owner,target.key));
              rowPresence.onsuccess=()=>checked(()=>{
                if (present ? canonical(read.result)!==canonical(expected) : rowPresence.result!==undefined) fail('entitlement-conflict');
                if (--remaining!==0) return;
                if (!present) {
                  intents.add(command,address(owner,id));
                  for(const t of command.targets) rows.add(entitlement(command,t),address(owner,t.key));
                }
                result=command;
              });
            }
          });
        });
      });
    } finally {db.close();}
  }
  return {
    prepare(input: JournalCommandInput) {
      // Capture/validate immutable JSON synchronously before any IDB await.
      const captured=JSON.parse(canonical(input)) as JournalCommandInput;
      validateInput(captured);
      const proposed:JournalIntent={...captured,version:1,owner,commandRevision:1,payloadCanonical:canonical(captured.payload),commandCanonical:canonical(captured)};
      return access(captured.commandId,proposed);
    },
    readCommitted: (commandId:string)=>access(commandId),
  };
}
