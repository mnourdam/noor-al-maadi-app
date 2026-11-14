import React from 'react';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const calls = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), remove: vi.fn(), navigate: vi.fn(), all: vi.fn(), action: vi.fn(), clear: vi.fn(), callbacks: [] as Array<() => void> }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useRouter: () => ({ navigate: calls.navigate }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Screen: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock('@/lib/navigation', () => ({ useStashCurrentAsOrigin: () => () => {} }));
vi.mock('@/lib/notifications/server', () => ({
  fetchMyNotifications: calls.list, markNotificationRead: calls.read,
  deleteMyNotification: calls.remove, markAllNotificationsRead: calls.all,
  clearMyNotifications: calls.clear, subscribeToMyNotifications: (fn: () => void) => { calls.callbacks.push(fn); return () => {}; },
}));
vi.mock('@/lib/notifications/action', () => ({
  resolveNotificationAction: calls.action,
  openExternalUrl: vi.fn(),
}));
import { Route } from '@/routes/notifications';
import { setActiveOwnerInternal, __resetIdentityForTests, getActiveOwner } from '@/lib/identity/owner';
const Center = (Route as unknown as { options: { component: React.ComponentType } }).options.component;
const row = { id: 'synthetic-alice-row', title: 'Synthetic Alice notice', body: 'Synthetic Alice-only body',
  type: 'campaign', category: 'campaign', created_at: '2026-11-14T00:00:00Z', read_at: null,
  image_url: null, deep_link: '/synthetic', payload: {} };
beforeEach(() => {
  __resetIdentityForTests(); setActiveOwnerInternal('user:alice');
  vi.clearAllMocks(); calls.action.mockReturnValue({kind:'internal',path:'/synthetic'}); calls.callbacks=[]; calls.list.mockImplementation(async () => getActiveOwner() === "user:alice" ? [row] : []); calls.all.mockResolvedValue(undefined); calls.read.mockResolvedValue(undefined);
  calls.navigate.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); __resetIdentityForTests(); });
it('positive: actual Center renders and opens same-owner synthetic notification', async () => {
  const view = render(<Center />);
  await act(async () => {});
  expect(view.getByText(row.body)).toBeTruthy();
  fireEvent.click(view.getByText(row.title));
  expect(calls.read).toHaveBeenCalledWith(row.id);
  expect(calls.navigate).toHaveBeenCalled();
});
it('retires already-rendered Alice content on actual Bob owner switch without remount or notification event', async () => {
  const view = render(<Center />);
  await act(async () => {});
  expect(view.getByText(row.body)).toBeTruthy();
  act(() => setActiveOwnerInternal('user:bob'));
  expect(view.queryByText(row.body)).toBeNull();
  expect(view.queryByText(row.title)).toBeNull();
});
it('cannot act on Alice row after actual Bob owner switch', async () => {
  const view = render(<Center />);
  await act(async () => {});
  act(() => setActiveOwnerInternal('user:bob'));
  const stale = view.queryByText(row.title);
  if (stale) fireEvent.click(stale);
  expect(calls.read).not.toHaveBeenCalled();
  expect(calls.navigate).not.toHaveBeenCalled();
});

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
it.each(['user:bob', 'guest:synthetic', 'aba'])('late fetch cannot repopulate retired scope: %s', async (target) => {
 const old = deferred<typeof row[]>(); calls.list.mockReturnValueOnce(old.promise);
 const view = render(<Center />); const retiredEvent = calls.callbacks[0];
 act(() => { setActiveOwnerInternal(target === 'aba' ? 'user:bob' : target); if (target === 'aba') setActiveOwnerInternal('user:alice'); });
 await act(async () => {});
 const count=calls.list.mock.calls.length; act(() => retiredEvent()); expect(calls.list).toHaveBeenCalledTimes(count);
 await act(async () => old.resolve([{...row, title:'Old held response', body:'Old held body'}]));
 expect(view.queryByText('Old held body')).toBeNull();
});
it('fresh Bob rows and actions work after owner replacement', async () => {
 const bob={...row,id:'bob-row',title:'Bob notice',body:'Bob body'};
 const view=render(<Center/>); await act(async()=>{});
 calls.list.mockResolvedValue([bob]); act(()=>setActiveOwnerInternal('user:bob')); await act(async()=>{});
 expect(view.queryByText(row.body)).toBeNull(); fireEvent.click(view.getByText(bob.title));
 expect(calls.read).toHaveBeenCalledExactlyOnceWith('bob-row');
});
it('retired mark-all completion does not show feedback in successor scope', async () => {
 const done=deferred<void>();calls.all.mockReturnValue(done.promise);
 const view=render(<Center/>);await act(async()=>{});fireEvent.click(view.getByText('تحديد الكل كمقروء'));
 act(()=>setActiveOwnerInternal('user:bob'));await act(async()=>done.resolve());
 expect(view.queryByText('تم تحديد كل الإشعارات كمقروءة.')).toBeNull();
});
it('same-owner feedback expires and its timer is cleared on unmount', async () => {
 vi.useFakeTimers();const view=render(<Center/>);await act(async()=>{});
 fireEvent.click(view.getByText('تحديد الكل كمقروء'));await act(async()=>{});
 expect(view.getByText('تم تحديد كل الإشعارات كمقروءة.')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(2500));expect(view.queryByText('تم تحديد كل الإشعارات كمقروءة.')).toBeNull();
 const clear=vi.spyOn(globalThis,'clearTimeout');window.dispatchEvent(new Event('irth:notifications:updated'));await act(async()=>{});
 fireEvent.click(view.getByText('تحديد الكل كمقروء'));await act(async()=>{});view.unmount();expect(clear).toHaveBeenCalled();
});
it('unmounted refresh and mark-all completions cannot reappear', async () => {
 const done=deferred<void>();calls.all.mockReturnValue(done.promise);const view=render(<Center/>);await act(async()=>{});
 fireEvent.click(view.getByText('تحديد الكل كمقروء'));const held=deferred<typeof row[]>();calls.list.mockReturnValue(held.promise);
 act(()=>window.dispatchEvent(new Event('irth:notifications:updated')));view.unmount();
 await act(async()=>{done.resolve();held.resolve([row]);});expect(document.body.textContent).not.toContain(row.body);
});
it('confirmation reentry switching owner cannot dispatch clear-all', async () => {
 const view=render(<Center/>);await act(async()=>{});
 vi.spyOn(window,'confirm').mockImplementation(()=>{setActiveOwnerInternal('user:bob');return true;});
 fireEvent.click(view.getByText('مسح الكل'));expect(calls.clear).not.toHaveBeenCalled();
});

it.each([false,true])('rejected navigation fallback obeys owner retirement=%s', async (retire) => {
 const oldHash=location.hash;history.replaceState(null,'',location.pathname);
 try {
  let reject!: (e: Error) => void;
  calls.navigate.mockReturnValue(new Promise((_, r)=>{reject=r}));
  calls.action.mockReturnValue({kind:'internal',path:location.pathname+'#synthetic-fallback'});
  const view=render(<Center/>);await act(async()=>{});expect(calls.list).toHaveBeenCalledWith(150);
  fireEvent.click(view.getByText(row.title));expect(calls.navigate).toHaveBeenCalledOnce();
  if(retire)act(()=>setActiveOwnerInternal('user:bob'));
  await act(async()=>reject(new Error('synthetic navigation failure')));
  expect(location.hash).toBe(retire?'':'#synthetic-fallback');
 } finally { history.replaceState(null,'',location.pathname+oldHash); }
});
