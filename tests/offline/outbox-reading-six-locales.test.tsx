import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TARGET_LOCALES, LOCALE_META, type AppLocale } from '@/lib/ui-language/locale-policy';
import { READING_REVIEW_MESSAGES } from '@/lib/ui-language/reading-review-messages';
import { UI_MESSAGES } from '@/lib/ui-language/messages';
import type { CampaignChapter } from '@/types/campaign';
const state = vi.hoisted(() => ({ locale: 'ar' as AppLocale }));
vi.mock('@/lib/ui-language/store', () => ({ useUiLanguage: () => ({
  language: state.locale, direction: LOCALE_META[state.locale].direction,
  messages: { ...UI_MESSAGES.ar, ...READING_REVIEW_MESSAGES[state.locale] },
}) }));
vi.mock('@/lib/identity/owner', () => ({ onOwnerChange: () => () => {} }));
vi.mock('@/lib/navigation/engine', () => ({ useOverlayDismiss: () => {} }));
import { ChapterReadingReview } from '@/components/imported-campaign/ChapterReadingReview';

afterEach(() => cleanup());
it('has the exact 14-key contract and nonempty translations for every target', () => {
 const keys=Object.keys(READING_REVIEW_MESSAGES.ar).sort();
 expect(keys).toHaveLength(14);
 for (const locale of TARGET_LOCALES) {
  expect(Object.keys(READING_REVIEW_MESSAGES[locale]).sort()).toEqual(keys);
  for (const text of Object.values(READING_REVIEW_MESSAGES[locale])) {
   expect(text.trim()).toBeTruthy();
   expect(text).not.toMatch(/TODO|FIXME|undefined|\{[^}]+\}/);
  }
 }
});
it('existing Arabic and English consumers receive the module dictionaries', () => {
 for (const locale of ['ar','en'] as const)
  for(const [key,value] of Object.entries(READING_REVIEW_MESSAGES[locale]))
   expect(UI_MESSAGES[locale][key as keyof typeof UI_MESSAGES.ar]).toBe(value);
});
for(const locale of TARGET_LOCALES) it('renders safe reread controls in '+locale, () => {
 state.locale=locale;
 const messages=READING_REVIEW_MESSAGES[locale];
 const chapter: CampaignChapter={
  id:'ch1',title:'عنوان الفصل',order:1,introText:'مقدمة عربية',
  activities:[
   {id:'past',type:'reading_then_question',prompt:'سؤال لا يظهر',contextText:'قراءة مكتملة',options:['إجابة سرية'],correctAnswer:0},
   {id:'future',type:'reading_then_question',prompt:'مستقبل',contextText:'قراءة مستقبلية'},
  ],
 };
 const completed=['past']; const before=JSON.stringify({chapter,completed});
 render(<ChapterReadingReview chapter={chapter} completedActivityIds={completed}/>);
 const trigger=screen.getByRole('button',{name:messages.reread});
 expect(trigger.getAttribute('lang')).toBe(locale);
 expect(trigger.getAttribute('dir')).toBe(LOCALE_META[locale].direction);
 fireEvent.click(trigger);
 const dialog=screen.getByRole('dialog');
 expect(dialog.getAttribute('lang')).toBe(locale);
 expect(dialog.getAttribute('dir')).toBe(LOCALE_META[locale].direction);
 expect(within(dialog).getByText(messages.rereadDescription)).toBeTruthy();
 const content=within(dialog).getByText('قراءة مكتملة').closest('[lang]');
 expect(content?.getAttribute('lang')).toBe('ar');
 expect(content?.getAttribute('dir')).toBe('rtl');
 for(const hidden of ['سؤال لا يظهر','إجابة سرية','قراءة مستقبلية']) expect(screen.queryByText(hidden)).toBeNull();
 fireEvent.click(within(dialog).getByRole('button',{name:messages.rereadReturn}));
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(JSON.stringify({chapter,completed})).toBe(before);
});
