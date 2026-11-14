import React from 'react';
import {cleanup,render,fireEvent,within,waitFor,act} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {webcrypto,createHash} from 'node:crypto';
import {UI_MESSAGES} from '@/lib/ui-language/messages';
import {setUiLanguage,getUiLanguage} from '@/lib/ui-language/store';
const state=vi.hoisted(()=>({entity:null as any,queries:[] as unknown[],read:vi.fn(),back:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({
 createFileRoute:()=> (options:any)=>({...options,useParams:()=>({id:state.entity.id})}),
 useRouterState:()=>`/encyclopedia/entity/${state.entity.id}`,
 Link:({to,params,children,...props}:any)=><a href={Object.entries(params??{}).reduce((url,[key,value])=>url.replace(`$${key}`,String(value)),to)} className={props.className}>{children}</a>,
 Navigate:()=>{throw Error('unexpected redirect')},
}));
vi.mock('@tanstack/react-query',()=>({useQuery:(options:any)=>{state.queries.push(options.queryKey);return {data:options.queryKey[1]==='entity'?state.entity:options.queryKey[1]==='graph'?[]:null,isLoading:false}}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/components/HUD',()=>({HUD:()=>null}));
vi.mock('@/components/FriendNotificationsPoller',()=>({FriendNotificationsPoller:()=>null}));
vi.mock('@/lib/androidFreezeDiagnostics',()=>({androidMark:()=>{},isAndroidUltraStableMode:()=>false}));
vi.mock('@/lib/androidQuietMode',()=>({isSectionEnabled:()=>false}));
vi.mock('@/lib/account',()=>({useAccount:()=>({user:null})}));
vi.mock('@/lib/profile',()=>({useProfile:()=>({profile:{settings:{textSize:'sm'}}})}));
vi.mock('@/lib/navigation/engine',()=>({useBack:()=>state.back,useStashCurrentAsOrigin:()=>state.back}));
vi.mock('@/hooks/useEntityReadCompletion',()=>({useEntityReadCompletion:(value:unknown)=>state.read(value)}));
vi.mock('@/lib/relationship-graph',()=>({resolveRelatedEntities:async()=>[],groupRelatedByReason:()=>[]}));
vi.mock('@/lib/local-first-store',()=>({localAtlasEntities:()=>[]}));
vi.mock('@/components/stories/RelatedStoriesRail',()=>({RelatedStoriesRail:()=>null}));
vi.mock('@/components/feedback/FeedbackCTA',()=>({FeedbackCTA:()=>null}));
vi.mock('@/components/social/Istazadtu',()=>({Istazadtu:({anchorId}:any)=><span data-anchor={anchorId}/> }));
vi.mock('@/components/social/StoryComments',()=>({StoryComments:()=>null}));
vi.mock('@/components/social/PublicContributionsNotice',()=>({PublicContributionsNotice:()=>null}));
import {Route} from '@/routes/encyclopedia.entity.$id';
const Entity=(Route as any).component;
afterEach(()=>{cleanup();setUiLanguage('ar');vi.unstubAllGlobals();state.queries=[];state.read.mockClear();state.back.mockClear()});
it('actual route displays six packaged original references verbatim across UI locale changes',async()=>{
 const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');
 const raw=gunzipSync(readFileSync('public/offline-snapshot.json.gz'));
 expect(createHash('sha256').update(raw).digest('hex')).toBe('4733e21c6789140c31e9ef558e5d2a7479ab16fa48e7e6ec97cd29e49be35c72');
 state.entity=JSON.parse(raw.toString()).collections.encyclopedia_entities.find((r:any)=>r.id==='e0e36947-141e-4fb2-92b3-b0e46513b3a4');
 const before=JSON.stringify(state.entity);const view=render(<Entity/>);
 for(const locale of ['ar','en','ar']){
  fireEvent.change(view.getByRole('combobox'),{target:{value:locale}});view.rerender(<Entity/>);
  const refs=view.getByRole('complementary',{name:'المراجع الأصلية'});
  expect(refs.lang).toBe('ar');expect(refs.dir).toBe('rtl');expect(refs.querySelectorAll('[data-source-disclosure]')).toHaveLength(1);
  expect(Array.from(refs.querySelectorAll('p:not([data-source-disclosure])')).map(p=>p.textContent)).toEqual(state.entity.body.references.map((r:any)=>`${r.label} — ${r.value}`));
  expect(refs.querySelectorAll('p:not([data-source-disclosure])')).toHaveLength(6);expect(refs.querySelectorAll('a')).toHaveLength(0);
  expect(view.container.querySelector('[data-anchor]')?.getAttribute('data-anchor')).toBe(state.entity.id);
  expect(JSON.stringify(state.entity)).toBe(before);
 }
});
it('actual route keeps sources first, verbatim safe URLs, narrow duplicates and malformed siblings',()=>{
 state.entity={id:'reference-fixture',title:'عنوان المرجع',summary:'ملخص',entity_type:'artifact',image_url:null,metadata:{sources:[{title:'metadata not used'}]},body:{overview:'نص',sources:[{title:'same',note:'exact'},{title:'only'},{title:'with author',author:'كاتب'}],references:[
  {label:'same',value:'exact'},'only','with author',{label:'same',value:'different'},
  '  literal reference  ','  literal reference  ',{label:'same',value:'different'},
  {label:'safe',value:'existing',url:'https://example.invalid/ref?a=1&b=2'},
  {label:'unsafe',value:'javascript:do-not-infer',url:'javascript:alert(1)'},
  {label:'space',value:'keep url text',url:' https://example.invalid/space'},
  null,42,{label:'missing'},{label:'unknown',value:'x',extra:'not understood'},['bad'],{label:'',value:'x'}
 ]}};
 const before=JSON.stringify(state.entity);const view=render(<Entity/>);const refs=view.getByRole('complementary',{name:'المراجع الأصلية'});
 expect(Array.from(refs.querySelectorAll('p:not([data-source-disclosure])')).map(p=>p.textContent)).toEqual(['with author','same — different','  literal reference  ','safe — existing https://example.invalid/ref?a=1&b=2','unsafe — javascript:do-not-infer javascript:alert(1)','space — keep url text  https://example.invalid/space']);
 const sources=view.getByRole('heading',{name:'المراجع'}).closest('section')!;
 expect(sources.compareDocumentPosition(refs)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(view.queryByText('metadata not used')).toBeNull();expect(refs.querySelectorAll('a')).toHaveLength(1);
 expect(refs.querySelector('a')?.getAttribute('href')).toBe('https://example.invalid/ref?a=1&b=2');
 expect(JSON.stringify(state.entity)).toBe(before);
});
it('reference parser leaves old empty/metadata precedence and URL presence semantics intact',async()=>{
 const {parseEncyclopediaArticle:parse}=await import('@/types/encyclopediaArticle');
 expect(parse({overview:'old'})).toEqual({overview:'old'});
 expect(parse({references:[null,{},'  ']})).toEqual({});
 expect(parse({sources:[],references:['meta']},{sources:[{title:'meta'}]})).toEqual({sources:[],originalReferences:['meta']});
 expect(parse({references:['meta']},{sources:[{title:'meta'}]})).toEqual({sources:[{title:'meta'}]});
 const sources=[{title:'label',note:'value',url:''}];
 expect(parse({sources,references:[{label:'label',value:'value'},{label:'label',value:'value',url:''}]}).originalReferences).toEqual([{label:'label',value:'value'}]);
 expect(parse({sources:[{title:'x',author:'author'}],references:['x']} ).originalReferences).toEqual(['x']);
});

it('Duraid actual six sources retain names/order under neutral disclosure with inert status metadata',async()=>{
 const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');const {SOURCE_DISCLOSURE}=await import('@/components/encyclopedia/SourceDisclosure');
 const raw=gunzipSync(readFileSync('public/offline-snapshot.json.gz'));
 expect(createHash('sha256').update(raw).digest('hex')).toBe('4733e21c6789140c31e9ef558e5d2a7479ab16fa48e7e6ec97cd29e49be35c72');
 const original=JSON.parse(raw.toString()).collections.encyclopedia_entities.find((r:any)=>r.id==='9991b145-622f-480b-aa59-93c50c01d0fe');
 expect(original.body.sources).toHaveLength(6);expect(original.body.references).toBeUndefined();
 state.entity=structuredClone(original);const view=render(<Entity/>);
 const capture=()=>{const section=view.getByRole('heading',{name:'المراجع'}).closest('section')!;expect(within(section).getByText(SOURCE_DISCLOSURE)).toBeTruthy();expect(section.querySelectorAll('[data-source-disclosure]')).toHaveLength(1);return Array.from(section.querySelectorAll('li')).map(li=>li.textContent);};
 const expected=original.body.sources.map((s:any)=>`${s.title} — ${s.author}`);expect(capture()).toEqual(expected);
 expect(view.queryByRole('complementary',{name:'المراجع الأصلية'})).toBeNull();
 for(const locale of ['en','ar']){fireEvent.change(view.getByRole('combobox'),{target:{value:locale}});view.rerender(<Entity/>);expect(capture()).toEqual(expected);expect(JSON.stringify(state.entity)).toBe(JSON.stringify(original));}
 // Synthetic unsupported metadata does not establish or suppress verification.
 state.entity={...original,metadata:{...original.metadata,verified:true,source_verification:'verified'}};const before=JSON.stringify(state.entity);view.rerender(<Entity/>);expect(capture()).toEqual(expected);expect(JSON.stringify(state.entity)).toBe(before);
 expect(view.container.querySelector('[data-anchor]')?.getAttribute('data-anchor')).toBe(original.id);
});
it('shared disclosure leaves source notes and links byte-identical and appears in both distinct sections',async()=>{
 const {SOURCE_DISCLOSURE}=await import('@/components/encyclopedia/SourceDisclosure');
 state.entity={id:'both-source-sections',title:'عنوان',summary:'ملخص',entity_type:'artifact',body:{sources:[{title:'  title  ',author:' author ',note:' exact note ',url:'https://example.invalid/source?a=1&b=2'}],references:[{label:'label',value:'original',url:'https://example.invalid/ref?q=1'}]}};
 const before=JSON.stringify(state.entity);const view=render(<Entity/>);expect(view.getAllByText(SOURCE_DISCLOSURE)).toHaveLength(2);
 const source=view.getByRole('heading',{name:'المراجع'}).closest('section')!;expect(source.querySelector('li')?.textContent).toBe('  title   —  author  exact note  رابط');
 expect(source.querySelector('a')?.getAttribute('href')).toBe(state.entity.body.sources[0].url);
 const refs=view.getByRole('complementary',{name:'المراجع الأصلية'});expect(refs.querySelector('a')?.getAttribute('href')).toBe(state.entity.body.references[0].url);expect(JSON.stringify(state.entity)).toBe(before);
});
