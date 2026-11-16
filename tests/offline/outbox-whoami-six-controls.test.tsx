import React from 'react';
import type { WhoAmIStage } from '@/lib/games/types';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WHO_AM_I_MESSAGES as M, whoAmIText } from '@/lib/ui-language/who-am-i-control-messages';
import { TARGET_LOCALES, LOCALE_META } from '@/lib/ui-language/locale-policy';
import type { HelpOptionSpec } from '@/components/games/help/GameHelpContext';
const state=vi.hoisted(()=>({language:'ar',spec:null as HelpOptionSpec|null,helpId:'',purchase:vi.fn()}));
vi.mock('@/lib/ui-language/store',()=>({useUiLanguage:()=>({language:state.language,direction:['ar','ur'].includes(state.language)?'rtl':'ltr'})}));
vi.mock('@/lib/androidFreezeDiagnostics',()=>({isAndroidNativeApp:()=>true}));
vi.mock('@/components/AndroidSafeTextInput',()=>({AndroidSafeInput:()=>null}));
vi.mock('@/components/games/sfx',()=>({sfx:()=>{}}));
vi.mock('@/components/games/help/GameHelpContext',()=>({useRegisterHelpOption:(id:string,spec:HelpOptionSpec|null)=>{state.spec=spec;state.helpId=id;}}));
vi.mock('@/lib/games/who-am-i-help',()=>({getRevealedState:()=>({revealedWords:[],revealedLetters:{}}),purchaseWhoAmIHelp:(...args:unknown[])=>state.purchase(...args)}));
import { WhoAmIRenderer } from '@/components/games/WhoAmIRenderer';
Object.assign(globalThis,{React});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();state.spec=null;});
const stage: WhoAmIStage={answer:'شخصية تجريبية',acceptable:['اسم بديل'],hints:['تلميح تجريبي أول','تلميح تجريبي ثان','تلميح تجريبي ثالث']};
describe('Who am I UI controls keep answer identity and scores canonical',()=>{
 for(const locale of TARGET_LOCALES){
  it(`${locale}: complete dictionary and placeholder parity`,()=>{
   expect(Object.keys(M[locale]).sort()).toEqual(Object.keys(M.ar).sort());
   for(const k of Object.keys(M.ar) as (keyof typeof M.ar)[])expect(M[locale][k].match(/\{\w+\}/g)?.sort()??[]).toEqual(M.ar[k].match(/\{\w+\}/g)?.sort()??[]);
  });
  it(`${locale}: canonical alias remains accepted after language switch without losing input or hint score`,()=>{
   state.language=locale;const complete=vi.fn(),wrong=vi.fn();
   const view=render(<WhoAmIRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect(view.container.firstElementChild?.getAttribute('dir')).toBe(LOCALE_META[locale].direction);
   fireEvent.click(screen.getByRole('button',{name:new RegExp(M[locale].moreHint)}));
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'اسم بديل'}});
   state.language=locale==='ar'?'en':'ar';const next=state.language as 'ar'|'en';
   view.rerender(<WhoAmIRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('اسم بديل');
   expect(screen.getByRole('textbox').getAttribute('dir')).toBe('rtl');
   expect(screen.getByText(stage.hints[1])).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:M[next].check}));
   expect(complete).toHaveBeenCalledExactlyOnceWith(70);expect(wrong).not.toHaveBeenCalled();
   expect(screen.getByText(stage.answer).getAttribute('dir')).toBe('rtl');
  });
  it(`${locale}: wrong and empty guesses never complete or translate accepted values`,()=>{
   state.language=locale;const complete=vi.fn(),wrong=vi.fn();
   render(<WhoAmIRenderer stage={stage} onComplete={complete} onWrong={wrong}/>);
   fireEvent.click(screen.getByRole('button',{name:M[locale].check}));expect(wrong).not.toHaveBeenCalled();
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'not an answer'}});fireEvent.click(screen.getByRole('button',{name:M[locale].check}));
   expect(wrong).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();
  });
  it(`${locale}: paid help retains ID, canonical name and 20 dinar cost`,()=>{
   state.language=locale;state.purchase.mockReturnValue(false);const pay=vi.fn(()=>false);
   const view=render(<WhoAmIRenderer gameId="fixture-game" retryNonce={2} stage={stage} onComplete={()=>{}}/>);
   expect(state.helpId).toBe('whoami_reveal');expect(state.spec?.cost).toBe(20);expect(state.spec?.description).toContain('20');expect(state.spec?.label).toBe(M[locale].revealWord);
   state.language=locale==='ar'?'en':'ar';view.rerender(<WhoAmIRenderer gameId="fixture-game" retryNonce={2} stage={stage} onComplete={()=>{}}/>);
   expect(state.spec?.label).toBe(M[state.language as 'ar'|'en'].revealWord);
   let result:boolean|undefined;act(()=>{result=state.spec?.perform({pay});});expect(result).toBe(false);
   expect(state.purchase).toHaveBeenCalledWith('fixture-game',2,stage.answer,{pay});
  });
 }
 it('single-word help uses letters and third hint keeps score 50',()=>{
  state.language='en';const complete=vi.fn();render(<WhoAmIRenderer gameId="single" stage={{answer:'تجريب',hints:stage.hints}} onComplete={complete}/>);
  expect(state.spec?.label).toBe(M.en.revealLetters);expect(state.spec?.description).toBe(M.en.lettersDescription);
  fireEvent.click(screen.getByRole('button',{name:new RegExp(M.en.moreHint)}));fireEvent.click(screen.getByRole('button',{name:new RegExp(M.en.moreHint)}));
  expect(screen.getByText(whoAmIText('en','potential',{xp:50}))).toBeTruthy();fireEvent.change(screen.getByRole('textbox'),{target:{value:'تجريب'}});fireEvent.click(screen.getByRole('button',{name:M.en.check}));expect(complete).toHaveBeenCalledExactlyOnceWith(50);
 });
 it('successful help forwards the same canonical arguments and does not award completion',()=>{
  state.language='en';const pay=vi.fn(()=>true),complete=vi.fn();state.purchase.mockImplementation((_id,_nonce,_answer,helpers)=>helpers.pay());
  render(<WhoAmIRenderer gameId="paid-fixture" retryNonce={4} stage={stage} onComplete={complete}/>);
  let result:boolean|undefined;act(()=>{result=state.spec?.perform({pay});});
  expect(result).toBe(true);expect(pay).toHaveBeenCalledTimes(1);expect(complete).not.toHaveBeenCalled();
  expect(state.purchase).toHaveBeenCalledWith('paid-fixture',4,stage.answer,{pay});
  expect(state.spec?.cost).toBe(20);
 });

});
