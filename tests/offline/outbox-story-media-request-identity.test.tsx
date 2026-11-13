import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { OFFLINE_STORY_MEDIA_IDS, localStoryMediaPath } from '@/lib/stories/media/offline-pack';
import { useStoryMediaUrl } from '@/lib/stories/media/url';
const sdk = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: sdk.sign }) } } }));
const base = { id: 'synthetic-remote', storage_bucket: 'story-media', storage_path: 'shared-path.webp', processing_version: 1 };
const first = { ...base, id: OFFLINE_STORY_MEDIA_IDS[0] };
const second = { ...base, id: OFFLINE_STORY_MEDIA_IDS[1] };
const revoke = vi.fn(); let serial = 0;
beforeEach(() => {
  sdk.sign.mockReset(); revoke.mockClear(); serial = 0;
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Unexpected network'); }));
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:request-' + ++serial);
    static revokeObjectURL = revoke;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('masks old packaged identity immediately for same source new ID, then handles null and ABA', async () => {
  const renders: (string | null)[] = [];
  const { result, rerender } = renderHook(({ row }: { row: typeof base | null }) => {
    const url = useStoryMediaUrl(row); renders.push(url); return url;
  }, { initialProps: { row: first as typeof base | null } });
  await waitFor(() => expect(result.current).toBe(localStoryMediaPath(first.id)));
  renders.length = 0; rerender({ row: second });
  expect(renders[0]).toBeNull();
  await waitFor(() => expect(result.current).toBe(localStoryMediaPath(second.id)));
  rerender({ row: null }); expect(result.current).toBeNull();
  renders.length = 0; rerender({ row: first }); expect(renders[0]).toBeNull();
  await waitFor(() => expect(result.current).toBe(localStoryMediaPath(first.id)));
  expect(sdk.sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
});
it('retires late A/B results across pending A→B→A and revokes only each completed request blob', async () => {
  const pending: ((value: any) => void)[] = [];
  vi.stubGlobal('caches', { open: async () => ({ match: () => new Promise(resolve => pending.push(resolve)) }) });
  const response = () => ({ blob: async () => new Blob(['synthetic']) });
  const { result, rerender, unmount } = renderHook(({ row }) => useStoryMediaUrl(row), { initialProps: { row: base } });
  await waitFor(() => expect(pending).toHaveLength(1));
  rerender({ row: { ...base, id: 'remote-B' } }); await waitFor(() => expect(pending).toHaveLength(2));
  rerender({ row: base }); await waitFor(() => expect(pending).toHaveLength(3));
  await act(async () => { pending[2](response()); });
  expect(result.current).toBe('blob:request-1');
  await act(async () => { pending[0](response()); pending[1](response()); });
  expect(result.current).toBe('blob:request-1');
  expect(revoke.mock.calls.map(c => c[0]).sort()).toEqual(['blob:request-2', 'blob:request-3']);
  unmount(); expect(revoke).toHaveBeenCalledWith('blob:request-1');
});
it('actual shared cache bytes create separate object URLs; retiring one consumer does not revoke the other', async () => {
  vi.stubGlobal('caches', { open: async () => ({ match: async () => ({ blob: async () => new Blob(['shared bytes']) }) }) });
  const a = renderHook(() => useStoryMediaUrl(base));
  const b = renderHook(() => useStoryMediaUrl(base));
  await waitFor(() => { expect(a.result.current).toMatch(/^blob:/); expect(b.result.current).toMatch(/^blob:/); });
  const aUrl = a.result.current; const bUrl = b.result.current;
  expect(aUrl).not.toBe(bUrl);
  a.unmount(); expect(revoke).toHaveBeenCalledWith(aUrl); expect(revoke).not.toHaveBeenCalledWith(bUrl);
  expect(b.result.current).toBe(bUrl);
  b.unmount(); expect(revoke).toHaveBeenCalledWith(bUrl);
});
it('masks old remote result when resolver primitives change, retires null and late unmounted result', async () => {
  const pending: ((value: any) => void)[] = [];
  vi.stubGlobal('caches', { open: async () => ({ match: () => new Promise(resolve => pending.push(resolve)) }) });
  const renders: (string | null)[] = [];
  const { result, rerender, unmount } = renderHook(({ row }: { row: typeof base | null }) => {
    const url = useStoryMediaUrl(row); renders.push(url); return url;
  }, { initialProps: { row: base as typeof base | null } });
  await waitFor(() => expect(pending).toHaveLength(1));
  await act(async () => { pending[0]({ blob: async () => new Blob(['first']) }); });
  expect(result.current).toBe('blob:request-1');
  for (const delta of [{ storage_path: 'other.webp' }, { storage_bucket: 'other-bucket' }, { processing_version: 2 }]) {
    renders.length = 0;
    rerender({ row: { ...base, ...delta } });
    expect(renders[0]).toBeNull();
  }
  await waitFor(() => expect(pending).toHaveLength(4));
  rerender({ row: null }); expect(result.current).toBeNull(); unmount();
  await act(async () => { pending.slice(1).forEach(resolve => resolve({ blob: async () => new Blob(['late']) })); });
  expect(revoke).toHaveBeenCalledTimes(4);
  expect(sdk.sign).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('never resurrects revoked resolved A during resolved-A→pending-B→A', async () => {
  const pending: ((value: any) => void)[] = [];
  vi.stubGlobal('caches', { open: async () => ({ match: () => new Promise(resolve => pending.push(resolve)) }) });
  const renders: (string | null)[] = [];
  const { result, rerender } = renderHook(({ row }) => {
    const url = useStoryMediaUrl(row); renders.push(url); return url;
  }, { initialProps: { row: base } });
  await waitFor(() => expect(pending).toHaveLength(1));
  await act(async () => { pending[0]({ blob: async () => new Blob(['first A']) }); });
  expect(result.current).toBe('blob:request-1');
  rerender({ row: { ...base, id: 'pending-B' } });
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(revoke).toHaveBeenCalledWith('blob:request-1');
  renders.length = 0;
  rerender({ row: base });
  await waitFor(() => expect(pending).toHaveLength(3));
  expect(renders.every(url => url === null)).toBe(true);
  await act(async () => { pending[2]({ blob: async () => new Blob(['new A']) }); });
  expect(result.current).toBe('blob:request-2');
  await act(async () => { pending[1]({ blob: async () => new Blob(['late B']) }); });
  expect(result.current).toBe('blob:request-2');
  expect(revoke).toHaveBeenCalledWith('blob:request-3');
  expect(revoke).not.toHaveBeenCalledWith('blob:request-2');
});
