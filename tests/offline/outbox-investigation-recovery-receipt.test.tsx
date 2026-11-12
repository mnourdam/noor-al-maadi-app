import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { __resetIdentityForTests, setActiveOwnerInternal } from "@/lib/identity/owner";
const state = vi.hoisted(() => ({
  uid: "u1",
  owner: null as string | null,
  resolve: null as any,
  epoch: 0,
  ownerListeners: new Set<() => void>(),
  rpc: vi.fn(),
  complete: vi.fn(),
  points: vi.fn(),
  dinars: vi.fn(),
  marker: vi.fn(),
  heart: vi.fn(),
  toast: vi.fn(),
  campaign: null as any,
  investigation: null as any,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: state.uid } } } }) },
    rpc: (...args: unknown[]) => state.rpc(...args),
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => "/settings",
  useParams: () => ({ id: "c1", chapter: "ch1" }),
  useSearch: () => ({}),
  createFileRoute: () => (options: any) => options,
  Link: ({ children }: any) => <div>{children}</div>,
  notFound: () => new Error("missing"),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: () => ({ data: state.campaign, isLoading: false }),
}));
vi.mock("@/lib/stories/progress-mirror", () => ({
  markCompleted: () => {},
  upsertProgress: () => {},
}));
vi.mock("@/lib/streak-activity", () => ({ recordStreakActivity: async () => ({ ok: false }) }));
vi.mock("@/lib/reflections", () => ({ getReflection: () => null }));
vi.mock("@/components/social/Istazadtu", () => ({ Istazadtu: () => null }));
vi.mock("@/components/stories/player/sceneLayouts", () => ({
  SceneStage: () => <div>المشهد الأخير</div>,
  resolveSceneTransition: () => "fade",
}));
vi.mock("@/components/stories/player/SegmentedProgress", () => ({ SegmentedProgress: () => null }));
vi.mock("@/components/stories/player/SceneExportButton", () => ({ SceneExportButton: () => null }));
vi.mock("@/components/stories/player/RewardMoment", () => ({
  RewardMoment: ({ xp, dinars }: any) => (
    <div data-testid="reward">
      {xp}/{dinars}
    </div>
  ),
}));

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
vi.mock("@/lib/investigations-source", () => ({
  useSupabaseInvestigation: () => ({ row: state.investigation }),
  displayDifficulty: () => "سهل",
}));
vi.mock("@/lib/investigations/progress", async (original) => ({
  recordInvestigationCompletion: state.complete,
  useCanonicalInvestigationProgress: () => ({ matches: () => false }),
  useInvestigationProgress: () => ({ uid: state.uid, completedIds: new Set<string>() }),
}));
vi.mock("@/lib/local-first-store", () => ({
  ensureLocalSnapshotLoaded: async () => {},
  localInvestigations: () => [],
}));
vi.mock("@/lib/encyclopedia-refs", () => ({ resolveRelatedRefs: () => [] }));
vi.mock("@/lib/investigations/case-number", () => ({
  useCaseNumber: () => 1,
  registerInvestigationsForNumbering: () => {},
}));
vi.mock("@/lib/investigations/recommend", () => ({
  markInvestigationOpened: () => {},
  clearInvestigationOpened: () => {},
}));
vi.mock("@/components/investigations/CaseHero", () => ({ CaseHero: () => null }));
vi.mock("@/components/investigations/CaseTimeline", () => ({
  CaseTimeline: () => null,
  phaseForStep: () => "end",
}));
vi.mock("@/components/investigations/CaseClosedCard", () => ({
  CaseClosedCard: ({heartGain}:any) => <div data-testid="case-closed">{heartGain}</div>,
}));
vi.mock("@/components/investigations/EntityRefChip", () => ({ EntityRefChip: () => null }));
vi.mock("@/components/investigations/EvidenceBoard", () => ({ EvidenceBoard: () => null }));
vi.mock("@/lib/supabaseCampaigns", () => ({
  fetchCampaignByIdOrSlug: async () => state.campaign,
  onCampaignPublished: () => () => {},
}));
vi.mock("@/lib/memory", () => ({
  ensurePlan: () => null,
  isReviewMarker: () => false,
  harvestCampaignIntoBank: () => {},
  refreshMemoryBank: async () => {},
  clearPlan: () => {},
}));
vi.mock("@/components/memory/ReviewActivity", () => ({ ReviewActivity: () => null }));
vi.mock("@/components/imported-campaign/ActivityRenderer", () => ({
  ActivityRenderer: ({ onResolve }: any) => {
    state.resolve = onResolve;
    return (
      <button
        onClick={() => {
          void onResolve(true);
        }}
      >
        إجابة صحيحة
      </button>
    );
  },
}));
vi.mock("@/components/imported-campaign/ActivityReviewCard", () => ({
  ActivityReviewCard: () => null,
}));
vi.mock("@/components/imported-campaign/RichReadingText", () => ({ RichReadingText: () => null }));
vi.mock("@/components/imported-campaign/OutOfHeartsModal", () => ({
  OutOfHeartsModal: () => null,
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

vi.mock("@/lib/tutorial/validate", () => ({ validateTutorialConfigInDev: () => {} }));
vi.mock("@/lib/tutorial/debug", () => ({ registerTutorialDebugBinding: () => () => {} }));
vi.mock("@/lib/tutorial/eligibility", () => ({
  computeEligibility: () => false,
  eligibilityWaitingReason: () => "test",
  getAllEligibilityFlags: () => ({}),
  refreshFirstLaunchChoiceFlag: () => {},
  subscribeEligibility: () => () => {},
}));
vi.mock("@/lib/boot/reconciliation", () => ({ getReconciliationState: () => "offline-local" }));
// Diagnostics and the separate best-effort sticky completion writer are not
// reward delivery authorities. Isolate their background imports from crash cuts.
vi.mock("@/lib/diag-trace", () => ({ recordTrace: () => {} }));
vi.mock("@/lib/campaigns/completions", () => ({
  recordCampaignCompletion: async () => ({ acknowledged: false, queued: true }),
}));

vi.mock('@/lib/androidFreezeDiagnostics',()=>({androidMeasure:()=>{},recordAndroidAction:()=>{}}));
let api!:ReturnType<typeof useProfile>;
function Probe(){api=useProfile();return null;}
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();__resetIdentityForTests();setActiveOwnerInternal('user:u1');
 localStorage.setItem('hakaya.profile.v2',JSON.stringify({name:'Fixture',loggedIn:true,points:100,dinars:100,hearts:2,heartsAt:Date.now(),streak:0}));
 state.investigation={id:'inv1',slug:'inv1',title:'Fixture',steps:[{type:'conclusion',text:'End'}],reward:{hearts:2}};
 state.complete.mockReset().mockResolvedValue({acknowledged:true,applied:true,heartsEarned:2,xpEarned:0,dinarsEarned:0});
 state.rpc.mockReset().mockResolvedValue({data:null,error:null});state.toast.mockClear();
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function mountRoute(){const {Route}=await import('@/routes/investigation.$id');const Component=(Route as unknown as { component: React.ComponentType }).component;return render(<ProfileProvider><Probe/><Component/></ProfileProvider>);}
it('actual route awaits a persisted batch before completion writes and displays recovered hearts',async()=>{
 await mountRoute();fireEvent.click(screen.getByText('إنهاء التحقيق'));
 await waitFor(()=>expect(screen.getByTestId('case-closed').textContent).toBe('2'));
 expect(api.profile.hearts).toBe(4);expect(api.profile.investigationsCompleted).toContain('inv1');expect(state.complete).toHaveBeenCalledOnce();
});
it('actual route finishes acknowledged completion without retry or claimed hearts when recovery persistence is unresolved',async()=>{
 await mountRoute();const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k!=='hakaya.profile.v2')original.call(this,k,v);});
 fireEvent.click(screen.getByText('إنهاء التحقيق'));
 await waitFor(()=>expect(screen.getByTestId('case-closed').textContent).toBe('0'));
 expect(state.complete).toHaveBeenCalledOnce();expect(state.toast).toHaveBeenCalledWith('تأكد إكمال التحقيق، لكن لم يتأكد حفظ القلوب محليًا.');
});
it('actual route unmount while server response pending does not start recovery or completion writes',async()=>{
 let resolve!:(x:any)=>void;state.complete.mockReturnValue(new Promise(r=>{resolve=r}));const view=await mountRoute();fireEvent.click(screen.getByText('إنهاء التحقيق'));view.unmount();const bytes=localStorage.getItem('hakaya.profile.v2');
 await act(async()=>{resolve({acknowledged:true,applied:true,heartsEarned:2});});expect(localStorage.getItem('hakaya.profile.v2')).toBe(bytes);expect(state.complete).toHaveBeenCalledOnce();
});
