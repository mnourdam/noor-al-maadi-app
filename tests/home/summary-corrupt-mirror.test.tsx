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


import { mirrorKey } from "@/lib/stories/progress-mirror";
it("retains verified server counts with corrupted sibling records in real localStorage mirror",async()=>{
 localStorage.setItem(mirrorKey("A"),JSON.stringify({v:1,uid:"A",entries:{
  good:{completed:true}, nullRow:null, stringRow:"bad", arrayRow:[true],
  truthyNumber:{completed:1},truthyString:{completed:"true"}, incomplete:{completed:false},
 }}));
 const view=renderHook(useHomeSummary,{wrapper});
 await waitFor(()=>expect(view.result.current.loading).toBe(false));
 expect(view.result.current.error).toBeNull();expect(view.result.current.storiesCompleted).toBe(2);
 localStorage.removeItem(mirrorKey("A"));
});
it.each([[], [null,{completed:true}], "bad", null])("ignores malformed mirror entry containers %j",async entries=>{
 localStorage.setItem(mirrorKey("A"),JSON.stringify({v:1,uid:"A",entries}));
 const view=renderHook(useHomeSummary,{wrapper});await waitFor(()=>expect(view.result.current.loading).toBe(false));
 expect(view.result.current.error).toBeNull();expect(view.result.current.storiesCompleted).toBe(1);
 localStorage.removeItem(mirrorKey("A"));
});
