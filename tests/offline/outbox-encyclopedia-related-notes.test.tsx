import React from 'react';
import {cleanup, render} from '@testing-library/react';
import {afterEach, expect, it} from 'vitest';
import {EncyclopediaRelatedEntities} from '@/components/encyclopedia/EncyclopediaRelatedEntities';
import {parseEncyclopediaArticle} from '@/types/encyclopediaArticle';
afterEach(cleanup);
const label='اسم مرجعي طويل '.repeat(18);
const note='شهدت هذه العلاقة أحداثاً موصوفة في النص الأصلي.\n'+'تفاصيل مرجعية طويلة '.repeat(40);
it('renders the complete authored note as reading text, not a hover-only title',()=>{
 const v=render(<EncyclopediaRelatedEntities related={{figures:[{slug:'synthetic',label,note}]}}/>);
 expect(v.getByText(note,{exact:true,normalizer:x=>x})).toBeTruthy();
 expect(v.container.querySelector('[title]')).toBeNull();
});
it('does not impose ellipsis or fixed-width clipping on long authored labels',()=>{
 const v=render(<EncyclopediaRelatedEntities related={{figures:[{slug:'synthetic',label}]}}/>);
 expect(v.getByText(label,{exact:true,normalizer:x=>x})).toBeTruthy();
 expect(v.container.querySelector('[class*="truncate"],[class*="line-clamp"],[class*="max-w-[200px]"]')).toBeNull();
});
it('retains canonical groups and slug fallback without inventing a note or navigation',()=>{
 const v=render(<EncyclopediaRelatedEntities related={{cities:[{slug:'city-id'}],scholars:[{slug:'scholar-id',label:'عالم'}]}}/>);
 expect(v.getByText('مدن مرتبطة')).toBeTruthy();expect(v.getByText('علماء مرتبطون')).toBeTruthy();expect(v.getByText('city-id')).toBeTruthy();
 expect(v.container.querySelector('a,button,input')).toBeNull();expect(v.container.textContent).not.toContain('undefined');
});
it('renders no empty section for absent or empty relation groups',()=>{
 const v=render(<EncyclopediaRelatedEntities/>);expect(v.container.innerHTML).toBe('');
 v.rerender(<EncyclopediaRelatedEntities related={{figures:[]}}/>);expect(v.container.innerHTML).toBe('');
});
it('preserves authored literal markup as text and ignores malformed or blank notes',()=>{
 const text='<img src=x onerror=alert(1)>';
 const v=render(<EncyclopediaRelatedEntities related={{figures:[{slug:'a',note:text},{slug:'b',note:{unexpected:true} as any},{slug:'c',note:'  '}]}}/>);
 expect(v.getByText(text)).toBeTruthy();expect(v.container.querySelector('img,script')).toBeNull();
});
it('real article parser retains a full relationship note through the displayed group',()=>{
 const article=parseEncyclopediaArticle({related:{figures:[{slug:'a',note}]}});
 const v=render(<EncyclopediaRelatedEntities related={article.related}/>);
 expect(v.getByText(note,{exact:true,normalizer:x=>x})).toBeTruthy();
});
