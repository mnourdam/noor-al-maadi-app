/** Dormant display-only adapter. No production imports, activation registry, I/O or writes. */
import type { CampaignChapter } from '../../../types/campaign';
export const PILOT_MAPPING = 'campaign-mcq-display-v1';
export type CampaignRow = { id: string; data: { chapters: CampaignChapter[]; [key: string]: unknown }; [key: string]: unknown };
type Unit = { unit_key: string; entity_key: string; field_path: string; source_ar: string; source_sha256: string; composite_entity_semantic_sha256: string; canonical_mapping_version: string };
export type Bundle = { campaign_id: string; revision: string; locale: string; units: (Unit & { target_text?: string; translation?: string; review_state?: string })[] };
export type Evidence = { state: 'release_approved'; bundle_sha256: string; source_revision: string; locale: string; canonical_mapping_version: string; information_coverage: 'reviewed_no_known_gaps' };
const targetFields = { en: 'target_text', fr: 'target_text', ur: 'translation', id: 'translation', tr: 'translation' } as const;

/** v2 Python manifest parity on supported JSON. Reject fractional/unsafe numbers rather than silently diverge. */
export function canonicalJson(v: unknown): string {
  if (typeof v === 'string') {
    if (Array.from(v).some(c => { const n=c.codePointAt(0)!; return n>=0xd800 && n<=0xdfff; })) throw new Error('unpaired surrogate');
    return JSON.stringify(v);
  }
  if (v === null || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0)) return String(v);
  if (Array.isArray(v)) {
    for(let i=0;i<v.length;i++) if(!Object.prototype.hasOwnProperty.call(v,i)) throw new Error('sparse array');
    return '[' + v.map(canonicalJson).join(',') + ']';
  }
  if (typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype)
    return '{' + Object.keys(v).sort().map(k => {
      // Current source keys are BMP; reject astral keys rather than claim Python sort parity.
      if(Array.from(k).some(c=>c.codePointAt(0)!>0xffff)) throw new Error('unsupported astral key');
      return canonicalJson(k) + ':' + canonicalJson((v as Record<string, unknown>)[k]);
    }).join(',') + '}';
  throw new Error('unsupported canonical JSON');
}
export async function sha256(v: unknown): Promise<string> {
  if(typeof v==='string') canonicalJson(v); // reject invalid UTF-8 surrogate input
  const bytes = new TextEncoder().encode(typeof v === 'string' ? v : canonicalJson(v));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
}
const exclude = /(url|path|token|secret|created_by|owner|verified_by|previous_draft|metadata|related_entities|unlock|image|media|checksum)/i;
function walk(v: unknown, path = ''): [string,string][] {
  if (Array.isArray(v)) return v.flatMap((x,i) => walk(x,path+'/'+(x && typeof x === 'object' && x.id ? '@'+x.id : i)));
  if (v && typeof v === 'object') return Object.entries(v).filter(([k]) => !exclude.test(k)).flatMap(([k,x]) => walk(x,path+'/'+k));
  return typeof v === 'string' && /[\u0600-\u06ff]/.test(v) && !v.includes('://') ? [[path,v]] : [];
}
/** Recompute from complete actual canonical row, not hashes supplied by translations. */
export async function regenerateCampaignSource(row: CampaignRow, mapping = PILOT_MAPPING): Promise<Unit[]> {
  const units: Unit[] = []; const seen = new Set<string>();
  const add = async (key: string, payload: unknown, full: unknown, parent: string|null) => {
    if (seen.has(key)) throw new Error('duplicate canonical identity'); seen.add(key);
    const semantic = await sha256({contract:'composite-v1',entity_key:key,complete_entity:full,parent_semantic_sha256:parent,canonical_mapping_version:mapping});
    for (const [field,text] of walk(payload)) units.push({unit_key:key+field,entity_key:key,field_path:field,source_ar:text,source_sha256:await sha256(text),composite_entity_semantic_sha256:semantic,canonical_mapping_version:mapping});
    return semantic;
  };
  if (!row.id || !Array.isArray(row.data?.chapters) || !row.data.chapters.length) throw new Error('empty campaign');
  const {chapters,...base} = row.data;
  const parent = await add('campaign:'+row.id,base,row,null);
  for (const chapter of chapters) {
    if (!chapter.id || !Array.isArray(chapter.activities)) throw new Error('invalid chapter');
    const {activities,...baseChapter} = chapter;
    const chapterParent = await add('chapter:'+row.id+'/'+chapter.id,baseChapter,chapter,parent);
    for (const activity of activities) {
      if (!activity.id) throw new Error('invalid activity');
      await add('activity:'+row.id+'/'+chapter.id+'/'+activity.id,activity,activity,chapterParent);
    }
  }
  if (!units.length || new Set(units.map(u=>u.unit_key)).size!==units.length) throw new Error('empty or duplicate units');
  return units;
}
function immutableSnapshot<T>(value: T): T {
  const copy=JSON.parse(canonicalJson(value)) as T;
  const freeze=(v: unknown): void => { if(v && typeof v==='object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(copy); return copy;
}
export type Display = Readonly<{locale:string; reason:string; campaignId:string; chapterId:string; activityId:string; prompt:string; contextText?:string; hint?:string; feedbackCorrect?:string; feedbackWrong?:string; options:readonly Readonly<{canonicalIndex:number; label:string}>[]}>;
/** Call on each current source revision. No selection/scoring callback is installed here.
 * The caller must use canonicalIndex with ORIGINAL options / shuffle.toOriginal, never translated labels.
 * Only MCQ/reading/decision display is implemented; no free-text/order/matching adapter. */
export async function buildActivityDisplay(row: CampaignRow, chapterId: string, activityId: string, revision: string,
  bundle: unknown, evidence: unknown = null): Promise<Display> {
  // Snapshot synchronously before the first await: later source mutation cannot produce a mixed view.
  const snapshot = immutableSnapshot(row);
  const chapter = snapshot.data.chapters.find(c=>c.id===chapterId);
  const activity = chapter?.activities.find(a=>a.id===activityId);
  if (!activity) throw new Error('unknown canonical activity'); // caller must not render an invented activity
  const original = (reason: string): Display => Object.freeze({locale:'ar',reason,campaignId:snapshot.id,chapterId,activityId,
    prompt:activity.prompt,contextText:activity.contextText,hint:activity.hint,feedbackCorrect:activity.feedbackCorrect,feedbackWrong:activity.feedbackWrong,
    options:Object.freeze((activity.options??[]).map((label,canonicalIndex)=>Object.freeze({canonicalIndex,label})))});
  try {
    if (!['multiple_choice','reading_then_question','decision_choice'].includes(activity.type)) return original('unsupported_activity_type');
    if (!bundle || typeof bundle!=='object' || !evidence || typeof evidence!=='object') return original('not_release_approved');
    // Snapshot approval and bundle before first await: no post-hash mutation may enter display.
    const b=immutableSnapshot(bundle) as Bundle; const e=immutableSnapshot(evidence) as Evidence;
    if (e.state!=='release_approved' || e.canonical_mapping_version!==PILOT_MAPPING || e.information_coverage!=='reviewed_no_known_gaps') return original('not_release_approved');
    if (!(b.locale in targetFields) || b.campaign_id!==snapshot.id || b.revision!==revision || e.source_revision!==revision || e.locale!==b.locale) return original('source_or_locale_mismatch');
    if (e.bundle_sha256!==await sha256(b)) return original('approval_bundle_mismatch');
    const source=await regenerateCampaignSource(snapshot); const byKey=new Map(b.units.map(u=>[u.unit_key,u]));
    if (b.units.length!==source.length || byKey.size!==source.length) return original('incomplete_or_duplicate_bundle');
    const labels=new Map<string,string>(); const field=targetFields[b.locale as keyof typeof targetFields];
    for (const s of source) {
      const t=byKey.get(s.unit_key);
      if (!t || Object.entries(s).some(([k,v])=>t[k as keyof Unit]!==v)) return original('stale_source_or_semantics');
      if (t.review_state!=='release_approved' || typeof t[field]!=='string' || !t[field]!.trim()) return original('unit_not_release_approved');
      labels.set(s.unit_key,t[field]!);
    }
    const prefix='activity:'+snapshot.id+'/'+chapterId+'/'+activityId;
    const label=(field:string, fallback:string|undefined) => fallback===undefined ? undefined : labels.get(prefix+'/'+field)??fallback;
    // Refuse any un-inventoried selected display string to avoid silent mixed-language display.
    for (const field of ['prompt','contextText','hint','feedbackCorrect','feedbackWrong'] as const)
      if (activity[field] && !labels.has(prefix+'/'+field)) return original('uncovered_display_field');
    if ((activity.options??[]).some((_,i)=>!labels.has(prefix+'/options/'+i))) return original('uncovered_option');
    return Object.freeze({locale:b.locale,reason:'guarded_display_only',campaignId:snapshot.id,chapterId,activityId,
      prompt:label('prompt',activity.prompt)!,contextText:label('contextText',activity.contextText),hint:label('hint',activity.hint),
      feedbackCorrect:label('feedbackCorrect',activity.feedbackCorrect),feedbackWrong:label('feedbackWrong',activity.feedbackWrong),
      options:Object.freeze((activity.options??[]).map((_,canonicalIndex)=>Object.freeze({canonicalIndex,label:labels.get(prefix+'/options/'+canonicalIndex)!})))});
  } catch { return original('malformed_or_unverifiable'); }
}
