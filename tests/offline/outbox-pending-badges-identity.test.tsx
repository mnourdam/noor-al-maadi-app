import React from 'react';
import {render,act,cleanup} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const env=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:env.rpc}}));
vi.mock('@/lib/diag-trace',()=>({recordTrace:()=>{}}));
let added: ReturnType<typeof vi.spyOn>;
beforeEach(async()=>{
 added=vi.spyOn(window, "addEventListener");
 vi.resetModules();localStorage.clear();env.rpc.mockReset();
 const id=await import('@/lib/identity/owner');id.__resetIdentityForTests();id.setActiveOwnerInternal('user:alice');
});
afterEach(()=>{
 cleanup();
 for(const [name,listener] of added.mock.calls) {
  if (['irth:friends:updated','irth:notifications:updated','irth:auth:changed'].includes(name)) window.removeEventListener(name,listener);
 }
 vi.restoreAllMocks();
});
it('never displays Alice badge counts after switching owner',async()=>{
 env.rpc.mockResolvedValue({data:{friend_requests:7,notifications:2,total:9},error:null});
 const store=await import('@/lib/pending-badges');const id=await import('@/lib/identity/owner');
 function Probe(){return <span>{store.usePendingBadge('total')}</span>}
 const view=render(<Probe/>);
 await act(async()=>{await store.refreshPendingBadges()});expect(view.getByText('9')).toBeTruthy();
 act(()=>id.setActiveOwnerInternal('user:bob'));
 expect(store.getPendingBadgesSnapshot().total).toBe(0);
 expect(view.getByText('0')).toBeTruthy();
});
it('does not coalesce Bob refresh with held Alice work or publish Alice response',async()=>{
 let resolve!:(x:unknown)=>void;env.rpc.mockReturnValueOnce(new Promise(r=>{resolve=r}));
 const store=await import('@/lib/pending-badges');const id=await import('@/lib/identity/owner');
 const a=store.refreshPendingBadges();await Promise.resolve();
 id.setActiveOwnerInternal('user:bob');env.rpc.mockResolvedValue({data:{total:3},error:null});
 const b=store.refreshPendingBadges();await Promise.resolve();
 expect(env.rpc).toHaveBeenCalledTimes(2);
 await b;resolve({data:{total:9},error:null});await a;
 expect(store.getPendingBadgesSnapshot().total).toBe(3);
});
it('separates ABA flights and old cleanup cannot clear successor work',async()=>{
 let oldResolve!:(x:unknown)=>void,nextResolve!:(x:unknown)=>void;
 env.rpc.mockReturnValueOnce(new Promise(r=>{oldResolve=r})).mockReturnValueOnce(new Promise(r=>{nextResolve=r}));
 const store=await import('@/lib/pending-badges'),id=await import('@/lib/identity/owner');
 const old=store.refreshPendingBadges();id.setActiveOwnerInternal('user:bob');id.setActiveOwnerInternal('user:alice');
 const next=store.refreshPendingBadges();oldResolve({data:{total:9},error:null});
 expect((await old).total).toBe(0);
 const same=store.refreshPendingBadges();expect(env.rpc).toHaveBeenCalledTimes(2);
 nextResolve({data:{total:2},error:null});expect((await next).total).toBe(2);expect((await same).total).toBe(2);
});
it('preserves same-owner successful counts and coalesces concurrent refresh',async()=>{
 let resolve!:(x:unknown)=>void;env.rpc.mockReturnValue(new Promise(r=>{resolve=r}));
 const store=await import('@/lib/pending-badges');
 const a=store.refreshPendingBadges(),b=store.refreshPendingBadges();expect(env.rpc).toHaveBeenCalledTimes(1);
 resolve({data:{friend_requests:1,notifications:3,total:4},error:null});
 expect((await a).total).toBe(4);expect((await b).total).toBe(4);expect(store.getPendingBadgesSnapshot().total).toBe(4);
});
it('retains only the same-owner snapshot on failure and permits a fresh request',async()=>{
 const store=await import('@/lib/pending-badges'),id=await import('@/lib/identity/owner');
 env.rpc.mockResolvedValueOnce({data:{total:6},error:null});await store.refreshPendingBadges();
 env.rpc.mockImplementationOnce(()=>{throw new Error('offline')});expect((await store.refreshPendingBadges()).total).toBe(6);
 id.setActiveOwnerInternal('user:bob');env.rpc.mockRejectedValueOnce(new Error('offline'));
 expect((await store.refreshPendingBadges()).total).toBe(0);
 env.rpc.mockResolvedValueOnce({data:{total:1},error:null});expect((await store.refreshPendingBadges()).total).toBe(1);
});
it('clears authenticated counts immediately on guest transition',async()=>{
 const store=await import('@/lib/pending-badges'),id=await import('@/lib/identity/owner');
 env.rpc.mockResolvedValue({data:{total:8},error:null});await store.refreshPendingBadges();
 id.setActiveOwnerInternal('guest:fixture');expect(store.getPendingBadgesSnapshot().total).toBe(0);
});
it('notifies mounted badges even when an earlier identity listener reads the new snapshot',async()=>{
 env.rpc.mockResolvedValue({data:{total:9},error:null});
 const store=await import('@/lib/pending-badges'),id=await import('@/lib/identity/owner');
 const stop=id.onOwnerChange(()=>{store.getPendingBadgesSnapshot()});
 function Probe(){return <span>{store.usePendingBadge('total')}</span>}
 const view=render(<Probe/>);
 try {
  await act(async()=>{await store.refreshPendingBadges()});expect(view.getByText('9')).toBeTruthy();
  act(()=>id.setActiveOwnerInternal('user:bob'));
  expect(view.getByText('0')).toBeTruthy();
 } finally {stop();}
});
