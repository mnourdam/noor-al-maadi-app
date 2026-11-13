import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { existsSync } from 'node:fs';
import { OFFLINE_STORY_MEDIA_IDS, localStoryMediaPath } from '@/lib/stories/media/offline-pack';
import { resolveCachedStoryMediaUrl, prefetchStoryMediaRows, invalidateStoryMediaUrl, useStoryMediaUrl } from '@/lib/stories/media/url';
const sdk = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: sdk.sign }) } } }));
const remote = { id: 'synthetic-not-packaged', storage_bucket: 'story-media', storage_path: 'synthetic.webp', processing_version: 2 };
const bundled = { ...remote, id: OFFLINE_STORY_MEDIA_IDS[0] };
beforeEach(() => {
  sdk.sign.mockReset(); invalidateStoryMediaUrl(remote);
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Unexpected HTTP'); }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('has bytes for every declared bundled media ID', () => {
  expect(OFFLINE_STORY_MEDIA_IDS.length).toBe(1785);
  for (const id of OFFLINE_STORY_MEDIA_IDS) expect(existsSync(`${process.cwd()}/public${localStoryMediaPath(id)}`)).toBe(true);
});
it('resolves every bundled ID offline without cache/signing/HTTP', async () => {
  const open = vi.fn(() => { throw Error('No cache needed'); }); vi.stubGlobal('caches', { open });
  for (const id of OFFLINE_STORY_MEDIA_IDS) expect(await resolveCachedStoryMediaUrl({ ...remote, id })).toBe(localStoryMediaPath(id));
  expect(open).not.toHaveBeenCalled(); expect(sdk.sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('does not sign or fetch bundled prefetch entries online', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const match = vi.fn(async () => undefined);
  vi.stubGlobal('caches', { open: async () => ({ match, put: vi.fn() }) });
  sdk.sign.mockResolvedValue({ data: { signedUrl: 'https://synthetic.invalid/image.webp' }, error: null });
  await prefetchStoryMediaRows([bundled]);
  expect(match).not.toHaveBeenCalled(); expect(sdk.sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('preserves absent-row and nonbundled offline miss', async () => {
  expect(await resolveCachedStoryMediaUrl(null)).toBeNull();
  expect(await resolveCachedStoryMediaUrl(remote)).toBeNull(); expect(sdk.sign).not.toHaveBeenCalled();
});
it('preserves nonbundled cached bytes without signing', async () => {
  vi.stubGlobal('caches', { open: async () => ({ match: async () => ({ blob: async () => new Blob(['synthetic']) }) }) });
  const create = vi.fn(() => 'blob:synthetic'); vi.stubGlobal('URL', class extends URL { static createObjectURL = create; });
  expect(await resolveCachedStoryMediaUrl(remote)).toBe('blob:synthetic'); expect(sdk.sign).not.toHaveBeenCalled();
});
it('preserves nonbundled signed fallback and memoization', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  sdk.sign.mockResolvedValue({ data: { signedUrl: 'https://synthetic.invalid/image.webp?token=test' }, error: null });
  expect(await resolveCachedStoryMediaUrl(remote)).toBe('https://synthetic.invalid/image.webp?token=test&v=2');
  await resolveCachedStoryMediaUrl(remote); expect(sdk.sign).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});
it('preserves signing failure and later explicit retry', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  sdk.sign.mockResolvedValueOnce({ data: null, error: { message: 'synthetic' } }).mockResolvedValueOnce({ data: { signedUrl: 'https://synthetic.invalid/image.webp' }, error: null });
  expect(await resolveCachedStoryMediaUrl(remote)).toBeNull();
  expect(await resolveCachedStoryMediaUrl(remote)).toBe('https://synthetic.invalid/image.webp?v=2');
});
it('preserves nonbundled verified prefetch and excludes explicitly unverified rows', async () => {
  vi.stubGlobal('navigator', { onLine: true });
  const put = vi.fn(async () => {}); vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) });
  sdk.sign.mockResolvedValue({ data: { signedUrl: 'https://synthetic.invalid/image.webp' }, error: null });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('synthetic', { headers: { 'content-type': 'image/webp' } })));
  await prefetchStoryMediaRows([bundled, remote, { ...remote, storage_path: 'unverified.webp', verified: false }]);
  expect(sdk.sign).toHaveBeenCalledTimes(1); expect(sdk.sign).toHaveBeenCalledWith('synthetic.webp', 3600); expect(fetch).toHaveBeenCalledTimes(1); expect(put).toHaveBeenCalledTimes(1);
});

it('updates the real hook for distinct bundled canonical sources', async () => {
  const first = { ...bundled, storage_path: 'first.webp' };
  const second = { ...bundled, id: OFFLINE_STORY_MEDIA_IDS[1], storage_path: 'second.webp' };
  const { result, rerender } = renderHook(({ row }) => useStoryMediaUrl(row), { initialProps: { row: first } });
  await waitFor(() => expect(result.current).toBe(localStoryMediaPath(first.id)));
  rerender({ row: second });
  await waitFor(() => expect(result.current).toBe(localStoryMediaPath(second.id)));
  expect(sdk.sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
