import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_RENDERER_MESSAGES as M, gameRendererText } from '@/lib/ui-language/game-renderer-messages';
import { TARGET_LOCALES, LOCALE_META } from '@/lib/ui-language/locale-policy';
const state=vi.hoisted(()=>({language:'ar',stable:true}));
vi.mock('@/lib/ui-language/store',()=>({useUiLanguage:()=>({language:state.language,direction:['ar','ur'].includes(state.language)?'rtl':'ltr'})}));
vi.mock('@/lib/androidFreezeDiagnostics',()=>({isAndroidUltraStableMode:()=>state.stable,recordAndroidAction:()=>{}}));
vi.mock('@/lib/androidFocusAB',()=>({isAndroidFocusABDisabled:()=>false}));
vi.mock('@/components/games/sfx',()=>({sfx:()=>{}}));
import { MemoryRenderer } from '@/components/games/MemoryRenderer';
import { ConnectionsRenderer } from '@/components/games/ConnectionsRenderer';
import { ChronologyRenderer } from '@/components/games/ChronologyRenderer';
Object.assign(globalThis,{React});
afterEach(()=>{cleanup();state.stable=true;vi.useRealTimers();vi.restoreAllMocks();});
describe('localized renderer controls preserve canonical game identity',()=>{
 for(const locale of TARGET_LOCALES){
  it(`${locale}: dictionary keys and placeholders`,()=>{
   expect(Object.keys(M[locale]).sort()).toEqual(Object.keys(M.ar).sort());
   for(const k of Object.keys(M.ar) as (keyof typeof M.ar)[]) expect(M[locale][k].match(/\{\w+\}/g)?.sort()??[]).toEqual(M.ar[k].match(/\{\w+\}/g)?.sort()??[]);
  });
  it(`${locale}: memory pair scores unchanged across UI language change`,()=>{
   vi.useFakeTimers();state.language=locale;vi.spyOn(Math,'random').mockReturnValue(.999);
   const stage={pairs:[{a:'canonical-left',b:'canonical-right'}]};const complete=vi.fn(),wrong=vi.fn();
   const view=render(<MemoryRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect(view.container.firstElementChild?.getAttribute('dir')).toBe(LOCALE_META[locale].direction);
   fireEvent.click(screen.getByRole('button',{name:gameRendererText(locale,'drawer',{number:1})}));
   state.language=locale==='ar'?'en':'ar';
   view.rerender(<MemoryRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect(screen.getByRole('button',{name:'canonical-left'})).toBeTruthy();
   const next=state.language as 'ar'|'en';
   fireEvent.click(screen.getByRole('button',{name:gameRendererText(next,'drawer',{number:2})}));
   act(()=>vi.advanceTimersByTime(650));
   expect(complete).toHaveBeenCalledExactlyOnceWith(100);expect(wrong).not.toHaveBeenCalled();
   expect(stage.pairs[0]).toEqual({a:'canonical-left',b:'canonical-right'});
  });
  it(`${locale}: connections match pair indexes, not display words`,()=>{
   state.language=locale;const complete=vi.fn(),wrong=vi.fn();
   const stage={pairs:[{relation:'fixture',left:'left A',right:'right A'},{relation:'fixture',left:'left B',right:'right B'}]};
   const view=render(<ConnectionsRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect(view.container.firstElementChild?.getAttribute('dir')).toBe(LOCALE_META[locale].direction);
   fireEvent.click(screen.getByRole('button',{name:'right A'}));fireEvent.click(screen.getByRole('button',{name:'left A'}));
   state.language=locale==='ar'?'en':'ar';view.rerender(<ConnectionsRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect((screen.getByRole('button',{name:'left A'}) as HTMLButtonElement).disabled).toBe(true);
   fireEvent.click(screen.getByRole('button',{name:'left B'}));fireEvent.click(screen.getByRole('button',{name:'right B'}));
   expect(complete).toHaveBeenCalledExactlyOnceWith(100);expect(wrong).not.toHaveBeenCalled();
  });
  it(`${locale}: chronology sorts canonical years without changing labels`,()=>{
   state.language=locale;vi.spyOn(Math,'random').mockReturnValue(.999);const complete=vi.fn();
   const stage={events:[{label:'event A',year:100},{label:'event B',year:200}]};
   render(<ChronologyRenderer stage={stage} onComplete={complete}/>);
   expect(screen.getAllByRole('button',{name:M[locale].dragLabel})).toHaveLength(2);
   fireEvent.click(screen.getByRole('button',{name:M[locale].check}));
   expect(complete).toHaveBeenCalledExactlyOnceWith(100);
   expect(screen.getByText('100م')).toBeTruthy(); expect(screen.getByText('event A')).toBeTruthy();
  });
 }
 it('chronology retry path does not duplicate wrong attempts',()=>{
  state.language='en';vi.spyOn(Math,'random').mockReturnValue(0);const wrong=vi.fn(),complete=vi.fn();
  render(<ChronologyRenderer stage={{events:[{label:'A',year:1},{label:'B',year:2}]}} onComplete={complete} onWrong={wrong}/>);
  fireEvent.click(screen.getByRole('button',{name:M.en.check}));
  expect(wrong).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:M.en.check})).toBeNull();expect(screen.getByRole('button',{name:M.en.retry})).toBeTruthy();
 });
 it.each(['locked','wrong'])('%s connection threads use inner edges in both directions after language changes',(kind)=>{
  state.language='ar';state.stable=false;
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
   const rtl=state.language==='ar';
   const left=this.tagName==='BUTTON' ? (this.textContent?.startsWith('left') ? (rtl?200:0) : (rtl?0:200)) : 0;
   const width=this.tagName==='BUTTON'?100:300;
   return {left,right:left+width,top:0,bottom:40,width,height:40,x:left,y:0,toJSON:()=>({})};
  });
  const stage={pairs:kind==='locked'?[{relation:'fixture',left:'left',right:'right'}]:[{relation:'fixture',left:'left',right:'right'},{relation:'fixture',left:'left second',right:'right second'}]};const complete=vi.fn();
  const view=render(<ConnectionsRenderer stage={stage} onComplete={complete}/>);
  fireEvent.click(screen.getByRole('button',{name:'left'}));fireEvent.click(screen.getByRole('button',{name:kind==='locked'?'right':'right second'}));
  const path=()=>view.container.querySelector('svg.pointer-events-none path')?.getAttribute('d');
  expect(path()).toBe('M 200 20 C 150 20, 150 20, 100 20');
  state.language='en';view.rerender(<ConnectionsRenderer stage={stage} onComplete={complete}/>);
  expect(path()).toBe('M 100 20 C 150 20, 150 20, 200 20');
  if(kind==='locked') expect(complete).toHaveBeenCalledExactlyOnceWith(100);
  else expect(complete).not.toHaveBeenCalled();
 });

});
