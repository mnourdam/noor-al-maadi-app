import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { __resetIdentityForTests, setActiveOwnerInternal } from '@/lib/identity/owner';
import { installIdentityPartition, __uninstallPartitionForTests } from '@/lib/identity/partition';
const sdk = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: sdk.session }, from: () => ({ select: () => ({ eq: sdk.query }) }) } }));
vi.mock('@/lib/progressSync', () => ({ upsertChapterProgress: vi.fn(), addCollectionItems: vi.fn() }));
import { hydrateLedgerFromCloud } from '@/lib/campaignLedger';
const key = 'irth_campaign_ledger_v1';
const sentinel = JSON.stringify({ keys: { existing: { at: 'old', synced: false } }, pending: [], active: { campaignId: 'keep', chapterId: 'keep', at: 'old' } });
const rows = [{ campaign_id: 'c', chapter_id: 'ch', completed_at: '2026-01-01' }];
function deferred<T>() { let resolve!: (v:T)=>void; const promise = new Promise<T>(r => { resolve=r; }); return { promise, resolve }; }
beforeEach(() => {
  __uninstallPartitionForTests(); localStorage.clear(); __resetIdentityForTests(); setActiveOwnerInternal('user:alice'); installIdentityPartition();
  localStorage.setItem('irth_admin_campaigns', JSON.stringify([{ id:'c', title:'Fixture', status:'published', chapters:[{id:'ch',title:'Chapter',order:1,activities:[{id:'a',type:'multiple_choice',prompt:'Fixture'}]}] }]));
  localStorage.setItem(key, sentinel); sdk.query.mockReset(); sdk.session.mockReset();
  sdk.session.mockResolvedValue({ data: { session: { user: { id:'alice' } } } });
});
afterEach(() => { vi.restoreAllMocks(); __uninstallPartitionForTests(); });
for (const aba of [false,true]) it(`does not hydrate retired query into ${aba ? 'successor Alice' : 'Bob'} partition`, async () => {
  const response = deferred<{data:typeof rows,error:null}>(); sdk.query.mockReturnValue(response.promise);
  const work = hydrateLedgerFromCloud(); await vi.waitFor(() => expect(sdk.query).toHaveBeenCalledOnce());
  setActiveOwnerInternal('user:bob'); localStorage.setItem(key, sentinel);
  if (aba) setActiveOwnerInternal('user:alice');
  response.resolve({ data:rows,error:null });
  expect(await work).toBeNull(); expect(localStorage.getItem(key)).toBe(sentinel);
});
it('rejects a stable session-owner mismatch before querying', async () => {
  sdk.session.mockResolvedValue({ data:{session:{user:{id:'bob'}}} });
  expect(await hydrateLedgerFromCloud()).toBeNull(); expect(sdk.query).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBe(sentinel);
});
it('retires during session lookup without issuing a query', async () => {
  const auth = deferred<unknown>(); sdk.session.mockReturnValue(auth.promise);
  const work = hydrateLedgerFromCloud(); await vi.waitFor(() => expect(sdk.session).toHaveBeenCalledOnce());
  setActiveOwnerInternal('user:bob'); localStorage.setItem(key,sentinel);
  auth.resolve({data:{session:{user:{id:'alice'}}}});
  expect(await work).toBeNull(); expect(sdk.query).not.toHaveBeenCalled(); expect(localStorage.getItem(key)).toBe(sentinel);
});
it('preserves current-owner completed-row expansion and existing state', async () => {
  sdk.query.mockResolvedValue({data:[...rows,{campaign_id:'ignored',chapter_id:'open',completed_at:null}],error:null});
  expect(await hydrateLedgerFromCloud()).toEqual({keysAdded:3});
  const stored=JSON.parse(localStorage.getItem(key)!);
  expect(Object.keys(stored.keys).sort()).toEqual(['existing','chapter:c:ch','activity:c:ch:a','campaign:c'].sort());
  expect(stored.keys.existing).toEqual(JSON.parse(sentinel).keys.existing);
  expect(stored.active).toEqual(JSON.parse(sentinel).active); expect(stored.pending).toEqual([]);
  expect(await hydrateLedgerFromCloud()).toEqual({keysAdded:0});
});
it('keeps no-session and query errors inert', async () => {
  sdk.session.mockResolvedValueOnce({data:{session:null}});
  expect(await hydrateLedgerFromCloud()).toBeNull(); expect(sdk.query).not.toHaveBeenCalled();
  sdk.query.mockResolvedValue({data:null,error:{message:'synthetic'}});
  expect(await hydrateLedgerFromCloud()).toBeNull(); expect(localStorage.getItem(key)).toBe(sentinel);
});
