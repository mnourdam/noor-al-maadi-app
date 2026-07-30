// ============================================================
// Campaign Intros — kill switch (Stage 3)
// ------------------------------------------------------------
// Fail-safe: the feature is OFF unless something explicitly turns it
// on. Stage 5 replaces the cached-config reader with the real
// `app_config` snapshot; the contract below does not change:
//
//   server `false`  → OFF, always (a local dev key cannot override it)
//   server `true`   → ON
//   unknown/offline → last known value, else the build flag, else OFF
// ============================================================

const CONFIG_CACHE_KEY = "irth.app-config.cache.v1";
const DEV_OVERRIDE_KEY = "irth.debug.campaignIntros";
const CONFIG_KEY = "campaign_intros.enabled";

function readCachedServerFlag(): boolean | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[CONFIG_KEY];
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

function readBuildFlag(): boolean {
  try {
    return import.meta.env?.VITE_CAMPAIGN_INTROS === "1";
  } catch {
    return false;
  }
}

function readDevOverride(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(DEV_OVERRIDE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

/** Single authority consulted by `CampaignIntroGate`. */
export function areCampaignIntrosEnabled(): boolean {
  const server = readCachedServerFlag();
  // A server-side `false` is absolute — no local escape hatch.
  if (server === false) return false;
  if (server === true) return true;
  return readBuildFlag() || readDevOverride();
}

export const CAMPAIGN_INTRO_FLAG_KEYS = {
  configCache: CONFIG_CACHE_KEY,
  configKey: CONFIG_KEY,
  devOverride: DEV_OVERRIDE_KEY,
} as const;
