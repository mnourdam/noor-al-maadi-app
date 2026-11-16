// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {webcrypto} from 'node:crypto';
import {buildActivityDisplay,regenerateCampaignSource,sha256,PILOT_MAPPING,canonicalJson,type CampaignRow,type Bundle,type Evidence} from '../../src/lib/campaigns/translation/pilot-overlay';
import {shuffleOptions} from '../../src/lib/campaigns/optionShuffle';
Object.defineProperty(globalThis,'crypto',{value:webcrypto, configurable:true});
const row=JSON.parse(gunzipSync(readFileSync('public/offline-snapshot.json.gz')).toString()).collections.admin_campaigns.find((c:CampaignRow)=>c.id==='abu-bakr-caliphate') as CampaignRow;
const chapter=row.data.chapters.find(c=>c.activities.some(a=>a.options?.length))!;
const activity=chapter.activities.find(a=>a.options?.length)!;
const revision='test-source-revision';
async function fixture() {
 const units=await regenerateCampaignSource(row);
 const bundle:Bundle={campaign_id:row.id,revision,locale:'en',units:units.map(u=>({...u,target_text:'display '+u.field_path,review_state:'release_approved'}))};
 const approval:Evidence={state:'release_approved',bundle_sha256:await sha256(bundle),source_revision:revision,locale:'en',canonical_mapping_version:PILOT_MAPPING,information_coverage:'reviewed_no_known_gaps'};
 return {bundle,approval};
}
const display=(r:CampaignRow,b:unknown,e:unknown)=>buildActivityDisplay(r,chapter.id,activity.id,revision,b,e);
describe('dormant campaign display overlay',()=>{
 it('reproduces real 168-unit v2 source and Python composite hash',async()=>{
  const units=await regenerateCampaignSource(row,'canonical-map-v1-unimplemented');
  expect(units).toHaveLength(168);
  expect(await sha256(units)).toBe('1bde72f025d55513d1a893f9dc06631ae78304f018e5e1e78a7648ae8d04a1ee');
  expect(units[0].source_sha256).toBe('fd2a92e131280d1176de7554a480365fb35ca6f260c2c8bb978a34a5489ceb0e');
  expect(units[0].composite_entity_semantic_sha256).toBe('8203347cd551762fe7be428c479bcb942fea9b0af1506b1f3c55bde3b1a1e26f');
 });
 it('defaults to Arabic and denies malformed/draft approvals',async()=>{
  const {bundle,approval}=await fixture();
  for(const bad of [null,[],true,'yes',{...approval,state:'linguistic_reviewed'}]) expect((await display(row,bundle,bad)).locale).toBe('ar');
 });
 it('renders separate labels with canonical IDs/index after actual shuffle, without mutating answers or rewards',async()=>{
  const {bundle,approval}=await fixture();const before=JSON.stringify(row);
  const view=await display(row,bundle,approval); expect(view.reason).toBe('guarded_display_only');
  expect(view.activityId).toBe(activity.id);expect(view.chapterId).toBe(chapter.id);expect(view.campaignId).toBe(row.id);
  const canonicalCorrect=typeof activity.correctAnswer==='number'?activity.correctAnswer:activity.options!.indexOf(String(activity.correctAnswer));
  const shuffled=shuffleOptions(activity.id,activity.options!,canonicalCorrect,0);
  expect(view.options[shuffled.toOriginal[shuffled.correctIndex]].canonicalIndex).toBe(canonicalCorrect);
  expect(JSON.stringify(row)).toBe(before);expect(Object.isFrozen(view.options)).toBe(true);
 });
 it('rejects changed prompt, options order, correctAnswer, rewards and ancestor ordering from current data',async()=>{
  const {bundle,approval}=await fixture();
  for(const mutate of [
   (r:CampaignRow)=>{r.data.chapters[0].title+='!'},
   (r:CampaignRow)=>{r.data.chapters.reverse()},
   (r:CampaignRow)=>{r.data.chapters.find(c=>c.id===chapter.id)!.activities.find(a=>a.id===activity.id)!.options!.reverse()},
   (r:CampaignRow)=>{r.data.chapters.find(c=>c.id===chapter.id)!.activities.find(a=>a.id===activity.id)!.correctAnswer='changed'},
   (r:CampaignRow)=>{r.data.chapters.find(c=>c.id===chapter.id)!.activities.find(a=>a.id===activity.id)!.xpReward=999},
  ]){const changed=structuredClone(row);mutate(changed);expect((await display(changed,bundle,approval)).reason).toBe('stale_source_or_semantics')}
 });
 it('denies duplicate, missing, stale mapping, empty translation and changed approved bundle',async()=>{
  const {bundle,approval}=await fixture();
  for(const mutate of [
   (b:Bundle)=>{b.units.pop()},(b:Bundle)=>{b.units[1]=b.units[0]},
   (b:Bundle)=>{b.units[0].canonical_mapping_version='other'},
   (b:Bundle)=>{b.units[0].target_text=''},
   (b:Bundle)=>{b.units[0].review_state='draft'},
  ]){const changed=structuredClone(bundle);mutate(changed);expect((await display(row,changed,{...approval,bundle_sha256:await sha256(changed)})).locale).toBe('ar')}
  expect((await display(row,{...bundle,locale:'fr'},approval)).locale).toBe('ar');
 });
 it('rejects unsupported activity type and non-inventoried display labels',async()=>{
  const {bundle,approval}=await fixture();const changed=structuredClone(row);
  changed.data.chapters.find(c=>c.id===chapter.id)!.activities.find(a=>a.id===activity.id)!.type='fill_blank';
  expect((await display(changed,bundle,approval)).reason).toBe('unsupported_activity_type');
  const ascii=structuredClone(row);ascii.data.chapters.find(c=>c.id===chapter.id)!.activities.find(a=>a.id===activity.id)!.hint='English-only source';
  const fresh={...bundle,units:(await regenerateCampaignSource(ascii)).map(u=>({...u,target_text:'label',review_state:'release_approved'}))};
  expect((await display(ascii,fresh,{...approval,bundle_sha256:await sha256(fresh)})).reason).toBe('uncovered_display_field');
 });
 it('snapshots translations and evidence before awaiting hashing',async()=>{
  const {bundle,approval}=await fixture();const pending=display(row,bundle,approval);
  for(const u of bundle.units)u.target_text='UNAPPROVED AFTER HASH';
  approval.canonical_mapping_version='mutated';approval.source_revision='mutated';
  const result=await pending;expect(result.reason).toBe('guarded_display_only');
  expect(result.prompt).not.toBe('UNAPPROVED AFTER HASH');
 });
 it('requires explicit chapter-to-question information coverage review',async()=>{
  const {bundle,approval}=await fixture();
  expect((await display(row,bundle,{...approval,information_coverage:'pending'})).locale).toBe('ar');
 });
 it('preserves selection and attempt shuffle across all five target locales, including duplicate labels',async()=>{
  const {bundle,approval}=await fixture();const before=JSON.stringify(row);
  const correct=typeof activity.correctAnswer==='number'?activity.correctAnswer:activity.options!.indexOf(String(activity.correctAnswer));
  for(const attempt of [0,1,2]) {
   const initial=shuffleOptions(activity.id,activity.options!,correct,attempt);
   for(const locale of ['en','fr','ur','id','tr']) {
    const localized={...bundle,locale,units:bundle.units.map(u=>({...u,target_text:'same label',translation:'same label'}))};
    const view=await display(row,localized,{...approval,locale,bundle_sha256:await sha256(localized)});
    expect(view.locale).toBe(locale);
    const rerender=shuffleOptions(activity.id,activity.options!,correct,attempt);
    expect(rerender.toOriginal).toEqual(initial.toOriginal);
    expect(rerender.toOriginal.map(i=>view.options[i].canonicalIndex===correct)).toEqual(rerender.toOriginal.map(i=>i===correct));
    expect(JSON.stringify(row)).toBe(before);
   }
  }
 });
 it('guards snapshot against mutation during asynchronous digest',async()=>{
  const {bundle,approval}=await fixture();const mutable=structuredClone(row);
  const pending=display(mutable,bundle,approval);mutable.data.chapters=[];
  expect((await pending).reason).toBe('guarded_display_only');
 });
 it('rejects empty source, duplicate IDs and unsupported numeric serialization',async()=>{
  await expect(regenerateCampaignSource({...row,data:{...row.data,chapters:[]}})).rejects.toThrow();
  const duplicate=structuredClone(row);duplicate.data.chapters.push(duplicate.data.chapters[0]);
  await expect(regenerateCampaignSource(duplicate)).rejects.toThrow('duplicate');
  expect(()=>canonicalJson({value:1.25})).toThrow();
  expect(()=>canonicalJson(new Array(2))).toThrow('sparse');
  expect(()=>canonicalJson({'😀':'x'})).toThrow('astral');
  expect(()=>canonicalJson('\ud800')).toThrow('surrogate');
 });
});
