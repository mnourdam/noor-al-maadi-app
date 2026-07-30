// ============================================================
// Campaign Intros — kill switch + staged rollout (Stage 6)
// ------------------------------------------------------------
// Fail-safe: the feature is OFF unless something explicitly turns it
// on, and even when ON it only applies to the campaigns named in the
// rollout allowlist.
//
//   server `enabled === false` → OFF, always (no local escape hatch)
//   server `enabled === true`  → ON for the allowlisted campaigns only
//   unknown/offline            → last known value, else build flag, else OFF
//
// Rollout ladder (no code change between steps — config only):
//   1. []                        → nobody (default)
//   2. ["campaign-a"]            → one campaign (pilot)
//   3. ["campaign-a","camp-b"]   → two campaigns
//   4. ["*"]                     → every campaign
//
// The whole decision is synchronous, local and allocation-light: a
// campaign with no intro never reaches this module (the gate resolves
// the authored ref first).
// ============================================================

const CONFIG_CACHE_KEY = "irth.app-config.cache.v1";
const DEV_OVERRIDE_KEY = "irth.debug.campaignIntros";
const CONFIG_KEY = "campaign_intros.enabled";
const ROLLOUT_KEY = "campaign_intros.campaigns";

const ALL = "*";

function readConfigCache(): Record<string, unknown> | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readCachedServerFlag(): boolean | null {
  const cache = readConfigCache();
  const value = cache?.[CONFIG_KEY];
  return typeof value === "boolean" ? value : null;
}

function normalizeList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

function readCachedRollout(): string[] | null {
  const cache = readConfigCache();
  if (!cache || !(ROLLOUT_KEY in cache)) return null;
  return normalizeList(cache[ROLLOUT_KEY]);
}

function readBuildFlag(): boolean {
  try {
    return import.meta.env?.VITE_CAMPAIGN_INTROS === "1";
  } catch {
    return false;
  }
}

function readDevOverride(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DEV_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/**
 * Global master switch. `true` means "the engine may run"; it does NOT
 * mean every campaign is rolled out — see `isCampaignIntroRolledOut`.
 */
export function areCampaignIntrosEnabled(): boolean {
  const server = readCachedServerFlag();
  // A server-side `false` is absolute — no local escape hatch.
  if (server === false) return false;
  if (server === true) return true;
  const dev = readDevOverride();
  return readBuildFlag() || (!!dev && dev !== "0");
}

/** The campaigns currently included in the rollout ("*" = all). */
export function readCampaignIntroRollout(): string[] {
  const server = readCachedRollout();
  if (server && server.length) return server;
  if (server) return []; // explicitly empty on the server → nobody
  const dev = readDevOverride();
  if (dev && dev !== "0") return dev === "1" ? [ALL] : normalizeList(dev);
  return readBuildFlag() ? [ALL] : [];
}

/** Is this specific campaign inside the rollout? */
export function isCampaignIntroRolledOut(campaignId: string | null | undefined): boolean {
  if (!campaignId) return false;
  const list = readCampaignIntroRollout();
  if (!list.length) return false;
  if (list.includes(ALL)) return true;
  return list.includes(campaignId);
}

/** The single authority consulted by `CampaignIntroGate`. */
export function isCampaignIntroEnabledFor(
  campaignId: string | null | undefined,
): boolean {
  return areCampaignIntrosEnabled() && isCampaignIntroRolledOut(campaignId);
}

export const CAMPAIGN_INTRO_FLAG_KEYS = {
  configCache: CONFIG_CACHE_KEY,
  configKey: CONFIG_KEY,
  rolloutKey: ROLLOUT_KEY,
  devOverride: DEV_OVERRIDE_KEY,
  all: ALL,
} as const;
