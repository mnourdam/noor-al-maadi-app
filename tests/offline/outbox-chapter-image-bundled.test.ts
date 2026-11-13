import { afterEach, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { resolveImageUrl } from '@/lib/image-cache';
import { OFFLINE_CHAPTER_IMAGE_PATHS } from '@/lib/campaign-art/chapter-pack.generated';
import { localChapterImagePathForUrl } from '@/lib/campaign-art/offline-pack';
afterEach(() => vi.unstubAllGlobals());
it('maps every shipped chapter image to existing same-origin bytes', () => {
  expect(OFFLINE_CHAPTER_IMAGE_PATHS.length).toBeGreaterThan(0);
  for (const path of OFFLINE_CHAPTER_IMAGE_PATHS) {
    expect(localChapterImagePathForUrl(`https://example.test/storage/v1/object/sign/campaign-key-art/${path}?token=synthetic`)).toBe(`/campaign-key-art/${path}`);
    expect(existsSync(`${process.cwd()}/public/campaign-key-art/${path}`)).toBe(true);
  }
});
it('resolves every bundled chapter image offline without fetch or CacheStorage', async () => {
  const fetch = vi.fn(() => { throw new Error('network must not run'); });
  const open = vi.fn(() => { throw new Error('cache must not run'); });
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('caches', { open }); vi.stubGlobal('navigator', { onLine: false });
  for (const path of OFFLINE_CHAPTER_IMAGE_PATHS) {
    expect(await resolveImageUrl(`https://example.test/storage/v1/object/sign/campaign-key-art/${path}?token=synthetic`)).toBe(`/campaign-key-art/${path}`);
  }
  expect(fetch).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});
