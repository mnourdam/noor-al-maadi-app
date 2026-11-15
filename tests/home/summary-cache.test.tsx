import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  owner: "user:A", epoch: 0, uid: "A" as string | null, pending: false, ready: true,
  listeners: new Set<() => void>(), local: new Set<string>(), mirror: {} as Record<string, {completed: boolean}>,
  read: vi.fn(), guest: vi.fn(),
}));
vi.mock("@/lib/account", () => ({useAccount: () => ({user: state.uid ? {id:state.uid} : null, loadingSession:state.pending})}));
vi.mock("@/lib/profile", () => ({useProfile: () => ({profile: {dinars:17}})}));
vi.mock("@/lib/real-collection-stats", () => ({useRealCollectionStats: () => ({totalCollection:3})}));
vi.mock("@/lib/investigations/progress", () => ({useCanonicalInvestigationProgress: () => ({count:2})}));
vi.mock("@/lib/campaigns/completions", () => ({localCompletedIds: () => state.local}));
vi.mock("@/lib/stories/guestCompletions", () => ({guestCompletionsSnapshot: () => state.guest()}));
vi.mock("@/lib/stories/progress-mirror", () => ({readMirror: () => ({entries: state.mirror})}));
vi.mock("@/lib/identity/owner", () => ({getActiveOwner: () => state.owner, getIdentityEpoch: () => state.epoch, onOwnerChange: (f:()=>void) => {state.listeners.add(f); return () => state.listeners.delete(f);}}));
vi.mock("@/lib/boot/reconciliation", () => ({isReconciliationTerminal: () => state.ready, subscribeReconciliation: (f:()=>void) => {state.listeners.add(f); return () => state.listeners.delete(f);}}));
vi.mock("@/lib/stats/home-completion-read", () => ({readHomeCompletionIds: (...args:unknown[]) => state.read(...args)}));
import { useHomeSummary } from "@/lib/stats/homeSummary";
let client: QueryClient;
const wrapper = ({children}: {children: React.ReactNode}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
function deferred<T>() {let resolve!: (v:T)=>void; const promise = new Promise<T>(r=>resolve=r); return {promise,resolve};}
async function switchTo(uid: string | null) {
  await act(async () => {state.uid=uid; state.owner=uid ? `user:${uid}` : "guest:device"; state.epoch++; state.local=new Set(); state.mirror={}; state.listeners.forEach(f=>f());});
}
beforeEach(() => {
  state.owner="user:A"; state.uid="A"; state.epoch=0; state.pending=false; state.ready=true; state.listeners.clear(); state.local=new Set(); state.mirror={};
  state.read.mockReset().mockImplementation(async(kind:string)=>kind==="campaigns"?["c1"]:["s1"]);
  state.guest.mockReset().mockReturnValue(new Set(["guest-story"]));
  client = new QueryClient({defaultOptions: {queries:{retry:false,refetchOnWindowFocus:false,refetchOnMount:false,gcTime:Infinity}}});
});
afterEach(()=>{cleanup();client.clear();vi.restoreAllMocks();});

describe("identity-scoped Home summary display cache",()=>{
  it("reuses verified values immediately on return while slow background requests run",async()=>{
    const first=renderHook(useHomeSummary,{wrapper});
    await waitFor(()=>expect(first.result.current.loading).toBe(false));
    expect(state.read).toHaveBeenCalledTimes(2);
    first.unmount();
    const pending=deferred<string[]>(); state.read.mockImplementation(()=>pending.promise);
    const next=renderHook(useHomeSummary,{wrapper});
    expect(next.result.current.loading).toBe(false);
    expect(next.result.current.campaignsCompleted).toBe(1);
    expect(next.result.current.storiesCompleted).toBe(1);
    await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(4));
    await act(async()=>pending.resolve(["new1","new2"]));
    await waitFor(()=>expect(next.result.current.storiesCompleted).toBe(2));
  });
  it("deduplicates concurrent consumers",async()=>{
    const pending=deferred<string[]>(); state.read.mockImplementation(()=>pending.promise);
    const a=renderHook(useHomeSummary,{wrapper}); const b=renderHook(useHomeSummary,{wrapper});
    expect(state.read).toHaveBeenCalledTimes(2);
    await act(async()=>pending.resolve([]));
    await waitFor(()=>expect(a.result.current.loading || b.result.current.loading).toBe(false));
    expect(a.result.current.storiesCompleted).toBe(0);
  });
  it("does not convert a failed first read into a verified zero",async()=>{
    state.read.mockRejectedValue(new Error("offline"));
    const view=renderHook(useHomeSummary,{wrapper});
    await waitFor(()=>expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.loading).toBe(true);
    expect(client.getQueryData(["home-completions","user:A",0,"stories"])).toBeUndefined();
  });
  it("retains verified counts on background failure, separate from a genuine zero",async()=>{
    const a=renderHook(useHomeSummary,{wrapper});
    await waitFor(()=>expect(a.result.current.loading).toBe(false)); a.unmount();
    state.read.mockRejectedValue(new Error("offline"));
    const b=renderHook(useHomeSummary,{wrapper});
    await waitFor(()=>expect(b.result.current.error).not.toBeNull());
    expect(b.result.current.loading).toBe(false);expect(b.result.current.storiesCompleted).toBe(1);
  });
  it.each([["B"], ["B","A"], [null]])("fences late responses across identity changes %j",async(...sequence)=>{
    const old=deferred<string[]>();
    state.read.mockImplementation((kind:string, uid:string, _owner:string, epoch:number) =>
      epoch === 0 ? old.promise : Promise.resolve([`${uid}-${epoch}-${kind}`]));
    const view=renderHook(useHomeSummary,{wrapper});
    for(const uid of sequence) {
      await switchTo(uid);
      await waitFor(()=>expect(view.result.current.loading).toBe(false));
      expect(view.result.current.storiesCompleted).toBe(1);
      if(uid) expect(client.getQueryData(["home-completions",state.owner,state.epoch,"stories"])).toEqual([`${uid}-${state.epoch}-stories`]);
    }
    await act(async()=>old.resolve(["old1","old2","old3"]));
    expect(view.result.current.storiesCompleted).toBe(1);
    expect(client.getQueryData(["home-completions","user:A",0,"stories"])).toBeUndefined();
    if(!state.uid) expect(state.guest).toHaveBeenCalled();
    else expect(client.getQueryData(["home-completions",state.owner,state.epoch,"stories"])).toEqual([`${state.uid}-${state.epoch}-stories`]);
  });

  it("never flashes cached A counts for B or a new A epoch",async()=>{
    const view=renderHook(useHomeSummary,{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false));
    state.read.mockImplementation(()=>new Promise(()=>{}));
    await switchTo("B");expect(view.result.current.loading).toBe(true);expect(view.result.current.storiesCompleted).toBe(0);
    await switchTo("A");expect(view.result.current.loading).toBe(true);expect(view.result.current.storiesCompleted).toBe(0);
  });
  it("holds all personal display data while auth or reconciliation is unresolved",()=>{
    state.pending=true;const view=renderHook(useHomeSummary,{wrapper});expect(state.read).not.toHaveBeenCalled();expect(view.result.current.loading).toBe(true);
    state.pending=false;state.ready=false;view.rerender();expect(state.read).not.toHaveBeenCalled();expect(view.result.current.loading).toBe(true);
    state.ready=true;state.uid="B";view.rerender();expect(state.read).not.toHaveBeenCalled();
  });
  it("shows accepted local completions immediately and rejects a pre-completion response",async()=>{
    const view=renderHook(useHomeSummary,{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false));
    const old=deferred<string[]>();state.read.mockImplementation(()=>old.promise);
    await act(async()=>{void client.invalidateQueries({queryKey:["home-completions"]});});
    const current=deferred<string[]>();state.read.mockImplementation(()=>current.promise);
    await act(async()=>{state.local.add("c2");state.mirror={s2:{completed:true}};window.dispatchEvent(new Event("irth:story-completions:changed"));});
    expect(view.result.current.campaignsCompleted).toBe(2);expect(view.result.current.storiesCompleted).toBe(2);
    await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(6));
    await act(async()=>old.resolve(["wrong1","wrong2","wrong3"]));
    expect(view.result.current.storiesCompleted).toBe(2);
    await act(async()=>current.resolve(["s1","s2"]));
    await waitFor(()=>expect(view.result.current.storiesCompleted).toBe(2));
  });
  it("coalesces a burst of completion events across simultaneous consumers",async()=>{
    const a=renderHook(useHomeSummary,{wrapper});const b=renderHook(useHomeSummary,{wrapper});
    await waitFor(()=>expect(a.result.current.loading || b.result.current.loading).toBe(false));
    const calls=state.read.mock.calls.length;
    await act(async()=>{for(let i=0;i<5;i++)window.dispatchEvent(new Event("irth:outbox:flushed"));});
    await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(calls+2));
  });
  it("overlays completions made while Home was unmounted before revalidation finishes",async()=>{
    const a=renderHook(useHomeSummary,{wrapper});await waitFor(()=>expect(a.result.current.loading).toBe(false));a.unmount();
    state.local.add("c2");state.mirror={s2:{completed:true}};state.read.mockImplementation(()=>new Promise(()=>{}));
    const b=renderHook(useHomeSummary,{wrapper});expect(b.result.current.loading).toBe(false);expect(b.result.current.campaignsCompleted).toBe(2);expect(b.result.current.storiesCompleted).toBe(2);
  });
});
