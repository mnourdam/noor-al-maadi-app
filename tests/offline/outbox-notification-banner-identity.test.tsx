import React from 'react';
import {render,act,cleanup,fireEvent} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const spies=vi.hoisted(()=>({read:vi.fn(),dismiss:vi.fn(),navigate:vi.fn(),list:vi.fn(),callbacks:[] as Array<()=>Promise<void>>,action:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({useRouter:()=>({navigate:spies.navigate})}));
vi.mock('@/lib/notifications/server',()=>({markNotificationRead:spies.read,recordDismissed:spies.dismiss,subscribeToMyNotifications:(fn:()=>Promise<void>)=>{spies.callbacks.push(fn);return ()=>{}},fetchMyNotifications:spies.list}));
vi.mock('@/lib/notifications/action',()=>({resolveNotificationAction:spies.action,openExternalUrl:vi.fn()}));
import {InAppBanner} from '@/components/notifications/InAppBanner';
import {setActiveOwnerInternal,__resetIdentityForTests} from '@/lib/identity/owner';
function arrive(id='synthetic-a'){act(()=>window.dispatchEvent(new CustomEvent('irth:notifications:banner',{detail:{id,title:id,body:'Synthetic body'}})))}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {promise,resolve};}
beforeEach(()=>{vi.useFakeTimers();__resetIdentityForTests();setActiveOwnerInternal('user:alice');spies.callbacks=[];spies.read.mockResolvedValue(undefined);spies.dismiss.mockResolvedValue(undefined);spies.navigate.mockResolvedValue(undefined);spies.list.mockResolvedValue([]);spies.action.mockReturnValue({kind:'internal',path:'/synthetic'});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks()});
it.each([false,true])('retires visible and queued content, ABA=%s',(aba)=>{
 const view=render(<InAppBanner/>);arrive();arrive('synthetic-queued');
 act(()=>{setActiveOwnerInternal('user:bob');if(aba)setActiveOwnerInternal('user:alice')});
 expect(view.queryByText('synthetic-a')).toBeNull();expect(view.queryByText('synthetic-queued')).toBeNull();
 act(()=>vi.advanceTimersByTime(6000));expect(view.queryByText('synthetic-queued')).toBeNull();
 arrive();expect(view.queryByText('synthetic-a')).not.toBeNull();
});
it('delayed dismissal cannot issue a retired notification ID',async()=>{
 const view=render(<InAppBanner/>);arrive();fireEvent.click(view.getByLabelText('إخفاء'));
 act(()=>setActiveOwnerInternal('user:bob'));await act(async()=>vi.advanceTimersByTimeAsync(250));
 expect(spies.dismiss).not.toHaveBeenCalled();
});
it('delayed navigation is canceled on retirement, without pretending to undo prior read',async()=>{
 const view=render(<InAppBanner/>);arrive();fireEvent.click(view.getByLabelText('synthetic-a'));expect(spies.read).toHaveBeenCalledOnce();
 act(()=>setActiveOwnerInternal('user:bob'));await act(async()=>vi.advanceTimersByTimeAsync(250));expect(spies.navigate).not.toHaveBeenCalled();
});
it.each([false,true])('late realtime lookup cannot enqueue retired rows, ABA=%s',async(aba)=>{
 const d=deferred();spies.list.mockReturnValue(d.promise);const view=render(<InAppBanner/>);const old=spies.callbacks[0];let task!:Promise<void>;
 act(()=>{task=old()});act(()=>{setActiveOwnerInternal('user:bob');if(aba)setActiveOwnerInternal('user:alice')});
 await act(async()=>{d.resolve([{id:'late',title:'late',created_at:'2099-01-01',read_at:null,dismissed_at:null}]);await task});
 expect(view.queryByText('late')).toBeNull();await old();expect(spies.list).toHaveBeenCalledOnce();
});
it('healthy same owner dismisses once and advances queued banner',async()=>{
 const view=render(<React.StrictMode><InAppBanner/></React.StrictMode>);arrive();arrive('second');fireEvent.click(view.getByLabelText('إخفاء'));
 await act(async()=>vi.advanceTimersByTimeAsync(250));expect(spies.dismiss).toHaveBeenCalledExactlyOnceWith('synthetic-a');expect(view.queryByText('second')).not.toBeNull();
});
it('same-owner tap preserves navigation and dedup behavior',async()=>{
 const view=render(<InAppBanner/>);arrive();arrive();fireEvent.click(view.getByLabelText('synthetic-a'));
 await act(async()=>vi.advanceTimersByTimeAsync(200));expect(spies.navigate).toHaveBeenCalledExactlyOnceWith({to:'/synthetic',hash:undefined});expect(view.queryByText('synthetic-a')).toBeNull();
});
it('unmount clears pending delayed effects',async()=>{
 const view=render(<InAppBanner/>);arrive();fireEvent.click(view.getByLabelText('إخفاء'));view.unmount();await act(async()=>vi.advanceTimersByTimeAsync(6000));expect(spies.dismiss).not.toHaveBeenCalled();
});
it('StrictMode retired subscription cannot issue a new lookup',async()=>{
 render(<React.StrictMode><InAppBanner/></React.StrictMode>);expect(spies.callbacks.length).toBe(2);
 await spies.callbacks[0]();expect(spies.list).not.toHaveBeenCalled();await spies.callbacks[1]();expect(spies.list).toHaveBeenCalledOnce();
});
