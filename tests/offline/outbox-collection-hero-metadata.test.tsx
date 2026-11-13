import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { StoryCollection } from '@/lib/stories/collections';
import type { StorySummary } from '@/lib/stories/summary';
const env = vi.hoisted(() => ({
  stories: [] as StorySummary[], collections: [] as StoryCollection[], loading: false, activeCollection: 'stable-id' as string | undefined,
  query: vi.fn(), sync: vi.fn(), fetch: vi.fn(), cover: vi.fn(() => '/fixture-cover.webp'),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: any) => options,
  useSearch: () => ({ collection: env.activeCollection }),
  Link: ({ to, params, children, ...props }: any) => <a href={params ? to.replace('$id', params.id) : to} {...props}>{children}</a>,
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => {
  env.query(options); return { data: env.stories, isLoading: env.loading };
} }));
vi.mock('@/lib/stories/summary', () => ({ listStoriesSummary: env.fetch }));
vi.mock('@/lib/stories/collections', () => ({ useStoryCollections: () => ({ collections: env.collections, loading: false }) }));
vi.mock('@/lib/stories/query-keys', () => ({ useStoryIdentityKey: () => 'fixture-owner', storySummaryQueryKey: (...parts: unknown[]) => parts }));
vi.mock('@/lib/stories/covers', () => ({ syncStoryCovers: env.sync, useStoryCoverSrc: env.cover }));
vi.mock('@/components/AppShell', () => ({ AppShell: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/CinematicPageBackdrop', () => ({ CinematicPageBackdrop: () => null }));
vi.mock('@/components/stories/StoryCard', () => ({ StoryCard: ({ story }: { story: StorySummary }) => <div data-testid="story" data-id={story.id}>{story.title_ar}</div> }));
vi.mock('@/components/stories/CollectionCard', () => ({ CollectionCard: () => null }));
import { Route } from '@/routes/stories.index';
const View = (Route as unknown as { component: React.ComponentType }).component;
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

beforeEach(() => {
  localStorage.clear(); setUiLanguage('ar'); env.activeCollection = 'stable-id'; env.collections = [collection];
  env.stories = stories.map((s, i) => ({ ...s, collection_order: 3 - i, title_ar: 'قصة ' + s.id }));
  env.loading = false; env.cover.mockClear(); env.query.mockClear(); env.sync.mockClear(); env.fetch.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('switches only hero metadata while keeping route search/filter focus, order, links, counts and sync stable', () => {
  const { container } = render(<View />);
  const heading = screen.getByRole('heading', { level: 1 }); const image = screen.getByRole('img');
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(screen.getAllByTestId('story').map(n => n.dataset.id)).toEqual(['three', 'two', 'one']);
  fireEvent.change(input, { target: { value: 'two' } }); input.focus();
  const queryCount = env.query.mock.calls.length; const syncCount = env.sync.mock.calls.length;
  const links = screen.getAllByRole('link'); const targets = links.map(n => n.getAttribute('href'));
  expect(targets).toEqual(['/stories', '/story/two']);
  expect(screen.getByText('33%')).toBeTruthy(); expect(screen.getByText('1 / 3 مكتملة')).toBeTruthy();
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('heading', { level: 1 })).toBe(heading); expect(heading.textContent).toBe('Authored title');
  expect(heading.lang).toBe('en'); expect(heading.dir).toBe('ltr');
  expect(screen.getByRole('img')).toBe(image); expect(image.getAttribute('alt')).toBe('Authored title');
  expect(image.getAttribute('lang')).toBe('en');
  expect(screen.getByText('Authored summary').getAttribute('dir')).toBe('ltr');
  expect(screen.getByRole('textbox')).toBe(input); expect(document.activeElement).toBe(input); expect(input.value).toBe('two');
  expect(screen.getAllByTestId('story').map(n => n.dataset.id)).toEqual(['two']);
  expect(screen.getAllByRole('link')).toEqual(links); expect(screen.getAllByRole('link').map(n => n.getAttribute('href'))).toEqual(targets);
  expect(screen.getByText('Continue reading')).toBeTruthy(); expect(screen.getByText('1 / 3 completed')).toBeTruthy();
  expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toBe('width: 33%;');
  expect(env.query.mock.calls.length).toBe(queryCount); expect(env.sync.mock.calls.length).toBe(syncCount); expect(env.fetch).not.toHaveBeenCalled();
  act(() => setUiLanguage('ar'));
  expect(heading.textContent).toBe(collection.title_ar); expect(image.getAttribute('alt')).toBe(collection.title_ar);
  expect(document.activeElement).toBe(input);
});
it('uses fieldwise Arabic fallback, omits absent summary and keeps SSR Arabic', () => {
  setUiLanguage('en'); env.collections = [{ ...collection, title_en: ' ', summary_en: null }];
  const { rerender } = render(<View />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(collection.title_ar);
  expect(screen.getByRole('heading', { level: 1 }).getAttribute('lang')).toBe('ar');
  expect(screen.getByText(collection.summary_ar!).getAttribute('dir')).toBe('rtl');
  env.collections = [{ ...collection, summary_ar: null, summary_en: '' }]; rerender(<View />);
  expect(screen.queryByText('Authored summary')).toBeNull(); expect(screen.queryByText(collection.summary_ar!)).toBeNull();
  env.collections = [collection];
  const html = renderToString(<View />); expect(html).toContain(collection.title_ar); expect(html).not.toContain('Authored title');
});

for (const loading of [true, false]) it(`renders selected collection safely with empty stories, loading=${loading}`, () => {
  env.stories = []; env.loading = loading;
  render(<View />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(collection.title_ar);
  expect(screen.getByText('0%')).toBeTruthy(); expect(screen.getByText('0 / 0 مكتملة')).toBeTruthy();
  expect(screen.getAllByRole('link').map(n => n.getAttribute('href'))).toEqual(['/stories']);
  if (loading) expect(screen.getByText('جارٍ تحميل المكتبة…')).toBeTruthy();
  else expect(screen.getByText('لا توجد قصص تطابق هذا البحث داخل السلسلة.')).toBeTruthy();
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Authored title');
  expect(screen.getAllByRole('link')).toHaveLength(1);
});
it('restores normal continue and completed reread targets when stories arrive', () => {
  env.stories = []; env.loading = true;
  const { rerender } = render(<View />);
  env.stories = stories; env.loading = false; rerender(<View />);
  expect(screen.getByRole('link', { name: 'متابعة القراءة' }).getAttribute('href')).toBe('/story/two');
  env.stories = stories.map(s => ({ ...s, completed: true })); rerender(<View />);
  expect(screen.getByRole('link', { name: 'إعادة القراءة' }).getAttribute('href')).toBe('/story/one');
  expect(screen.getByText('100%')).toBeTruthy();
});

it('forwards fallback story version and exact packaged media identity, without changing owned collection cover inputs', () => {
  const id = 'story-fall-of-baghdad-1258';
  const media = 'c466e4f5-5812-41cd-9a5c-eaae1ac2b885';
  env.collections = [{ ...collection, cover_media_id: null }];
  env.stories = [{ ...story, id, cover_media_id: media, content_version: 2 }];
  const { rerender } = render(<View />);
  expect(env.cover).toHaveBeenLastCalledWith({ id, cover_media_id: media, content_version: 2 });
  env.stories = [{ ...env.stories[0], content_version: 3 }];
  rerender(<View />);
  expect(env.cover).toHaveBeenLastCalledWith({ id, cover_media_id: media, content_version: 3 });
  env.collections = [{ ...collection, cover_media_id: 'owned-collection-cover' }];
  rerender(<View />);
  expect(env.cover).toHaveBeenLastCalledWith({ id: 'collection-stable-id', cover_media_id: 'owned-collection-cover' });
});

it('translates only selected-collection chrome with raw counts and stable CTA/icon through all existing states', () => {
  const { rerender } = render(<View />);
  const cta = screen.getByRole('link', { name: 'متابعة القراءة' });
  const icon = cta.querySelector('svg');
  cta.focus();
  const beforeQueries = env.query.mock.calls.length;
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('link', { name: 'Continue reading' })).toBe(cta);
  expect(document.activeElement).toBe(cta); expect(cta.querySelector('svg')).toBe(icon);
  expect(cta.getAttribute('href')).toBe('/story/two'); expect(cta.lang).toBe('en'); expect(cta.dir).toBe('ltr');
  expect(screen.getByText('Story count')).toBeTruthy(); expect(screen.getByText('Completion')).toBeTruthy();
  expect(screen.getByText('Collection progress')).toBeTruthy(); expect(screen.getByText('1 / 3 completed')).toBeTruthy();
  expect(screen.getByText('33%')).toBeTruthy(); expect(env.query.mock.calls.length).toBe(beforeQueries);
  env.stories = stories.map(s => ({ ...s, completed: false, progress: null }));
  rerender(<View />);
  expect(screen.getByRole('link', { name: 'Start collection' })).toBe(cta);
  expect(cta.getAttribute('href')).toBe('/story/one'); expect(screen.getByText('0 / 3 completed')).toBeTruthy();
  env.stories = stories.map(s => ({ ...s, completed: true }));
  rerender(<View />);
  expect(screen.getByRole('link', { name: 'Read again' })).toBe(cta);
  expect(cta.getAttribute('href')).toBe('/story/one'); expect(screen.getByText('3 / 3 completed')).toBeTruthy();
  expect(screen.getByText('100%')).toBeTruthy();
  const rereadIcon = cta.querySelector('svg'); expect(rereadIcon?.classList.contains('lucide-history')).toBe(true);
  act(() => setUiLanguage('ar'));
  expect(screen.getByRole('link', { name: 'إعادة القراءة' })).toBe(cta);
  expect(cta.querySelector('svg')).toBe(rereadIcon); expect(cta.lang).toBe('ar'); expect(cta.dir).toBe('rtl');
  expect(screen.getByText('3 / 3 مكتملة')).toBeTruthy();
});

it('uses actual input/select with stable focus/value, canonical filter/sort values and no parent query/sync rerun', () => {
  env.stories = env.stories.map(s => ({ ...s, world_slug: 'prophetic', era: 'abbasid' }));
  render(<View />);
  fireEvent.click(screen.getByRole('button', { name: 'تصفية متقدمة' }));
  const input = screen.getByRole('textbox') as HTMLInputElement;
  const sort = screen.getByRole('combobox') as HTMLSelectElement;
  const values = [...sort.options].map(o => o.value);
  expect(values).toEqual(['recommended', 'newest', 'shortest', 'reward']);
  fireEvent.change(sort, { target: { value: 'reward' } });
  fireEvent.change(input, { target: { value: 'two' } });
  input.focus();
  const queryCount = env.query.mock.calls.length; const syncCount = env.sync.mock.calls.length;
  act(() => setUiLanguage('en'));
  expect(screen.getByPlaceholderText('Search this collection…')).toBe(input);
  expect(input.value).toBe('two'); expect(document.activeElement).toBe(input); expect(input.dir).toBe('auto');
  expect(screen.getByRole('combobox')).toBe(sort); expect(sort.value).toBe('reward');
  expect([...sort.options].map(o => o.value)).toEqual(values);
  expect([...sort.options].map(o => o.text)).toEqual(['Recommended', 'Newest', 'Shortest', 'Highest reward']);
  expect(env.query.mock.calls.length).toBe(queryCount); expect(env.sync.mock.calls.length).toBe(syncCount);
  expect(screen.getAllByTestId('story').map(n => n.dataset.id)).toEqual(['two']);
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  expect(screen.queryAllByTestId('story')).toHaveLength(0);
  expect(screen.getByText('No stories match this search in the collection.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(input.value).toBe('');
  expect(screen.getAllByTestId('story').map(n => n.dataset.id)).toEqual(['three', 'two', 'one']);
  expect(sort.value).toBe('reward'); // existing selected-collection order stays authored, not reward order
  const taxonomy = screen.getByText('النبوة');
  expect(taxonomy.closest('[lang]')?.getAttribute('lang')).toBe('ar');
  sort.focus(); act(() => setUiLanguage('ar'));
  expect(screen.getByRole('combobox')).toBe(sort); expect(document.activeElement).toBe(sort);
  expect(sort.value).toBe('reward'); expect(screen.getByPlaceholderText('ابحث داخل السلسلة…')).toBe(input);
});
it('translates default heading, global search, loading/empty states but SSR stays Arabic', () => {
  env.activeCollection = undefined; env.stories = []; env.loading = true;
  const { rerender } = render(<View />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('مكتبة السلاسل القصصية');
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Story collections');
  expect(screen.getByPlaceholderText('Search collections and stories…')).toBeTruthy();
  expect(screen.getByText('Loading library…')).toBeTruthy();
  env.loading = false; rerender(<View />);
  expect(screen.getByText('No collections match the selected filters.')).toBeTruthy();
  expect(screen.getByText('collections')).toBeTruthy(); expect(screen.getByText('stories')).toBeTruthy();
  const markup = renderToString(<View />);
  expect(markup).toContain('مكتبة السلاسل القصصية'); expect(markup).not.toContain('Story collections');
});
