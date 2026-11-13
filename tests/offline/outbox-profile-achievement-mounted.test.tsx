import React from "react";
import { render, cleanup, act, waitFor, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({
  uid: "",
  query: vi.fn(),
  claim: vi.fn(),
  repair: vi.fn(),
  write: vi.fn(),
  nav: vi.fn(),
  search: { tab: "achievements", achievement: undefined } as { tab: string; achievement?: string },
  persisted: new Map<string, any>(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: any) => ({
    options,
    useSearch: () => s.search,
    useNavigate: () => s.nav,
  }),
  useNavigate: () => s.nav,
  Link: ({ children, ...props }: any) => <a>{children}</a>,
}));
vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    hydrated: true,
    userId: s.uid,
    profile: {
      points: 0,
      dinars: 0,
      streak: 0,
      longestStreak: 0,
      titlesEarned: [],
      campaignsCompleted: [],
      loggedIn: true,
      hearts: 5,
      settings: {},
      name: "Synthetic player",
    },
    updateSettings: s.write,
  }),
}));
vi.mock("@/lib/account", () => ({
  useAccount: () => ({ user: { id: s.uid }, account: {}, displayName: "Synthetic player" }),
}));
vi.mock("@/lib/emblems/useEmblemUnlockContext", () => ({ useEmblemUnlockContext: () => ({}) }));
vi.mock("@/lib/investigations/progress", () => ({
  useCanonicalInvestigationProgress: () => ({ completedIds: [], count: 0 }),
}));
vi.mock("@/lib/campaigns/completions", () => ({
  localCompletedIds: () => [],
  fetchServerCompletedIds: async () => ({ userId: s.uid, ids: [] }),
}));
vi.mock("@/lib/diag-trace", () => ({
  recordTrace: vi.fn(),
  readTrace: () => [],
  clearTrace: vi.fn(),
}));
vi.mock("@/lib/achievements/v2/claim.functions", () => ({
  fetchUserAchievements: async () => [],
  claimAchievements: s.claim,
  repairHistoricalAchievements: s.repair,
}));
vi.mock("@/lib/achievements/v2/engine", async (original) => ({
  ...(await original<any>()),
  getPersisted: () => s.persisted,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: s.uid } } } }),
      getUser: async () => ({ data: { user: { id: s.uid } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (table: string) => ({
      insert: s.write,
      update: s.write,
      upsert: s.write,
      delete: s.write,
      select: (columns: string) => ({
        eq: (field: string, uid: string) => ({
          abortSignal: (signal: AbortSignal) => s.query({ table, columns, field, uid, signal }),
        }),
      }),
    }),
    rpc: s.write,
    functions: { invoke: s.write },
  },
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => (
    <div dir="rtl" lang="ar">
      {children}
    </div>
  ),
  Screen: ({ children, title }: any) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock("@/components/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/AvatarPicker", () => ({ AvatarPicker: () => null }));
vi.mock("@/components/CinematicPageBackdrop", () => ({ CinematicPageBackdrop: () => null }));
vi.mock("@/components/AccountSection", () => ({ AccountSection: () => null }));
vi.mock("@/components/CommunityHubSection", () => ({ CommunityHubSection: () => null }));
vi.mock("@/components/DeleteAccountSection", () => ({ DeleteAccountSection: () => null }));
vi.mock("@/lib/resetProgress", () => ({ clearLocalPlayerProgress: s.write }));
vi.mock("@/lib/androidFreezeDiagnostics", () => ({ isAndroidNativeApp: () => false }));
import { Route } from "@/routes/profile";
import { setActiveOwnerInternal } from "@/lib/identity/owner";
import { UI_MESSAGES } from "@/lib/ui-language/messages";
import { achievementCategoryLabel, achievementRarityLabel, achievementReceiptDate } from "@/lib/achievements/v2/chrome";
import { CATEGORY_META, RARITY_STYLE } from "@/lib/achievements/v2/presentation";
import type { AchievementCategory, AchievementRarity } from "@/lib/achievements/v2/types";
import { setUiLanguage } from "@/lib/ui-language/store";
import { getSnapshot } from "@/lib/achievements/v2/engine";
import { ar } from "@/lib/achievements/v2/locale/ar";
import { en } from "@/lib/achievements/v2/locale/en";
const Page = Route.options.component as React.ComponentType;
const titleKey = "ach.ach_artifact_10.title";
const rows = (n: number) => ({
  data: Array.from({ length: n }, (_, i) => ({ item_id: `artifact-${i}`, item_type: "artifact" })),
  error: null,
});
let seq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  s.uid = `mounted-${++seq}`;
  s.persisted = new Map();
  s.search = { tab: "achievements" };
  setActiveOwnerInternal(`user:${s.uid}`);
  setUiLanguage("ar");
  s.query.mockResolvedValue(rows(9));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  setUiLanguage("ar");
  vi.restoreAllMocks();
});
function noGrants() {
  expect(s.claim).not.toHaveBeenCalled();
  expect(s.repair).not.toHaveBeenCalled();
  expect(s.write).not.toHaveBeenCalled();
  expect(getSnapshot().museum.totalOwned).toBe(0);
}
async function open() {
  fireEvent.click(await screen.findByRole("button", { name: ar[titleKey] }));
  return screen.getByRole("dialog");
}
it("real Profile shows confirmed nine-to-ten ownership and actual detail without rewards being granted", async () => {
  render(<Page />);
  await waitFor(() => expect(s.query).toHaveBeenCalled());
  let dialog = await open();
  await waitFor(() => expect(within(dialog).getByText("90%")).toBeTruthy());
  expect(within(dialog).queryByText(/لم يُؤكد صرف/)).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
  const before = screen.getByText(/من \d+ مفتوحة/).textContent;
  s.query.mockResolvedValue(rows(10));
  act(() => window.dispatchEvent(new Event("irth:collection:changed")));
  await waitFor(() =>
    expect(Number(screen.getByText(/من \d+ مفتوحة/).textContent!.split(" ")[0])).toBe(
      Number(before!.split(" ")[0]) + 1,
    ),
  );
  dialog = await open();
  expect(within(dialog).getByText("100%")).toBeTruthy();
  expect(within(dialog).getByText(/لم يُؤكد صرف/)).toBeTruthy();
  expect(within(dialog).queryByText(/فُتح في/)).toBeNull();
  noGrants();
});
it("open ID-backed detail changes actual title and description ar/en without replacing dialog while scoped achievement chrome translates", async () => {
  s.query.mockResolvedValue(rows(10));
  render(<Page />);
  await waitFor(() => expect(s.query).toHaveBeenCalled());
  const dialog = await open();
  await waitFor(() => expect(within(dialog).getByText(/لم يُؤكد صرف/)).toBeTruthy());
  act(() => setUiLanguage("en"));
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(within(dialog).getByRole("heading").textContent).toBe(en[titleKey]);
  expect(within(dialog).getByText(en["ach.ach_artifact_10.description"])).toBeTruthy();
  expect(within(dialog).getByText("Progress")).toBeTruthy();
  expect(screen.getByRole("tab", { name: "الإنجازات" })).toBeTruthy();
  act(() => setUiLanguage("ar"));
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(within(dialog).getByRole("heading").textContent).toBe(ar[titleKey]);
  noGrants();
});
it("existing claimed record keeps its receipt presentation rather than the ownership-only warning", async () => {
  s.persisted.set("ach_artifact_10", {
    achievementId: "ach_artifact_10",
    unlockedAt: "2026-01-01",
    rewardsGrantedAt: "2026-01-02",
    engineVersion: 2,
    definitionVersion: 1,
  });
  render(<Page />);
  const dialog = await open();
  expect(within(dialog).queryByText(/لم يُؤكد صرف/)).toBeNull();
  expect(within(dialog).getByText(/فُتح في/)).toBeTruthy();
  noGrants();
});
it("unknown deep-link does not create a detail; known ID opens real dialog and consumes only its query field", async () => {
  s.search = { tab: "achievements", achievement: "missing-id" };
  const page = render(<Page />);
  expect(screen.queryByRole("dialog")).toBeNull();
  s.search = { tab: "achievements", achievement: "ach_artifact_10" };
  page.rerender(<Page />);
  await screen.findByRole("dialog");
  const navigation = s.nav.mock.calls.at(-1)![0];
  expect(navigation.search(s.search)).toEqual({ tab: "achievements", achievement: undefined });
  expect(navigation.replace).toBe(true);
  noGrants();
});
it("old-owner delayed rows cannot restore an open detail ownership after switching accounts", async () => {
  let resolve!: (value: ReturnType<typeof rows>) => void;
  s.query.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<Page />);
  await waitFor(() => expect(s.query).toHaveBeenCalledTimes(1));
  const dialog = await open();
  s.query.mockResolvedValue(rows(0));
  act(() => {
    s.uid = "replacement";
    setActiveOwnerInternal("user:replacement");
  });
  await waitFor(() => expect(s.query).toHaveBeenCalledTimes(2));
  await act(async () => {
    resolve(rows(10));
    await Promise.resolve();
  });
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(within(dialog).getByText("0%")).toBeTruthy();
  expect(within(dialog).queryByText(/لم يُؤكد صرف/)).toBeNull();
  noGrants();
});
it("scoped chrome keeps the same open dialog, accessible heading, ownership warning and totals across language changes", async () => {
  s.query.mockResolvedValue(rows(10)); render(<Page />);
  const dialog=await open(); await waitFor(()=>expect(within(dialog).getByText(UI_MESSAGES.ar.achOwnershipUnconfirmed)).toBeTruthy());
  const headingId=dialog.getAttribute('aria-labelledby'); expect(headingId).toBeTruthy();
  expect(document.getElementById(headingId!)).toBe(within(dialog).getByRole('heading'));
  const total=screen.getByText(/من \d+ مفتوحة/).textContent!.match(/\d+/g)!;
  act(()=>setUiLanguage('en'));
  expect(screen.getByRole('dialog',{name:en[titleKey]})).toBe(dialog);
  expect(dialog.getAttribute('aria-labelledby')).toBe(headingId);
  expect(dialog.getAttribute('lang')).toBe('en'); expect(dialog.getAttribute('dir')).toBe('ltr');
  expect(within(dialog).getByText(UI_MESSAGES.en.achOwnershipUnconfirmed)).toBeTruthy();
  expect(within(dialog).queryByText(/Unlocked on/)).toBeNull();
  expect(within(dialog).getByText('100%')).toBeTruthy();
  expect(screen.getByText(`${total[0]} of ${total[1]} unlocked`)).toBeTruthy();
  expect(screen.getByText('Achievement cabinet').closest('[lang="en"][dir="ltr"]')).toBeTruthy();
  expect(screen.getByRole('tab',{name:'الإنجازات'})).toBeTruthy();
  act(()=>setUiLanguage('ar'));
  expect(screen.getByRole('dialog',{name:ar[titleKey]})).toBe(dialog);
  expect(dialog.getAttribute('dir')).toBe('rtl');
  expect(within(dialog).getByText(UI_MESSAGES.ar.achOwnershipUnconfirmed)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button',{name:'إغلاق'})); expect(screen.queryByRole('dialog')).toBeNull();
  noGrants();
});
it("English claimed detail preserves reward amounts and Arabic date presentation without showing an unconfirmed warning", async () => {
  const id='ach_campaign_1';s.persisted.set(id,{achievementId:id,unlockedAt:'2026-01-01',rewardsGrantedAt:'2026-01-02',engineVersion:2,definitionVersion:1});
  setUiLanguage('en');render(<Page />); fireEvent.click(await screen.findByRole('button',{name:en['ach.ach_campaign_1.title']}));
  const dialog=screen.getByRole('dialog');expect(within(dialog).getByText('+150 points')).toBeTruthy();expect(within(dialog).getByText('+100 dinars')).toBeTruthy();
  expect(within(dialog).queryByText(UI_MESSAGES.en.achOwnershipUnconfirmed)).toBeNull();
  const expected=new Date('2026-01-01').toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'});
  const date=within(dialog).getByText(expected);expect(date.getAttribute('lang')).toBe('ar');expect(date.getAttribute('dir')).toBe('rtl');
  fireEvent.click(within(dialog).getByRole('button',{name:'Close'}));expect(screen.queryByRole('dialog')).toBeNull();noGrants();
});
it("canonical earned-title remains Arabic and an invalid receipt date renders only a neutral fallback",async()=>{
  const id='ach_campaign_10';s.persisted.set(id,{achievementId:id,unlockedAt:'invalid-date',rewardsGrantedAt:'2026-01-02',engineVersion:2,definitionVersion:1});
  setUiLanguage('en');render(<Page/>);fireEvent.click(await screen.findByRole('button',{name:en['ach.ach_campaign_10.title']}));const dialog=screen.getByRole('dialog');
  const title=within(dialog).getByText('قاهر الجبهات');expect(title.getAttribute('lang')).toBe('ar');expect(title.getAttribute('dir')).toBe('rtl');
  expect(within(dialog).getByText('—')).toBeTruthy();expect(within(dialog).queryByText('Invalid Date')).toBeNull();expect(within(dialog).getByText('+1800 points')).toBeTruthy();noGrants();
});
it("display category and rarity maps preserve canonical Arabic values and complete English coverage",()=>{
  const before=JSON.stringify({CATEGORY_META,RARITY_STYLE});
  for(const category of Object.keys(CATEGORY_META) as AchievementCategory[]){expect(achievementCategoryLabel(category,UI_MESSAGES.ar)).toBe(CATEGORY_META[category].name);expect(achievementCategoryLabel(category,UI_MESSAGES.en).trim()).not.toBe('');}
  for(const rarity of Object.keys(RARITY_STYLE) as AchievementRarity[]){expect(achievementRarityLabel(rarity,false,UI_MESSAGES.ar)).toBe(RARITY_STYLE[rarity].label);expect(achievementRarityLabel(rarity,false,UI_MESSAGES.en).trim()).not.toBe('');expect(achievementRarityLabel(rarity,true,UI_MESSAGES.en)).toBe('Secret');}
  expect(JSON.stringify({CATEGORY_META,RARITY_STYLE})).toBe(before);expect(achievementReceiptDate('invalid-date')).toBe('—');
});
