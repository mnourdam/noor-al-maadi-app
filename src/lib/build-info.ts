// Build-time identity — populated by vite `define` in both
// vite.config.ts (web/SSR) and vite.android.config.ts (Capacitor APK).
// Values are baked at build time; do NOT read env at runtime for these.

declare const __BUILD_SHA__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
declare const __BUILD_TYPE__: string | undefined;
declare const __BUILD_TARGET__: string | undefined;
declare const __APP_VERSION__: string | undefined;
declare const __ANDROID_TARGET_SDK__: string | undefined;

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export const BUILD_SHA: string =
  safe(() => (typeof __BUILD_SHA__ !== "undefined" ? __BUILD_SHA__ : ""), "") || "unknown";

export const BUILD_TIME: string =
  safe(() => (typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : ""), "") || "unknown";

export const BUILD_TYPE: string =
  safe(() => (typeof __BUILD_TYPE__ !== "undefined" ? __BUILD_TYPE__ : ""), "") || "unknown";

export const BUILD_TARGET: string =
  safe(() => (typeof __BUILD_TARGET__ !== "undefined" ? __BUILD_TARGET__ : ""), "") || "web";

export const APP_VERSION: string =
  safe(() => (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : ""), "") || "0.0.0";

export const ANDROID_TARGET_SDK: string =
  safe(() => (typeof __ANDROID_TARGET_SDK__ !== "undefined" ? __ANDROID_TARGET_SDK__ : ""), "") || "unknown";

export const PERSISTENCE_SCHEMA_VERSION = "priority-zero-v2";
export const CAMPAIGN_PROGRESS_RPC_CONTRACT = "record_campaign_progress_v2";
export const TUTORIAL_ONBOARDING_RPC_CONTRACT = "get_tutorial_completion/record_tutorial_completion";

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const BACKEND_CONFIG_FINGERPRINT: string = safe(() => {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
  if (!url || !key) return "missing";
  return hashString(`${url}|${key.slice(0, 24)}`);
}, "unknown");

function maskHost(host: string): string {
  if (!host) return "missing";
  const [first, ...rest] = host.split(".");
  if (!first) return host;
  const maskedFirst = first.length <= 8
    ? first
    : `${first.slice(0, 4)}…${first.slice(-4)}`;
  return [maskedFirst, ...rest].join(".");
}

export const COMPILED_BACKEND_HOST: string = safe(() => {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  if (!url) return "missing";
  return maskHost(new URL(url).host);
}, "unknown");
