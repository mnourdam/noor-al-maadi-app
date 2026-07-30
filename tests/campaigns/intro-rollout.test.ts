// ============================================================
// Stage 6 acceptance — staged rollout ladder + observability
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
}

const store = new MemoryStorage();
(globalThis as any).window = { localStorage: store };

const {
  areCampaignIntrosEnabled,
  isCampaignIntroEnabledFor,
  isCampaignIntroRolledOut,
  readCampaignIntroRollout,
  CAMPAIGN_INTRO_FLAG_KEYS: KEYS,
} = await import("@/lib/campaigns/intro/flags");

function setConfig(cfg: Record<string, unknown> | null) {
  if (cfg === null) store.removeItem(KEYS.configCache);
  else store.setItem(KEYS.configCache, JSON.stringify(cfg));
}

describe("rollout ladder", () => {
  beforeEach(() => store.clear());

  it("step 1 (build default) — the pilot campaign only", async () => {
    const { CAMPAIGN_INTRO_PILOT_CAMPAIGNS } = await import("@/lib/campaigns/intro/flags");
    expect(areCampaignIntrosEnabled()).toBe(true);
    expect(isCampaignIntroEnabledFor(CAMPAIGN_INTRO_PILOT_CAMPAIGNS[0])).toBe(true);
    expect(isCampaignIntroEnabledFor("some-other-campaign")).toBe(false);
    expect(readCampaignIntroRollout()).toEqual([...CAMPAIGN_INTRO_PILOT_CAMPAIGNS]);
  });


  it("step 1 — one pilot campaign only", () => {
    setConfig({ [KEYS.configKey]: true, [KEYS.rolloutKey]: ["camp-a"] });
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(true);
    expect(isCampaignIntroEnabledFor("camp-b")).toBe(false);
    expect(isCampaignIntroEnabledFor("camp-c")).toBe(false);
  });

  it("step 2 — two campaigns", () => {
    setConfig({ [KEYS.configKey]: true, [KEYS.rolloutKey]: ["camp-a", "camp-b"] });
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(true);
    expect(isCampaignIntroEnabledFor("camp-b")).toBe(true);
    expect(isCampaignIntroEnabledFor("camp-c")).toBe(false);
  });

  it("step 3 — all campaigns via '*'", () => {
    setConfig({ [KEYS.configKey]: true, [KEYS.rolloutKey]: [KEYS.all] });
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(true);
    expect(isCampaignIntroEnabledFor("anything")).toBe(true);
  });

  it("a server-side kill switch beats the widest rollout", () => {
    setConfig({ [KEYS.configKey]: false, [KEYS.rolloutKey]: [KEYS.all] });
    store.setItem(KEYS.devOverride, "1");
    expect(areCampaignIntrosEnabled()).toBe(false);
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(false);
  });

  it("enabled without an allowlist rolls out to nobody", () => {
    setConfig({ [KEYS.configKey]: true, [KEYS.rolloutKey]: [] });
    expect(areCampaignIntrosEnabled()).toBe(true);
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(false);
  });

  it("dev override: '1' = all, csv = named campaigns, '0' = off", () => {
    store.setItem(KEYS.devOverride, "1");
    expect(isCampaignIntroEnabledFor("camp-a")).toBe(true);
    store.setItem(KEYS.devOverride, "camp-a, camp-b");
    expect(isCampaignIntroEnabledFor("camp-b")).toBe(true);
    expect(isCampaignIntroEnabledFor("camp-c")).toBe(false);
    store.setItem(KEYS.devOverride, "0");
    expect(areCampaignIntrosEnabled()).toBe(false);
  });

  it("tolerates a corrupt config cache (falls back to the build default)", () => {
    store.setItem(KEYS.configCache, "{not json");
    expect(areCampaignIntrosEnabled()).toBe(true);
    expect(isCampaignIntroRolledOut("camp-a")).toBe(false);
  });


  it("an empty/absent campaign id is never rolled out", () => {
    setConfig({ [KEYS.configKey]: true, [KEYS.rolloutKey]: [KEYS.all] });
    expect(isCampaignIntroRolledOut("")).toBe(false);
    expect(isCampaignIntroRolledOut(null)).toBe(false);
  });
});

describe("observability", () => {
  it("introDebug is silent outside dev; introError always reports", async () => {
    const { introDebug, introError } = await import("@/lib/campaigns/intro/debug");
    const originalDebug = console.debug;
    const originalError = console.error;
    const debugCalls: unknown[] = [];
    const errorCalls: unknown[] = [];
    console.debug = (...a: unknown[]) => void debugCalls.push(a);
    console.error = (...a: unknown[]) => void errorCalls.push(a);
    try {
      introDebug("test:event", { a: 1 });
      introError("test:failure", new Error("boom"));
    } finally {
      console.debug = originalDebug;
      console.error = originalError;
    }
    const isDev = (import.meta as any).env?.DEV === true;
    expect(debugCalls.length).toBe(isDev ? 1 : 0);
    expect(errorCalls.length).toBe(1);
    expect(String(errorCalls[0])).toContain("boom");
  });
});
