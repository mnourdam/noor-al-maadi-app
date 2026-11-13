import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
const state = vi.hoisted(() => ({
  uid: "u1",
  search: {} as Record<string, string>,
  chapterId: "ch1",
  navigate: vi.fn(),
  plan: vi.fn(() => null),
  harvest: vi.fn(),
  refresh: vi.fn(async () => {}),
  resolve: null as any,
  rpc: vi.fn(),
  toast: vi.fn(),
  campaign: null as any,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.uid } } } }) },
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  useRouterState: () => "/settings",
  useParams: () => ({ id: "c1", chapter: state.chapterId }),
  useSearch: () => state.search,
  createFileRoute: () => (options: any) => options,
  Link: ({ children, to, params, search }: any) => {
    let href = to;
    for (const [key, value] of Object.entries(params ?? {})) href = href.replace('$' + key, value);
    if (search?.review) href += '?review=' + search.review;
    return <a href={href}>{children}</a>;
  },
  notFound: () => new Error("missing"),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: () => ({ data: state.campaign, isLoading: false }),
}));
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: async () => ({ ok: true }) }));
vi.mock("sonner", () => ({ toast: { error: state.toast } }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/ReadingScale", () => ({
  ReadingScale: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/feedback/FeedbackCTA", () => ({ FeedbackCTA: () => null }));
vi.mock("@/lib/navigation", () => ({
  useStashCurrentAsOrigin: () => vi.fn(),
  useOverlayDismiss: () => {},
  useOverlayEntries: () => [],
}));
vi.mock("@/lib/audioManager", () => ({ audioManager: { playSfx: () => {} } }));
vi.mock("@/lib/supabaseCampaigns", () => ({
  fetchCampaignByIdOrSlug: async () => state.campaign,
  fetchPublishedFeed: async () => ({}),
  onCampaignPublished: () => () => {},
}));
vi.mock("@/lib/memory", () => ({
  ensurePlan: state.plan,
  isReviewMarker: () => false,
  harvestCampaignIntoBank: state.harvest,
  refreshMemoryBank: state.refresh,
  clearPlan: () => {},
}));
vi.mock("@/components/memory/ReviewActivity", () => ({ ReviewActivity: () => null }));
vi.mock("@/components/imported-campaign/ActivityRenderer", () => ({
  ActivityRenderer: ({ activity, onResolve }: any) => {
    const [answer, setAnswer] = React.useState("");
    state.resolve = onResolve;
    return <div><p>{activity.prompt}</p><label>إجابتي<input value={answer} onChange={e => setAnswer(e.target.value)} /></label><button onClick={() => onResolve(true)}>إجابة صحيحة</button></div>;
  },
}));

vi.mock("@/lib/navigation/engine", () => ({ useOverlayDismiss: () => {} }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: ({ open }: any) => open ? <div data-testid="hearts-modal" /> : null,
}));
vi.mock("@/components/imported-campaign/CampaignCompleteModal", () => ({
  CampaignCompleteModal: ({ open }: any) =>
    open ? <div data-testid="campaign-complete">أتممت الحملة</div> : null,
}));
vi.mock("@/components/imported-campaign/UnlockList", () => ({ UnlockList: () => null }));
vi.mock("@/components/CachedImage", () => ({ CachedImage: () => null }));
vi.mock("@/components/motion/MotionPrimitives", () => ({
  Stagger: ({ children }: any) => <div>{children}</div>,
  AnimatedNumber: ({ value }: any) => <span>{value}</span>,
}));

vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/campaigns/completions", () => ({
  recordCampaignCompletion: async () => ({ acknowledged: false, queued: true }),
}));
vi.mock("@/lib/progressSync", () => ({ upsertChapterProgress: (...args: unknown[]) => state.rpc(...args) }));
import { ProfileProvider, useProfile } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
import { installIdentityPartition, __uninstallPartitionForTests } from "@/lib/identity/partition";
import { getCampaignProgress } from "@/lib/importedCampaignProgress";
import { hasClaimed, activityKey } from "@/lib/campaignLedger";
import { getChapterGrantedTotals } from "@/lib/campaignRewardsGranted";
let api: ReturnType<typeof useProfile>;
function Probe() { api = useProfile(); return <output data-testid="balance">{api.profile.points}/{api.profile.dinars}</output>; }
function seed(points: number, dinars: number) {
  localStorage.setItem("hakaya.profile.v2", JSON.stringify({name:"Synthetic", loggedIn:true, points, dinars, hearts:5, heartsAt:Date.now(), streak:2}));
}
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r}); return {promise,resolve}; }
beforeEach(() => {
  __uninstallPartitionForTests(); localStorage.clear(); sessionStorage.clear(); __resetIdentityForTests();
  setActiveOwnerInternal("user:u1"); installIdentityPartition(); seed(100,50);
  state.uid="u1"; state.search={}; state.chapterId="ch1"; state.resolve=null;
  state.rpc.mockReset(); state.toast.mockClear();
  state.campaign={id:"c1",title:"حملة",chapters:[{id:"ch1",title:"فصل",activities:[
    {id:"a1",type:"reading",xpReward:5,coinsReward:2},
    {id:"a2",type:"reading",xpReward:5,coinsReward:2}
  ]}]};
  vi.stubGlobal("indexedDB",new IDBFactory());
  vi.stubGlobal("fetch", vi.fn(()=>{throw new Error("network forbidden")}));
});
afterEach(async () => { cleanup(); await new Promise(r=>setTimeout(r,0)); __uninstallPartitionForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
for (const aba of [false,true]) it("real provider isolates accepted retired save and fresh reward across "+(aba?"ABA":"A to B"),async()=>{
  const {Route}=await import("@/routes/campaigns.imported.$id.chapter.$chapter");
  const Component=(Route as any).component;
  render(<ProfileProvider><Probe/><Component/></ProfileProvider>);
  await waitFor(()=>expect(screen.getByTestId("balance").textContent).toBe("100/50"));
  const old=deferred<any>();
  state.rpc.mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByText("إجابة صحيحة"));
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledTimes(1));
  await act(async()=>{
    state.uid="u2"; setActiveOwnerInternal("user:u2"); seed(200,80);
    window.dispatchEvent(new CustomEvent("irth:identity-changed"));
  });
  await waitFor(()=>expect(screen.getByTestId("balance").textContent).toBe("200/80"));
  if(aba) {
    await act(async()=>{
      state.uid="u1"; setActiveOwnerInternal("user:u1");
      window.dispatchEvent(new CustomEvent("irth:identity-changed"));
    });
    await waitFor(()=>expect(screen.getByTestId("balance").textContent).toBe("100/50"));
  }
  const before=localStorage.getItem("hakaya.profile.v2");
  await act(async()=>old.resolve({acknowledged:true,queued:false}));
  expect(localStorage.getItem("hakaya.profile.v2")).toBe(before);
  expect(getCampaignProgress("c1")?.chapters.ch1?.completedActivityIds??[]).toEqual([]);
  expect(hasClaimed(activityKey("c1","ch1","a1"))).toBe(false);
  expect(screen.queryByText("التالي")).toBeNull();
  state.rpc.mockResolvedValue({acknowledged:true,queued:false});
  fireEvent.click(screen.getByText("إجابة صحيحة"));
  await waitFor(()=>expect(screen.getByTestId("balance").textContent).toBe(aba?"105/52":"205/82"));
  expect(state.rpc).toHaveBeenCalledTimes(2);
  expect(getCampaignProgress("c1")?.chapters.ch1.completedActivityIds).toEqual(["a1"]);
  expect(hasClaimed(activityKey("c1","ch1","a1"))).toBe(true);
  expect(getChapterGrantedTotals("c1","ch1")).toMatchObject({xp:5,coins:2});
  expect(screen.getByText("التالي")).toBeTruthy();
  expect(state.toast).not.toHaveBeenCalled();
  const other=aba?"user:u2":"user:u1";
  const physical=JSON.parse(localStorage.getItem("hakaya.profile.v2::owner="+other)!);
  expect([physical.points,physical.dinars]).toEqual(aba?[200,80]:[100,50]);
  const otherLedger=JSON.parse(localStorage.getItem("irth_campaign_ledger_v1::owner="+other)??"{}");
  expect(otherLedger.keys??{}).toEqual({});
  expect(localStorage.getItem("irth_campaign_progress::owner="+other)).toBeNull();
  expect(localStorage.getItem("irth_campaign_grants_v2::owner="+other)).toBeNull();
  // Persistence runs in the writer's passive effect, after the rendered balance.
  await waitFor(() => {
    const persisted=JSON.parse(localStorage.getItem("hakaya.profile.v2")!);
    expect([persisted.points,persisted.dinars]).toEqual(aba?[105,52]:[205,82]);
    expect(api.getPersistence()).toMatchObject({owner:aba?"user:u1":"user:u2", outcome:"written"});
  });
});
