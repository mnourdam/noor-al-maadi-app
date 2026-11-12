import React, { startTransition } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { useBuyHeart } from "@/hooks/useBuyHeart";
import {
  __resetIdentityForTests,
  getActiveUserId,
  setActiveOwnerInternal,
} from "@/lib/identity/owner";
import { __uninstallPartitionForTests } from "@/lib/identity/partition";
const env = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({
  androidMeasure: () => {},
  recordAndroidAction: () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: env.rpc,
    auth: {
      getSession: async () => ({
        data: { session: getActiveUserId() ? { user: { id: getActiveUserId() } } : null },
      }),
    },
  },
}));
const key = "hakaya.profile.v2";
const success = { data: { status: "purchased", hearts: 3, dinars: 80, cost: 20 }, error: null };
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div>storage-boundary</div> : this.props.children;
  }
}
function mount(withBoundary = false) {
  let api!: ReturnType<typeof useProfile>, heart!: ReturnType<typeof useBuyHeart>;
  function Probe() {
    api = useProfile();
    heart = useBuyHeart();
    return null;
  }
  const tree = (
    <ProfileProvider>
      <Probe />
    </ProfileProvider>
  );
  const view = render(withBoundary ? <Boundary>{tree}</Boundary> : tree);
  return {
    view,
    get api() {
      return api;
    },
    get heart() {
      return heart;
    },
  };
}
beforeEach(() => {
  __uninstallPartitionForTests();
  localStorage.clear();
  sessionStorage.clear();
  __resetIdentityForTests();
  setActiveOwnerInternal("user:alice");
  localStorage.setItem(
    key,
    JSON.stringify({
      name: "Alice",
      loggedIn: true,
      points: 100,
      dinars: 100,
      hearts: 2,
      heartsAt: Date.now(),
      streak: 2,
    }),
  );
  env.rpc.mockReset().mockResolvedValue(success);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __uninstallPartitionForTests();
});

function guest() {
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.loggedIn = false;
  localStorage.setItem(key, JSON.stringify(raw));
  setActiveOwnerInternal("guest:synthetic");
  return mount();
}

it('acknowledges one persisted batch and preserves cooldown/dedup/cap',async()=>{
 const h=mount();let pending!:ReturnType<typeof h.api.recoverHeartsFromActivities>;
 await act(async()=>{pending=h.api.recoverHeartsFromActivities([{kind:'investigation',id:'a'},{kind:'investigation',id:'a'},{kind:'investigation',id:'b'}]);});
 expect(await pending).toEqual({status:'written',gained:2});expect(h.api.profile.hearts).toBe(4);expect(JSON.parse(localStorage.getItem(key)!).hearts).toBe(4);
 expect(await h.api.recoverHeartsFromActivities([{kind:'investigation',id:'a'}])).toEqual({status:'unchanged',gained:0});
 await act(async()=>{pending=h.api.recoverHeartsFromActivities([{kind:'investigation',id:'c'},{kind:'investigation',id:'d'}]);});
 expect(await pending).toEqual({status:'written',gained:1});expect(h.api.profile.hearts).toBe(5);
 expect(await h.api.recoverHeartsFromActivities([{kind:'investigation',id:'e'}])).toEqual({status:'unchanged',gained:0});
 h.view.unmount();expect(mount().api.profile.hearts).toBe(5);
});
it('does not claim recovery after silent persistence failure',async()=>{
 const h=mount();const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k!==key)original.call(this,k,v);});
 let pending!:ReturnType<typeof h.api.recoverHeartsFromActivities>;
 await act(async()=>{pending=h.api.recoverHeartsFromActivities([{kind:'investigation',id:'a'}]);});
 expect(await pending).toEqual({status:'unresolved',gained:0});expect(JSON.parse(localStorage.getItem(key)!).hearts).toBe(2);
});
it('rejects retired callbacks and queued intervening writes without losing those writes',async()=>{
 const h=mount();const old=h.api.recoverHeartsFromActivities;let pending!:ReturnType<typeof old>;
 await act(async()=>{h.api.addDinars(1);pending=old([{kind:'investigation',id:'a'}]);});
 expect(await pending).toEqual({status:'unresolved',gained:0});expect(h.api.profile.dinars).toBe(101);expect(h.api.profile.hearts).toBe(2);
 await act(async()=>{setActiveOwnerInternal('user:bob');});
 expect(await old([{kind:'investigation',id:'a'}])).toEqual({status:'unresolved',gained:0});
});
it('retires an admitted transition on owner change without crediting the successor',async()=>{
 const h=mount();let pending!:ReturnType<typeof h.api.recoverHeartsFromActivities>;
 await act(async()=>{startTransition(()=>{pending=h.api.recoverHeartsFromActivities([{kind:'investigation',id:'a'}]);});setActiveOwnerInternal('user:bob');});
 expect(await pending).toEqual({status:'unresolved',gained:0});expect(JSON.parse(localStorage.getItem(key)!).hearts).toBe(2);
});
it('preserves an existing cooldown and restores only the distinct eligible key',async()=>{
 const raw=JSON.parse(localStorage.getItem(key)!);raw.activityCooldowns={'investigation:blocked':Date.now()+60_000};localStorage.setItem(key,JSON.stringify(raw));const h=mount();let pending!:ReturnType<typeof h.api.recoverHeartsFromActivities>;
 await act(async()=>{pending=h.api.recoverHeartsFromActivities([{kind:'investigation',id:'blocked'},{kind:'investigation',id:'eligible'}]);});
 expect(await pending).toEqual({status:'written',gained:1});expect(h.api.profile.activityCooldowns['investigation:blocked']).toBe(raw.activityCooldowns['investigation:blocked']);
});
