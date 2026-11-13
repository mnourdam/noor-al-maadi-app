import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { formatStoryDuration, resolveStoryDurationMs } from '@/lib/stories/duration';
import { StoryCard } from '@/components/stories/StoryCard';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { StorySummary } from '@/lib/stories/summary';
const env = vi.hoisted(() => ({ loggedIn: true, guest: false as boolean | null, cover: '/cover.webp', navigate: vi.fn(), writes: vi.fn() }));
vi.mock('@/lib/profile', () => ({ useProfile: () => ({ profile: { loggedIn: env.loggedIn }, addPoints: env.writes, addDinars: env.writes }) }));
vi.mock('@/lib/stories/guestCompletions', () => ({ guestHasCompleted: () => env.guest }));
vi.mock('@/lib/stories/covers', () => ({ useStoryCoverSrc: () => env.cover }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: any) => <a href={to.replace('$id', params.id)} {...props}>{children}</a>,
  useRouter: () => ({ navigate: env.navigate }),
}));
vi.mock('@/components/ModalPortal', () => ({ ModalPortal: ({ children }: any) => <>{children}</> }));
vi.mock('@/lib/navigation/engine', () => ({ useStashCurrentAsOrigin: () => env.writes }));
vi.mock('@/lib/navigation/overlay-registration', () => ({ OverlayDismissRegistration: () => null }));
vi.mock('@/lib/local-first-store', () => ({ localEncyclopediaById: () => null }));
const story: StorySummary = {
  id: 'one', slug: 'one', story_collection_id: 'stable-id', collection_order: 1,
  title_ar: 'قصة', title_en: 'Authored story', summary_ar: 'ملخص القصة', summary_en: 'Authored summary',
  world_slug: null, era: null, display_order: 0, xp_reward: 100, dinar_reward: 20,
  cover_media_id: 'story-cover', content_version: 1, published_at: null, scene_count: 3,
  category: null, rarity: null, length_class: null, historical_confidence: null,
  tags: [], prereqs: [], lock_explanation: null, unlocked: true, completed: false,
  progress: { last_scene_index: 0, max_scene_index_reached: 0 },
};

beforeEach(() => {
  localStorage.clear(); setUiLanguage('ar');
  env.loggedIn = true; env.guest = false; env.cover = '/cover.webp';
  env.navigate.mockReset(); env.writes.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps unlocked anchor/image/focus, progress, duration and rewards through ar/en/ar and cover updates', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { container, rerender } = render(<StoryCard story={story} />);
  const link = screen.getByRole('link', { name: story.title_ar }); link.focus();
  const image = screen.getByRole('img');
  const duration = screen.getByText(/≈/).textContent;
  const width = container.querySelector('[style*="width"]')?.getAttribute('style');
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('link', { name: 'Authored story' })).toBe(link);
  expect(document.activeElement).toBe(link); expect(screen.getByRole('img')).toBe(image);
  expect(link.getAttribute('href')).toBe('/story/one'); expect(link.getAttribute('lang')).toBe('ar');
  expect(screen.getByRole('heading').getAttribute('lang')).toBe('en');
  expect(screen.getByRole('heading').getAttribute('dir')).toBe('ltr');
  expect(image.getAttribute('alt')).toBe('Authored story'); expect(image.getAttribute('lang')).toBe('en');
  expect(screen.getByText('Authored summary').getAttribute('lang')).toBe('en');
  expect(screen.getByText('100')).toBeTruthy(); expect(screen.getByText('20')).toBeTruthy();
  expect(screen.getByText('Resume')).toBeTruthy();
  expect(screen.getByText(/≈/).textContent).toBe(formatStoryDuration(resolveStoryDurationMs({ metadata: null, sceneCount: story.scene_count }), 'en'));
  expect(container.querySelector('[style*="width"]')?.getAttribute('style')).toBe(width);
  expect(width).toContain('33%');
  env.cover = '/changed-cover.webp'; rerender(<StoryCard story={story} />);
  expect(screen.getByRole('img')).toBe(image); expect(image.getAttribute('src')).toBe(env.cover);
  expect(screen.getByRole('link')).toBe(link);
  act(() => setUiLanguage('ar'));
  expect(screen.getByRole('link', { name: story.title_ar })).toBe(link);
  expect(image.getAttribute('alt')).toBe(story.title_ar);
  expect(screen.getByText(/≈/).textContent).toBe(duration);
  expect(env.writes).not.toHaveBeenCalled(); expect(env.navigate).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled();
});
it('retains locked button and real Arabic dialog, prerequisites and close state through locale changes', () => {
  const locked = { ...story, unlocked: false, progress: null, lock_explanation: 'شرح أصلي', prereqs: [{ kind: 'player_level', ref: '5', title: 'المستوى الخامس', satisfied: false }] };
  render(<StoryCard story={locked} />);
  const button = screen.getByRole('button', { name: 'قصة مقفلة' }); button.focus();
  const image = screen.getByRole('img');
  fireEvent.click(button);
  const dialog = screen.getByRole('dialog', { name: 'قصة — مقفلة' });
  act(() => setUiLanguage('en'));
  expect(screen.getByRole('button', { name: 'Authored story Locked' })).toBe(button);
  expect(document.activeElement).toBe(button); expect(screen.getByRole('img')).toBe(image);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(within(dialog).getByText('شرح أصلي')).toBeTruthy(); expect(dialog.textContent).toContain('المستوى الخامس');
  expect(within(dialog).getByRole('heading').textContent).toBe('قصة');
  expect(screen.queryByRole('link')).toBeNull(); expect(env.navigate).not.toHaveBeenCalled();
  act(() => setUiLanguage('ar'));
  expect(screen.getByRole('button', { name: 'قصة مقفلة' })).toBe(button);
  fireEvent.click(within(dialog).getByRole('button', { name: 'حسنًا' }));
  expect(screen.queryByRole('dialog')).toBeNull(); expect(env.writes).not.toHaveBeenCalled();
});
it('retains failed-cover state on language change and resets only on a changed cover source', () => {
  const { rerender } = render(<StoryCard story={story} />);
  const link = screen.getByRole('link');
  fireEvent.error(screen.getByRole('img'));
  act(() => setUiLanguage('en'));
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByRole('link')).toBe(link);
  env.cover = '/replacement.webp'; rerender(<StoryCard story={story} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe(env.cover);
  expect(screen.getByRole('link')).toBe(link);
});
it('keeps guest completion, unknown and locked precedence without language-triggered writes', () => {
  env.loggedIn = false; env.guest = true;
  const { rerender } = render(<StoryCard story={{ ...story, progress: null }} />);
  expect(screen.getByText('مكتملة')).toBeTruthy();
  act(() => setUiLanguage('en'));
  expect(screen.getByText('Completed')).toBeTruthy();
  env.guest = null; act(() => window.dispatchEvent(new Event('irth:guest-story-completed')));
  expect(screen.getByRole('status').textContent).toContain('Completion history could not be verified');
  expect(screen.queryByText('New')).toBeNull();
  rerender(<StoryCard story={{ ...story, unlocked: false, progress: null }} />);
  expect(screen.getByRole('button', { name: 'Authored story Locked' })).toBeTruthy();
  env.guest = true; act(() => window.dispatchEvent(new Event('irth:guest-story-completed')));
  expect(screen.getByRole('button', { name: 'Authored story Locked' })).toBeTruthy();
  expect(screen.queryByText('Completed')).toBeNull(); expect(env.writes).not.toHaveBeenCalled();
});
it('uses fieldwise fallback, omits absent summary and provides unique accessible IDs and SSR Arabic', () => {
  setUiLanguage('en');
  const { rerender } = render(<><StoryCard story={{ ...story, title_en: ' ', summary_en: null }} /><StoryCard story={{ ...story, id: 'two' }} /></>);
  const headings = screen.getAllByRole('heading');
  expect(headings[0].textContent).toBe('قصة'); expect(headings[0].getAttribute('lang')).toBe('ar');
  expect(screen.getByText('ملخص القصة').getAttribute('dir')).toBe('rtl');
  expect(new Set(headings.map(h => h.id)).size).toBe(2);
  expect(screen.getAllByRole('link').map(link => link.getAttribute('aria-labelledby'))).toEqual(headings.map(h => h.id));
  rerender(<StoryCard story={{ ...story, summary_ar: null, summary_en: ' ' }} />);
  expect(document.querySelector('p')).toBeNull();
  const html = renderToString(<><StoryCard story={story} /><StoryCard story={{ ...story, id: 'two' }} /></>);
  expect(html).not.toContain('Authored story'); expect(html).toContain('قصة');
  const tree = document.createElement('div'); tree.innerHTML = html;
  expect(new Set([...tree.querySelectorAll('h3')].map(h => h.id)).size).toBe(2);
});
