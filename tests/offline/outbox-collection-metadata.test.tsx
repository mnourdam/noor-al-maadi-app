import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { CollectionCard } from '@/components/stories/CollectionCard';
import { selectStoryMetadata } from '@/lib/stories/display-metadata';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { StoryCollection } from '@/lib/stories/collections';
import type { StorySummary } from '@/lib/stories/summary';

const cover = vi.hoisted(() => vi.fn((_source: unknown) => '/fixture-cover.png'));
vi.mock('@/lib/stories/covers', () => ({ useStoryCoverSrc: cover }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: any) =>
    <a href={to + '?collection=' + search.collection} {...props}>{children}</a>,
}));
const collection: StoryCollection = {
  id: 'stable-id', slug: 'canonical', title_ar: 'عنوان عربي', title_en: 'Authored title',
  summary_ar: 'ملخص عربي', summary_en: 'Authored summary', cover_media_id: 'cover-id', display_order: 1,
};
const story: StorySummary = {
  id: 'one', slug: 'one', story_collection_id: 'stable-id', collection_order: 1,
  title_ar: 'قصة', title_en: null, summary_ar: null, summary_en: null,
  world_slug: null, era: null, display_order: 0, xp_reward: 100, dinar_reward: 20,
  cover_media_id: 'story-cover', content_version: 1, published_at: null, scene_count: 3,
  category: null, rarity: null, length_class: null, historical_confidence: null,
  tags: [], prereqs: [], lock_explanation: null, unlocked: true, completed: true,
  progress: { last_scene_index: 2, max_scene_index_reached: 2 },
};
const stories: StorySummary[] = [
  story,
  { ...story, id: 'two', completed: false, cover_media_id: null },
  { ...story, id: 'three', completed: false, unlocked: false, progress: null, cover_media_id: null },
];
beforeEach(() => { localStorage.clear(); setUiLanguage('ar'); cover.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('selects each field independently, preserves authored bytes and never invents missing text', () => {
  expect(selectStoryMetadata('عربي', ' English ', 'en')).toEqual({ text: ' English ', lang: 'en', dir: 'ltr' });
  for (const en of [null, undefined, '', ' \n ']) {
    expect(selectStoryMetadata('عربي', en, 'en')).toEqual({ text: 'عربي', lang: 'ar', dir: 'rtl' });
    expect(selectStoryMetadata(null, en, 'en')).toBeNull();
  }
  expect(selectStoryMetadata('عربي', 'English', 'ar')?.text).toBe('عربي');
  expect(selectStoryMetadata('عربي', 'English', 'invalid')?.text).toBe('عربي');
  expect(selectStoryMetadata(null, 'English', 'ar')).toBeNull();
});
it('reactively displays authored metadata with same link, focus, routes, progress and cover inputs', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { container } = render(<CollectionCard collection={collection} stories={stories} />);
  const link = screen.getByRole('link'); link.focus();
  expect(screen.getByRole('heading').textContent).toBe(collection.title_ar);
  const initialCover = cover.mock.calls.map(call => call[0]);
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('link')).toBe(link); expect(document.activeElement).toBe(link);
  expect(link.getAttribute('href')).toBe('/stories?collection=stable-id');
  const heading = screen.getByRole('heading');
  expect(heading.textContent).toBe(collection.title_en);
  expect(heading.getAttribute('lang')).toBe('en'); expect(heading.getAttribute('dir')).toBe('ltr');
  expect(screen.getByText('Authored summary').getAttribute('lang')).toBe('en');
  expect(screen.getByRole('img').getAttribute('alt')).toBe(collection.title_en);
  expect(screen.getByRole('img').getAttribute('lang')).toBe('en');
  expect(screen.getByText('3 قصص')).toBeTruthy(); expect(screen.getByText('33%')).toBeTruthy();
  expect(screen.getByText('قيد القراءة')).toBeTruthy();
  expect(container.querySelector('[style]')?.getAttribute('style')).toBe('width: 33%;');
  expect(cover.mock.calls.every(call => JSON.stringify(call[0]) === JSON.stringify(initialCover[0]))).toBe(true);
  act(() => setUiLanguage('ar'));
  expect(screen.getByRole('heading').textContent).toBe(collection.title_ar);
  expect(screen.getByRole('img').getAttribute('alt')).toBe(collection.title_ar);
  expect(screen.getByRole('link')).toBe(link); expect(document.activeElement).toBe(link);
  expect(fetchSpy).not.toHaveBeenCalled();
});
it('uses Arabic per-field fallback and omits absent summaries without exposing English in Arabic mode', () => {
  setUiLanguage('en');
  const { rerender } = render(<CollectionCard collection={{ ...collection, title_en: ' ', summary_en: null }} stories={[]} />);
  expect(screen.getByRole('heading').getAttribute('dir')).toBe('rtl');
  expect(screen.getByRole('img').getAttribute('alt')).toBe(collection.title_ar);
  expect(screen.getByText(collection.summary_ar!).getAttribute('lang')).toBe('ar');
  expect(screen.getByText('0%')).toBeTruthy(); expect(screen.getByText('جديدة')).toBeTruthy();
  rerender(<CollectionCard collection={{ ...collection, summary_ar: null, summary_en: ' ' }} stories={stories.slice(0, 1)} />);
  expect(document.querySelector('p')).toBeNull();
  expect(screen.getByText('100%')).toBeTruthy(); expect(screen.getByText('مكتملة')).toBeTruthy();
});
it('retains first story cover fallback and SSR Arabic snapshot despite English device preference', () => {
  setUiLanguage('en');
  const html = renderToString(<CollectionCard collection={{ ...collection, cover_media_id: null }} stories={stories} />);
  expect(html).toContain(collection.title_ar); expect(html).not.toContain('Authored title');
  expect(cover.mock.calls.at(-1)?.[0]).toEqual({ cover_media_id: 'story-cover', id: 'one', content_version: 1 });
});
