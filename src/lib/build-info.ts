// Build-time identity — populated by vite `define` in both
// vite.config.ts (web/SSR) and vite.android.config.ts (Capacitor APK).
// Values are baked at build time; do NOT read env at runtime for these.

declare const __BUILD_SHA__: string | undefined;
declare const __BUILD_TIME__: string | undefined;
declare const __BUILD_TYPE__: string | undefined;
declare const __BUILD_TARGET__: string | undefined;

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
