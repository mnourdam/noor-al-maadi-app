import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ user: { id: 'a' } as {id:string}|null, online: true, read: vi.fn() }));
vi.mock('@/lib/account', () => ({useAccount: () => ({user: state.user})}));
vi.mock('@/hooks/useOnline', () => ({useOnline: () => state.online}));
vi.mock('@/lib/notifications/personal', () => ({unreadNotificationCount: state.read}));
vi.mock('@tanstack/react-router', () => ({Link: ({to, ...props}: any) => <a href={to} {...props}/> }));
import { PersonalInboxBell } from '@/components/notifications/PersonalInboxBell';
const deferred = () => { let resolve!: (n:number)=>void; const promise=new Promise<number>(r=>{resolve=r});return {promise,resolve}; };
beforeEach(()=>{vi.useFakeTimers();state.user={id:'a'};state.online=true;state.read.mockReset();});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('personal inbox polling',()=>{
 it('does not show the preceding account unread indicator while the next account loads',async()=>{
  state.read.mockResolvedValueOnce(2); const next=deferred();state.read.mockReturnValueOnce(next.promise);
  const view=render(<PersonalInboxBell/>);await act(async()=>{});
  expect(screen.getByRole('link').getAttribute('aria-label')).toContain('يوجد جديد');
  state.user={id:'b'};view.rerender(<PersonalInboxBell/>);
  expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('يوجد جديد');
 });
 it('coalesces focus and timer triggers while a count request is pending',async()=>{
  const first=deferred();state.read.mockReturnValue(first.promise);render(<PersonalInboxBell/>);
  act(()=>{window.dispatchEvent(new Event('focus'));vi.advanceTimersByTime(120000);});
  expect(state.read).toHaveBeenCalledTimes(1);
  await act(async()=>first.resolve(0));act(()=>window.dispatchEvent(new Event('focus')));
  expect(state.read).toHaveBeenCalledTimes(2);
 });
 it('ignores a late result after switching accounts',async()=>{
  const a=deferred(),b=deferred();state.read.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const view=render(<PersonalInboxBell/>);state.user={id:'b'};view.rerender(<PersonalInboxBell/>);
  await act(async()=>{b.resolve(0);a.resolve(5);});
  expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('يوجد جديد');
 });
 it('stops polling offline and on unmount',()=>{
  state.read.mockResolvedValue(0);state.online=false;const view=render(<PersonalInboxBell/>);
  act(()=>{window.dispatchEvent(new Event('focus'));vi.advanceTimersByTime(120000);});expect(state.read).not.toHaveBeenCalled();
  state.online=true;view.rerender(<PersonalInboxBell/>);expect(state.read).toHaveBeenCalledTimes(1);
  view.unmount();act(()=>{window.dispatchEvent(new Event('focus'));vi.advanceTimersByTime(120000);});expect(state.read).toHaveBeenCalledTimes(1);
 });
 it('retries after a failed request without erasing the last known count',async()=>{
  state.read.mockResolvedValueOnce(2).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(0);
  render(<PersonalInboxBell/>);await act(async()=>{});
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(screen.getByRole('link').getAttribute('aria-label')).toContain('يوجد جديد');
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('يوجد جديد');
 });
 it('removes the account indicator on logout and starts fresh on relogin',async()=>{
  state.read.mockResolvedValueOnce(2);const next=deferred();state.read.mockReturnValueOnce(next.promise);
  const view=render(<PersonalInboxBell/>);await act(async()=>{});
  state.user=null;view.rerender(<PersonalInboxBell/>);expect(screen.queryByRole('link')).toBeNull();
  state.user={id:'a'};view.rerender(<PersonalInboxBell/>);
  expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('يوجد جديد');
 });

 it('releases a stalled read after its deadline and ignores its late result',async()=>{
  const stalled=deferred();state.read.mockReturnValueOnce(stalled.promise).mockResolvedValueOnce(0);
  render(<PersonalInboxBell/>);
  const signal=state.read.mock.calls[0][0] as AbortSignal;
  expect(signal.aborted).toBe(false);
  await act(async()=>vi.advanceTimersByTime(15000));
  expect(signal.aborted).toBe(true);
  await act(async()=>window.dispatchEvent(new Event('focus')));
  expect(state.read).toHaveBeenCalledTimes(2);
  await act(async()=>stalled.resolve(99));
  expect(screen.getByRole('link').getAttribute('aria-label')).not.toContain('يوجد جديد');
 });

});
