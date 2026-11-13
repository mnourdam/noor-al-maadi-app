import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CollectionCard } from '@/components/stories/CollectionCard';
import { bundledCoverIsCurrent } from '@/lib/stories/covers/resolve';
import { localStoryCoverPath, packagedCoverMediaId } from '@/lib/stories/covers/offline-pack';
import { setUiLanguage } from '@/lib/ui-language/store';
import type { StoryCollection } from '@/lib/stories/collections';
import type { StorySummary } from '@/lib/stories/summary';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), resolve: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/stories/media/url', () => ({ resolveCachedStoryMediaUrl: mocks.resolve }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: any) =>
    <a href={to + '?collection=' + search.collection} {...props}>{children}</a>,
}));
const collection: StoryCollection = {
  id: 'stable-id', slug: 'canonical', title_ar: 'عنوان عربي', title_en: 'Authored title',
  summary_ar: 'ملخص عربي', summary_en: 'Authored summary', cover_media_id: 'cover-id', display_order: 1,
};
const story: StorySummary = {
  id: 'story-fall-of-baghdad-1258', slug: 'one', story_collection_id: 'stable-id', collection_order: 1,
  title_ar: 'قصة', title_en: null, summary_ar: null, summary_en: null,
  world_slug: null, era: null, display_order: 0, xp_reward: 100, dinar_reward: 20,
  cover_media_id: packagedCoverMediaId('story-fall-of-baghdad-1258'), content_version: 1, published_at: null, scene_count: 3,
  category: null, rarity: null, length_class: null, historical_confidence: null,
  tags: [], prereqs: [], lock_explanation: null, unlocked: true, completed: true,
  progress: { last_scene_index: 2, max_scene_index_reached: 2 },
};
const stories: StorySummary[] = [
  story,
  { ...story, id: 'two', completed: false, cover_media_id: null },
  { ...story, id: 'three', completed: false, unlocked: false, progress: null, cover_media_id: null },
];

let client: QueryClient;
beforeEach(() => {
  setUiLanguage('ar'); mocks.rpc.mockReset(); mocks.resolve.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.rpc.mockResolvedValue({ data: { ok: true, media: [{ id: story.cover_media_id, storage_path: 'new-cover.webp' }] }, error: null });
  mocks.resolve.mockResolvedValue('/synthetic-new-cover.webp');
});
afterEach(() => { cleanup(); client.clear(); });
function Card({ version = 1, ownCover = false }: { version?: number; ownCover?: boolean }) {
  return <QueryClientProvider client={client}><CollectionCard
    collection={{ ...collection, cover_media_id: ownCover ? 'collection-cover' : null }}
    stories={[{ ...story, content_version: version }]} /></QueryClientProvider>;
}
it('reproduces omitted version accepting old bundle while explicit newer version rejects it', () => {
  expect(bundledCoverIsCurrent({ id: story.id })).toBe(true);
  expect(bundledCoverIsCurrent({ id: story.id, content_version: 2 })).toBe(false);
});
it('real hook keeps current bundled cover query-free then resolves newer version without remounting link', async () => {
  const { rerender } = render(<Card />);
  const link = screen.getByRole('link'); link.focus();
  expect(screen.getByRole('img').getAttribute('src')).toBe(localStoryCoverPath(story.id));
  expect(mocks.rpc).not.toHaveBeenCalled();
  rerender(<Card version={2} />);
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('/synthetic-new-cover.webp'));
  expect(screen.getByRole('link')).toBe(link); expect(document.activeElement).toBe(link);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('get_story_media_urls_v2', { p_story_id: story.id });
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(screen.getByText('100%')).toBeTruthy();
  rerender(<Card version={1} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe(localStoryCoverPath(story.id));
});
it('preserves collection-owned cover branch without misrouting to fallback story', async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true, media: [{ id: 'collection-cover', storage_path: 'own.webp' }] }, error: null });
  render(<Card version={9} ownCover />);
  await waitFor(() => expect(screen.getByRole('img').getAttribute('src')).toBe('/synthetic-new-cover.webp'));
  expect(mocks.rpc).toHaveBeenCalledWith('get_story_media_urls_v2', { p_story_id: 'collection-stable-id' });
  expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'collection-cover' }));
});
