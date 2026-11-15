import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const sdk = vi.hoisted(() => ({auth:{getSession:vi.fn(),getUser:vi.fn()},rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client', () => ({supabase:sdk}));
vi.mock('@tanstack/react-router', () => ({
 createFileRoute: () => (options: unknown) => ({options}),
 useRouter: () => ({navigate:vi.fn()}),
 Link: ({children}:{children:React.ReactNode}) => <a>{children}</a>,
}));
vi.mock('@/components/AppShell', () => ({
 AppShell: ({children}:{children:React.ReactNode}) => <main>{children}</main>,
 Screen: ({children}:{children:React.ReactNode}) => <section>{children}</section>,
}));
vi.mock('@/lib/navigation', () => ({useStashCurrentAsOrigin:()=>()=>{}}));
import { Route } from '@/routes/notifications';
import * as api from '@/lib/notifications/server';
import {setActiveOwnerInternal, __resetIdentityForTests} from '@/lib/identity/owner';
import {installIdentityPartition,__uninstallPartitionForTests} from '@/lib/identity/partition';
const Center=(Route as unknown as {options:{component:React.ComponentType}}).options.component;
const row = {id:'test',title:'Synthetic title',body:'Synthetic body',created_at:'2026-11-14T00:00:00Z',read_at:null,image_url:null};
const reply=(rows=[row])=>({data:rows,error:null});
function deferred(){let resolve!:(value:ReturnType<typeof reply>)=>void;const promise=new Promise<ReturnType<typeof reply>>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(async()=>{
 __resetIdentityForTests();installIdentityPartition();setActiveOwnerInternal('user:alice');
 vi.clearAllMocks();localStorage.clear();
 sdk.auth.getSession.mockResolvedValue({data:{session:{user:{id:'alice'}}}});
 sdk.auth.getUser.mockResolvedValue({data:{user:null}});
 sdk.rpc.mockResolvedValue(reply());
 await api.clearMyNotifications();
 sdk.rpc.mockClear();
});
afterEach(()=>{cleanup();vi.useRealTimers();__uninstallPartitionForTests();vi.restoreAllMocks();});
it('warm remount displays before held refresh; cold mount waits; both issue one RPC',async()=>{
 const cold=deferred();sdk.rpc.mockReturnValueOnce(cold.promise);
 const first=render(<Center/>);await act(async()=>{});
 expect(first.queryByText(row.body)).toBeNull();expect(sdk.rpc).toHaveBeenCalledTimes(1);
 await act(async()=>cold.resolve(reply()));expect(first.getByText(row.body)).toBeTruthy();first.unmount();
 const warm=deferred();sdk.rpc.mockReturnValueOnce(warm.promise);
 const second=render(<Center/>);
 expect(second.getByText(row.body)).toBeTruthy(); // synchronous commit, no auth/RPC completion
 await act(async()=>{});expect(sdk.rpc).toHaveBeenCalledTimes(2);
 await act(async()=>warm.resolve(reply([{...row,body:'Fresh body'}])));
 expect(second.queryByText(row.body)).toBeNull();expect(second.getByText('Fresh body')).toBeTruthy();
});
it('expires after 30s and never seeds from offline persisted rows or another list limit',async()=>{
 localStorage.setItem('irth.notifications.serverCache.v1',JSON.stringify([row]));
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
 await api.fetchMyNotifications(200);expect(api.peekWarmNotificationCenter()).toBeUndefined();
 await api.fetchMyNotifications(150);expect(api.peekWarmNotificationCenter()).toHaveLength(1);
 vi.useFakeTimers();vi.advanceTimersByTime(api.NOTIFICATION_WARM_MS);
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
});
it.each(['user:bob','guest:synthetic','aba'])('does not expose warm rows after %s',async(target)=>{
 await api.fetchMyNotifications(150);
 setActiveOwnerInternal(target==='aba'?'user:bob':target);
 if(target==='aba')setActiveOwnerInternal('user:alice');
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
});
it.each(['markNotificationRead','markAllNotificationsRead','deleteMyNotification','clearMyNotifications','recordDismissed'] as const)
('invalidates at %s entry and after pending mutation even if a read repopulates',async(method)=>{
 await api.fetchMyNotifications(150);const change=deferred();
 sdk.rpc.mockImplementation((name:string)=>name==='list_my_notifications'?Promise.resolve(reply()):change.promise);
 const pending=api[method]('test');
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
 await api.fetchMyNotifications(150);
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
 change.resolve(reply([]));await pending;
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
});
it('later refresh beats older response; mutation-retired empty response cannot wipe displayed list',async()=>{
 await api.fetchMyNotifications(150);
 const old=deferred(),fresh=deferred();sdk.rpc.mockReturnValueOnce(old.promise);
 const view=render(<Center/>);await act(async()=>{});
 // mutation invalidates old generation; next event starts an independent read.
 sdk.rpc.mockResolvedValueOnce(reply([])).mockReturnValueOnce(fresh.promise);
 await act(async()=>api.markNotificationRead('test'));
 await act(async()=>fresh.resolve(reply([{...row,body:'Newer'}])));
 expect(view.getByText('Newer')).toBeTruthy();
 await act(async()=>old.resolve(reply([{...row,body:'Old'}])));
 expect(view.getByText('Newer')).toBeTruthy();expect(view.queryByText('Old')).toBeNull();
});
it('current empty successful refresh removes warm rows',async()=>{
 await api.fetchMyNotifications(150);sdk.rpc.mockResolvedValue(reply([]));
 const view=render(<Center/>);expect(view.getByText(row.body)).toBeTruthy();
 await act(async()=>{});expect(view.queryByText(row.body)).toBeNull();
 expect(api.peekWarmNotificationCenter()).toEqual([]);
});
it('measures controlled 1200ms warm-return display wait before/after',async()=>{
 vi.useFakeTimers();
 await api.fetchMyNotifications(150);
 sdk.rpc.mockClear();
 sdk.rpc.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve(reply()),1200)));
 const start=Date.now();
 const view=render(<Center/>);
 const immediate=!!view.queryByText(row.body);
 expect(immediate).toBe(process.env.NOTIFICATION_BASELINE !== '1');
 await act(async()=>{await vi.advanceTimersByTimeAsync(1199);});
 expect(!!view.queryByText(row.body)).toBe(immediate);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(view.getByText(row.body)).toBeTruthy();expect(sdk.rpc).toHaveBeenCalledTimes(1);
 console.log(JSON.stringify({fixture:'jsdom-fake-clock',baseline:process.env.NOTIFICATION_BASELINE==='1',
  firstRowsWaitMs:immediate?0:Date.now()-start,refreshCompletionMs:Date.now()-start,listRpcCount:sdk.rpc.mock.calls.length}));
});
it('late superseded list cannot seed a warm snapshot after mutation',async()=>{
 const held=deferred();sdk.rpc.mockReturnValueOnce(held.promise);
 const old=api.fetchMyNotifications(150);await act(async()=>{});
 await api.deleteMyNotification('test');held.resolve(reply());await old;
 expect(api.peekWarmNotificationCenter()).toBeUndefined();
});
it('empty warm result still avoids loading and detached snapshots cannot alter retained rows',async()=>{
 await api.fetchMyNotifications(150);
 const copy=api.peekWarmNotificationCenter()!;
 copy[0].title='mutated';copy.length=0;
 expect(api.peekWarmNotificationCenter()![0].title).toBe(row.title);
 sdk.rpc.mockResolvedValue(reply([]));await api.fetchMyNotifications(150);
 const held=deferred();sdk.rpc.mockReturnValue(held.promise);
 const view=render(<Center/>);expect(view.getByText('لا توجد إشعارات')).toBeTruthy();
 await act(async()=>held.resolve(reply([])));
});
it('cold refresh retired by non-emitting dismiss catches up instead of leaving skeleton',async()=>{
 const held=deferred();sdk.rpc.mockReturnValueOnce(held.promise);
 const view=render(<Center/>);await act(async()=>{});
 expect(view.queryByText(row.body)).toBeNull();
 await act(async()=>api.recordDismissed('banner'));
 await act(async()=>held.resolve(reply()));
 expect(view.getByText(row.body)).toBeTruthy();
 expect(sdk.rpc.mock.calls.map(c=>c[0])).toEqual(['list_my_notifications','record_notification_dismissed','list_my_notifications']);
});
