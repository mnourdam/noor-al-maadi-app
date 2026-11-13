import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OfflineSnapshot } from '@/lib/offline-storage';
const e = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn(async () => {}) }));
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://synthetic.invalid', 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args: any[]) => e.fetch(...args) },
  }) };
});
vi.mock('@/lib/offline-storage', () => ({
  MIN_PUBLIC_ENCYCLOPEDIA_ROWS: 1500, saveSnapshot: e.save,
  loadSnapshot: async () => { throw Error('unexpected snapshot load'); },
  mergeSnapshots: () => { throw Error('unexpected snapshot merge'); },
}));
vi.mock('@/lib/offline-snapshot', () => ({ loadBundledSnapshot: async () => { throw Error('unexpected bundled load'); } }));
const key = 'irth.campaign-key-art.overlay.v1';
const row = (image: string) => ({ id: 'campaign', slug: 'campaign', status: 'published', data: {
  id: 'campaign', slug: 'campaign', status: 'published', intro_story_id: 'intro',
  chapters: [{ id: 'chapter', imageUrl: image }],
} });
const art = (path: string) => ({ id: 'campaign', slug: 'campaign', key_art_path: path,
  key_art_square_path: null, key_art_credit: null });
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const flush = async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(0); };
let online: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers();
  online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => {
  vi.useRealTimers();
  if (online) Object.defineProperty(navigator, 'onLine', online); else delete (navigator as any).onLine;
});
it('serves existing chapter/art after both owned deadlines, then selects fresh data without late rollback', async () => {
  const store = await import('@/lib/local-first-store');
  const snapshot: OfflineSnapshot = { snapshot_version: 5, schema_version: 5, generated_at: '2020-01-01T00:00:00Z',
    source: 'bundled', content_counts: { admin_campaigns: 1 }, collections: { admin_campaigns: [row('cached-image')] } };
  store.applyLocalSnapshot(snapshot);
  expect(store.localCampaignByIdOrSlug('campaign')?.data.chapters[0].imageUrl).toBe('cached-image');
  localStorage.setItem(key, JSON.stringify({ at: 0, map: { campaign: art('cached-art') } }));
  let healthy = false;
  const held: { signal: AbortSignal; resolve: (r: Response) => void }[] = [];
  e.fetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe('https://synthetic.invalid');
    const manifest = url.pathname === '/rest/v1/rpc/get_content_manifest';
    const campaigns = url.pathname === '/rest/v1/campaigns_public';
    expect(manifest || campaigns).toBe(true);
    if (!healthy) return new Promise<Response>(resolve => held.push({ signal: init?.signal as AbortSignal, resolve }));
    if (manifest) return Promise.resolve(response([]));
    return Promise.resolve(response(url.searchParams.get('select')?.split(',').includes('data') ? [row('fresh-image')] : [art('fresh-art')]));
  });
  const reader = await import('@/lib/supabaseCampaigns');
  let settled = false;
  const first = reader.fetchCampaignByIdOrSlug('campaign').then(value => { settled = true; return value; });
  await flush(); expect(held).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(10_000); await flush();
  expect(held).toHaveLength(2); expect(settled).toBe(false);
  expect(held[0].signal.aborted).toBe(true); expect(held[1].signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(7_999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  const cached = await first;
  expect(cached?.chapters[0].imageUrl).toBe('cached-image'); expect(cached?.key_art_path).toBe('cached-art');
  expect(held[1].signal.aborted).toBe(true); expect(e.save).not.toHaveBeenCalled();
  healthy = true;
  const fresh = await reader.fetchCampaignByIdOrSlug('campaign');
  expect(fresh?.chapters[0].imageUrl).toBe('fresh-image'); expect(fresh?.key_art_path).toBe('fresh-art');
  expect(e.save).toHaveBeenCalledTimes(1);
  const count = e.fetch.mock.calls.length;
  held[1].resolve(response([art('retired-art')])); held[0].resolve(response([])); await flush();
  expect(e.fetch).toHaveBeenCalledTimes(count); expect(e.save).toHaveBeenCalledTimes(1);
  expect(store.localCampaignByIdOrSlug('campaign')?.data.chapters[0].imageUrl).toBe('fresh-image');
  expect(JSON.parse(localStorage.getItem(key)!).map.campaign.key_art_path).toBe('fresh-art');
});
