import { expect, it } from 'vitest';
import { TARGET_LOCALES } from '@/lib/ui-language/locale-policy';
import { ACHIEVEMENT_CONTROL_MESSAGES } from '@/lib/ui-language/achievement-control-messages';
import { UI_MESSAGES } from '@/lib/ui-language/messages';
const tokens=(s:string)=>Array.from(s.matchAll(/\{([^}]+)\}/g),m=>m[1]).sort();
it('all six target dictionaries preserve the exact achievement-control contract',()=>{
 const keys=Object.keys(ACHIEVEMENT_CONTROL_MESSAGES.ar).sort();
 expect(keys).toHaveLength(14);
 for(const locale of TARGET_LOCALES){
  const messages=ACHIEVEMENT_CONTROL_MESSAGES[locale];
  expect(Object.keys(messages).sort()).toEqual(keys);
  for(const key of keys as (keyof typeof messages)[]){
   expect(messages[key].trim()).toBeTruthy();
   expect(tokens(messages[key])).toEqual(tokens(ACHIEVEMENT_CONTROL_MESSAGES.ar[key]));
   expect(messages[key]).not.toMatch(/TODO|FIXME|undefined/);
  }
 }
});
for(const locale of TARGET_LOCALES)it('achievement count substitutions preserve numeric values: '+locale,()=>{
 for(const [earned,total] of [[0,44],[1,44],[7,44],[44,44]]){
  const text=ACHIEVEMENT_CONTROL_MESSAGES[locale].achUnlockedCount.replace('{earned}',String(earned)).replace('{total}',String(total));
  expect(text).not.toMatch(/[{}]/);
  expect(text).toContain(String(earned));expect(text).toContain(String(total));
 }
});
it('current Arabic/English map uses module text without enabling other languages',()=>{
 expect(Object.keys(UI_MESSAGES).sort()).toEqual(['ar','en']);
 for(const locale of ['ar','en'] as const)
  for(const [key,value] of Object.entries(ACHIEVEMENT_CONTROL_MESSAGES[locale]))
   expect(UI_MESSAGES[locale][key as keyof typeof UI_MESSAGES.ar]).toBe(value);
});
it('French reward units agree with integer counts; other locales keep reviewed units',async()=>{
 const {achievementRewardUnit}=await import('@/lib/ui-language/achievement-control-messages');
 for(const [kind,singular,plural] of [['xp','point','points'],['dinars','dinar','dinars']] as const){
  for(const count of [0,1]) expect(achievementRewardUnit('fr',kind,count)).toBe(singular);
  for(const count of [2,10,100]) expect(achievementRewardUnit('fr',kind,count)).toBe(plural);
 }
 for(const locale of TARGET_LOCALES.filter(l=>l!=='fr')){
  for(const count of [0,1,2,100]){
   expect(achievementRewardUnit(locale,'xp',count)).toBe(ACHIEVEMENT_CONTROL_MESSAGES[locale].achPointsUnit);
   expect(achievementRewardUnit(locale,'dinars',count)).toBe(ACHIEVEMENT_CONTROL_MESSAGES[locale].achDinarsUnit);
  }
 }
});
