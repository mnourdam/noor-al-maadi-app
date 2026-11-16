import React from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
const s=vi.hoisted(()=>({user:{id:'a'} as {id:string}|null, tab:'notifications', read:vi.fn(), reflections:vi.fn(), issues:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({createFileRoute:()=> (config:any)=>({...config,useSearch:()=>({tab:s.tab})}),Link:({to,...props}:any)=><a href={to} {...props}/>}));
vi.mock('@/lib/account',()=>({useAccount:()=>({user:s.user})}));
vi.mock('@/hooks/useOnline',()=>({useOnline:()=>true}));
vi.mock('@/components/AppShell',()=>({AppShell:({children}:any)=><div>{children}</div>,Screen:({children}:any)=><main>{children}</main>}));
vi.mock('@/lib/notifications/personal',()=>({listMyNotifications:s.read,markNotificationRead:vi.fn(),markAllNotificationsRead:vi.fn()}));
vi.mock('@/lib/notifications/personalPresentation',()=>({renderNotification:(r:any)=>({title:r.id,body:'',href:'/',emoji:''}),formatRelativeAr:()=>''}));
vi.mock('@/lib/reflections/archive',()=>({listMyReflections:s.reflections,anchorLabelAr:()=>'',anchorHref:()=>'/'}));
vi.mock('@/lib/feedback/api',()=>({listMyIssues:s.issues}));
import {Route} from '@/routes/inbox';
const Page=(Route as any).component;
const deferred=()=>{let resolve!:(v:any)=>void;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
beforeEach(()=>{s.user={id:'a'};s.tab='notifications';vi.clearAllMocks();});
afterEach(cleanup);
it.each(['notifications','reflections','contributions'])('clears private %s immediately when account changes',async(tab)=>{
 s.tab=tab;const pending=deferred();const fn=tab==='notifications'?s.read:tab==='reflections'?s.reflections:s.issues;
 const row={id:'old-account-content',body:'old-account-content',title:'old-account-content',source:'comment',status:'open',read_at:null};
 fn.mockResolvedValueOnce(tab==='notifications'?{ok:true,items:[row]}:tab==='reflections'?{ok:true,items:[row],total:1}:[row]).mockReturnValueOnce(pending.promise);
 const v=render(<Page/>);await act(async()=>{});expect(screen.getAllByText('old-account-content').length).toBeGreaterThan(0);
 s.user={id:'b'};v.rerender(<Page/>);expect(screen.queryByText('old-account-content')).toBeNull();expect(fn).toHaveBeenCalledTimes(2);
});
it('does not reload inbox when same account object is refreshed',async()=>{
 s.read.mockResolvedValue({ok:true,items:[]});const v=render(<Page/>);await act(async()=>{});s.user={id:'a'};v.rerender(<Page/>);await act(async()=>{});expect(s.read).toHaveBeenCalledTimes(1);
});
it('does not let a late old-account notification result overwrite the new account',async()=>{
 const old=deferred();s.read.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ok:true,items:[{id:'current-account',read_at:null}]});
 const v=render(<Page/>);s.user={id:'b'};v.rerender(<Page/>);await act(async()=>{});
 await act(async()=>old.resolve({ok:true,items:[{id:'old-account',read_at:null}]}));
 expect(screen.queryByText('old-account')).toBeNull();expect(screen.getByText('current-account')).toBeTruthy();
});
it('clears private data on logout and reloads on sign in',async()=>{
 s.read.mockResolvedValue({ok:true,items:[{id:'account-content',read_at:null}]});const v=render(<Page/>);await act(async()=>{});
 s.user=null;v.rerender(<Page/>);expect(screen.queryByText('account-content')).toBeNull();
 s.user={id:'a'};v.rerender(<Page/>);await act(async()=>{});expect(s.read).toHaveBeenCalledTimes(2);
});
