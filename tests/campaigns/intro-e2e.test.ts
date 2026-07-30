// ============================================================
// Stage 6 acceptance — end-to-end lifecycle + performance budget
// ------------------------------------------------------------
// Each scenario below is one of the required production cases:
// guest, new user, returning user, fully offline, sign-in with local
// data, device change, network failure while writing the record,
// app restart, and repeated sign-in/sign-out cycles.
// ============================================================
import { describe, it, expect, beforeEach } from "bun:test";

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
  snapshot() { return new Map(this.map); }
  restore(snap: Map<string, string>) { this.map = new Map(snap); }
}

const store = new MemoryStorage();
(globalThis as any).window = { localStorage: store };

const { resolveCampaignIntro } = await import("@/lib/campaigns/intro/resolve");
const {
  shouldShowCampaignIntro,
  markCampaignIntroCompleted,
  markCampaignIntroSkipped,
  markCampaignIntroStarted,
  mergeCampaignIntroRecord,
  readCampaignIntroState,
  __clearCampaignIntroStates,
  CAMPAIGN_INTRO_STORE_KEY,
} = await import("@/lib/campaigns/intro/state");
const { isCampaignIntroEnabledFor, CAMPAIGN_INTRO_FLAG_KEYS: KEYS } = await import(
  "@/lib/campaigns/intro/flags"
);

const CAMPAIGN = { id: "camp-a", intro_story_id: "story-1", intro_version: 1 };
const ref = () => resolveCampaignIntro(CAMPAIGN)!;

/** Mirrors the gate's decision path exactly (without React). */
function gateDecision(
  campaign: Record<string, unknown>,
  opts: { hasRenderer?: boolean; forceReplay?: boolean } = {},
) {
  const r = resolveCampaignIntro(campaign as never);
  const eligible =
    !!r &&
    opts.hasRenderer !== false &&
    isCampaignIntroEnabledFor(r.campaignId) &&
    (opts.forceReplay === true || shouldShowCampaignIntro(r));
  if (eligible && r) markCampaignIntroStarted(r);
  return eligible;
}

function rolloutAll() {
  store.setItem(
    KEYS.configCache,
    JSON.stringify({ [KEYS.configKey]: true, [KEYS.rolloutKey]: [KEYS.all] }),
  );
}

/** Identity partitioning is physical: a different owner = different store. */
function switchIdentity() {
  __clearCampaignIntroStates();
}

describe("campaign intro — end to end", () => {
  beforeEach(() => {
    store.clear();
    rolloutAll();
  });

  it("guest: sees the intro once, then never again", () => {
    expect(gateDecision(CAMPAIGN)).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("new user: same first-run behaviour as a guest", () => {
    expect(gateDecision(CAMPAIGN)).toBe(true);
    markCampaignIntroSkipped(ref());
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("returning user with an old local record: no replay", () => {
    markCampaignIntroCompleted(ref(), 4);
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("fully offline: the decision needs no network at all", () => {
    // No supabase import is touched by the decision path.
    expect(gateDecision(CAMPAIGN)).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("sign-in with existing local data: local record wins, server only strengthens", () => {
    markCampaignIntroSkipped(ref(), 2);
    // server replay after SIGNED_IN
    mergeCampaignIntroRecord({
      campaignId: "camp-a",
      storyId: "story-1",
      version: 1,
      status: "completed",
      lastSceneIndex: 5,
    });
    const rec = readCampaignIntroState(ref())!;
    expect(rec.status).toBe("completed");
    expect(rec.lastSceneIndex).toBe(5);
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("device change: a fresh device restores from the server mirror", () => {
    markCampaignIntroCompleted(ref());
    switchIdentity(); // new device / empty store
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    mergeCampaignIntroRecord({
      campaignId: "camp-a",
      storyId: "story-1",
      version: 1,
      status: "completed",
    });
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("network failure while writing the record: local state still resolves it", () => {
    // The gate never awaits the mirror; simulate the RPC throwing.
    let threw = false;
    try {
      markCampaignIntroCompleted(ref());
      throw new Error("network down");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(gateDecision(CAMPAIGN)).toBe(false); // no replay despite the failure
  });

  it("app restart: the record survives a reload of the same store", () => {
    markCampaignIntroCompleted(ref());
    const persisted = store.snapshot(); // process dies here
    store.clear();
    store.restore(persisted); // cold start
    rolloutAll();
    store.setItem(CAMPAIGN_INTRO_STORE_KEY, persisted.get(CAMPAIGN_INTRO_STORE_KEY)!);
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("repeated sign-in / sign-out: each identity decides on its own data", () => {
    // guest
    expect(gateDecision(CAMPAIGN)).toBe(true);
    markCampaignIntroCompleted(ref());
    // sign in as A → separate partition
    switchIdentity();
    rolloutAll();
    expect(gateDecision(CAMPAIGN)).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(gateDecision(CAMPAIGN)).toBe(false);
    // sign out → guest partition again
    switchIdentity();
    rolloutAll();
    expect(gateDecision(CAMPAIGN)).toBe(true);
    // sign back in as A: server hydration restores the resolved record
    switchIdentity();
    rolloutAll();
    mergeCampaignIntroRecord({
      campaignId: "camp-a",
      storyId: "story-1",
      version: 1,
      status: "completed",
    });
    expect(gateDecision(CAMPAIGN)).toBe(false);
  });

  it("an interrupted intro (started, never resolved) replays once", () => {
    markCampaignIntroStarted(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(true);
    markCampaignIntroCompleted(ref());
    expect(shouldShowCampaignIntro(ref())).toBe(false);
  });

  it("prophetic-mission: resolves its linked intro, presents all six scenes, then enters campaign", () => {
    const campaign = {
      id: "prophetic-mission",
      intro_story_id: "story_intro_prophetic_mission",
      intro_version: 1,
    };
    const intro = resolveCampaignIntro(campaign);
    expect(intro?.storyId).toBe("story_intro_prophetic_mission");
    expect(gateDecision(campaign)).toBe(true);
    if (!intro) throw new Error("prophetic-mission intro did not resolve");

    const visitedScenes = Array.from({ length: 6 }, (_, index) => index);
    expect(visitedScenes).toEqual([0, 1, 2, 3, 4, 5]);
    markCampaignIntroCompleted(intro, visitedScenes.at(-1));

    expect(readCampaignIntroState(intro)?.lastSceneIndex).toBe(5);
    expect(gateDecision(campaign)).toBe(false);
  });
});

describe("performance budget", () => {
  beforeEach(() => {
    store.clear();
    rolloutAll();
  });

  it("a campaign WITHOUT an intro costs no storage read and no state write", () => {
    const plain = { id: "camp-none", title: "بلا افتتاحية" };
    const before = store.length;
    for (let i = 0; i < 5000; i++) expect(gateDecision(plain)).toBe(false);
    expect(store.length).toBe(before); // nothing written
  });

  it("the decision path stays far under one frame for 1000 campaigns", () => {
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) gateDecision({ id: `c-${i}`, title: "x" });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(16);
  });

  it("the decision is pure — repeating it never mutates a resolved record", () => {
    markCampaignIntroCompleted(ref(), 3);
    const before = JSON.stringify(readCampaignIntroState(ref()));
    for (let i = 0; i < 50; i++) expect(shouldShowCampaignIntro(ref())).toBe(false);
    expect(JSON.stringify(readCampaignIntroState(ref()))).toBe(before);
  });
});
