// Synthetic SDK; actual notification bridge, identity owner and storage partition.
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const sdk=vi.hoisted(()=>({auth:{getSession:vi.fn()},rpc:vi.fn()}));
vi.mock('../../src/integrations/supabase/client.ts',()=>({supabase:sdk}));
let api:any, identity:any, partition:any;
function deferred(){let resolve:any;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
const cache='irth.notifications.serverCache.v1';
const rows=(id:string)=>[{id,read_at:null,dismissed_at:null}];
beforeEach(async()=>{
 partition?.__uninstallPartitionForTests();localStorage.clear();vi.resetModules();vi.clearAllMocks();
 identity=await import('../../src/lib/identity/owner');
 partition=await import('../../src/lib/identity/partition');partition.installIdentityPartition();
 identity.setActiveOwnerInternal('user:alice');
 sdk.auth.getSession.mockResolvedValue({data:{session:{user:{id:'alice'}}}});
 sdk.rpc.mockResolvedValue({data:rows('current'),error:null});
 api=await import('../../src/lib/notifications/server');
});
afterEach(()=>{vi.useRealTimers();partition.__uninstallPartitionForTests();});
it('coalesces equal limits but preserves three exact requested windows',async()=>{
 const calls=[api.fetchMyNotifications(150),api.fetchMyUnreadCount(),api.fetchMyUnreadCount(),api.fetchMyNotifications(20)];
 await Promise.all(calls);
 expect(sdk.rpc.mock.calls.map((c:any)=>c[1].p_limit).sort((a:number,b:number)=>a-b)).toEqual([20,150,200]);
});
it.each([false,true])('retires RPC continuation across owner change, ABA=%s',async(aba:boolean)=>{
 const d=deferred();sdk.rpc.mockReturnValue(d.promise);const task=api.fetchMyNotifications(20);
 await vi.waitFor(()=>expect(sdk.rpc).toHaveBeenCalledOnce());
 identity.setActiveOwnerInternal('user:bob');if(aba)identity.setActiveOwnerInternal('user:alice');
 localStorage.setItem(cache,JSON.stringify(rows('successor')));d.resolve({data:rows('retired'),error:null});
 expect(await task).toEqual([]);expect(JSON.parse(localStorage.getItem(cache)!)).toEqual(rows('successor'));
});
it('retired auth cannot issue RPC',async()=>{
 const d=deferred();sdk.auth.getSession.mockReturnValue(d.promise);const task=api.fetchMyNotifications();
 identity.setActiveOwnerInternal('user:bob');d.resolve({data:{session:{user:{id:'alice'}}}});
 expect(await task).toEqual([]);expect(sdk.rpc).not.toHaveBeenCalled();
});
it('stable mismatched session cannot issue RPC or expose cache',async()=>{
 localStorage.setItem(cache,JSON.stringify(rows('cached')));
 sdk.auth.getSession.mockResolvedValue({data:{session:{user:{id:'bob'}}}});
 expect(await api.fetchMyNotifications()).toEqual([]);expect(sdk.rpc).not.toHaveBeenCalled();
});
it('guest no-session preserves its offline cache without RPC',async()=>{
 identity.setActiveOwnerInternal('guest:synthetic');localStorage.setItem(cache,JSON.stringify(rows('guest')));
 sdk.auth.getSession.mockResolvedValue({data:{session:null}});
 expect(await api.fetchMyNotifications()).toEqual(rows('guest'));expect(sdk.rpc).not.toHaveBeenCalled();
});
it('failed current RPC retains current owner cache',async()=>{
 localStorage.setItem(cache,JSON.stringify(rows('offline')));sdk.rpc.mockRejectedValue(new Error('synthetic offline'));
 expect(await api.fetchMyNotifications()).toEqual(rows('offline'));
});
it('mutation entry and completion retire both preexisting and during-mutation reads',async()=>{
 const first=deferred(),during=deferred(),mutation=deferred();let lists=0;
 sdk.rpc.mockImplementation((name:string)=> name==='list_my_notifications'?(++lists===1?first.promise:lists===2?during.promise:Promise.resolve({data:rows('new'),error:null})):mutation.promise);
 const old=api.fetchMyNotifications(20);await vi.waitFor(()=>expect(lists).toBe(1));
 const change=api.markNotificationRead('target');
 const mid=api.fetchMyNotifications(20);await vi.waitFor(()=>expect(lists).toBe(2));
 mutation.resolve({data:null,error:null});await change;
 const fresh=await api.fetchMyNotifications(20);expect(fresh).toEqual(rows('new'));
 first.resolve({data:rows('old'),error:null});during.resolve({data:rows('during'),error:null});
 expect(await old).toEqual([]);expect(await mid).toEqual([]);expect(JSON.parse(localStorage.getItem(cache)!)).toEqual(rows('new'));
});

it('hung RPC releases flight at bounded wait; fresh retry wins despite late original response',async()=>{
 vi.useFakeTimers();localStorage.setItem(cache,JSON.stringify(rows('offline')));
 const d=deferred();sdk.rpc.mockReturnValueOnce(d.promise).mockResolvedValue({data:rows('fresh'),error:null});
 const old=api.fetchMyNotifications(20);await vi.advanceTimersByTimeAsync(0);expect(sdk.rpc).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(api.NOTIFICATION_LIST_WAIT_MS);
 expect(await old).toEqual(rows('offline'));expect(sdk.rpc).toHaveBeenCalledOnce();
 const retry=api.fetchMyNotifications(20);expect(await retry).toEqual(rows('fresh'));expect(sdk.rpc).toHaveBeenCalledTimes(2);
 d.resolve({data:rows('late'),error:null});await vi.advanceTimersByTimeAsync(0);
 expect(JSON.parse(localStorage.getItem(cache)!)).toEqual(rows('fresh'));
});
it('hung auth also releases without a late RPC',async()=>{
 vi.useFakeTimers();const d=deferred();sdk.auth.getSession.mockReturnValueOnce(d.promise);
 const old=api.fetchMyNotifications();await vi.advanceTimersByTimeAsync(api.NOTIFICATION_LIST_WAIT_MS);
 expect(await old).toEqual([]);d.resolve({data:{session:{user:{id:'alice'}}}});await vi.advanceTimersByTimeAsync(0);
 expect(sdk.rpc).not.toHaveBeenCalled();expect(await api.fetchMyNotifications()).toEqual(rows('current'));
});
it('authenticated unavailable auth retains same owner offline cache',async()=>{
 localStorage.setItem(cache,JSON.stringify(rows('offline')));sdk.auth.getSession.mockResolvedValue({data:{session:null}});
 expect(await api.fetchMyNotifications()).toEqual(rows('offline'));expect(sdk.rpc).not.toHaveBeenCalled();
});
it.each(['markNotificationRead','markAllNotificationsRead','deleteMyNotification','clearMyNotifications'])('retired %s cannot change successor cache',async(method:string)=>{
 const d=deferred();sdk.rpc.mockReturnValue(d.promise);const pending=api[method]('synthetic-target');
 identity.setActiveOwnerInternal('user:bob');localStorage.setItem(cache,JSON.stringify(rows('bob')));
 d.resolve({data:null,error:null});await pending;expect(JSON.parse(localStorage.getItem(cache)!)).toEqual(rows('bob'));
});
it('late old flight cleanup cannot remove a pending successor generation flight',async()=>{
 const old=deferred(),next=deferred();let lists=0;
 sdk.rpc.mockImplementation((name:string)=>name==='list_my_notifications'?(++lists===1?old.promise:next.promise):Promise.resolve({error:null}));
 const first=api.fetchMyNotifications(20);await vi.waitFor(()=>expect(lists).toBe(1));
 await api.recordDismissed('synthetic');const second=api.fetchMyNotifications(20);await vi.waitFor(()=>expect(lists).toBe(2));
 old.resolve({data:rows('old'),error:null});expect(await first).toEqual([]);
 const third=api.fetchMyNotifications(20);expect(third).toBe(second);expect(lists).toBe(2);
 next.resolve({data:rows('new'),error:null});expect(await second).toEqual(rows('new'));
});
