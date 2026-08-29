/**
 * V16 Phase A — canonical runtime app version.
 *
 * Separates two DIFFERENT things that must never be conflated:
 *   - WEB/APP DISPLAY VERSION  → `APP_VERSION` in `src/lib/build-info.ts`
 *     (package.json string, used for diagnostics/analytics display only)
 *   - INSTALLED ANDROID VERSION CODE → this module, read from the actual
 *     installed APK through Capacitor `App.getInfo().build`.
 *
 * Only the numeric `versionCode` here may ever drive update enforcement.
 * `versionName` is human-readable and must NEVER be compared for gating.
 *
 * Every failure path yields `{ versionCode: null, valid: false }` and never
 * throws, so later update enforcement can fail OPEN.
 */

export type AppVersionPlatform = "android" | "web";

export interface AppVersionInfo {
  platform: AppVersionPlatform;
  /** Human-readable name (`versionName` on Android). Display/diagnostics only. */
  versionName: string | null;
  /** Positive integer Android `versionCode`, or null when unavailable/invalid. */
  versionCode: number | null;
  /** True only for a native Android read that produced a positive integer code. */
  valid: boolean;
  /** Where the value came from — useful in logs. */
  source: "capacitor-app" | "unavailable";
}

/**
 * Strict Android `build` parser.
 * Accepts only a base-10 non-negative integer string (leading zeros allowed).
 * Rejects "", "abc", "16.1", "1e3", " 16 ", negatives. Zero is parsed but
 * treated as invalid by the caller.
 */
export function parseAndroidVersionCode(build: unknown): number | null {
  if (typeof build === "number") {
    return Number.isSafeInteger(build) && build > 0 ? build : null;
  }
  if (typeof build !== "string") return null;
  if (!/^\d+$/.test(build)) return null;
  const n = Number.parseInt(build, 10);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

const WEB_INFO: AppVersionInfo = {
  platform: "web",
  versionName: null,
  versionCode: null,
  valid: false,
  source: "unavailable",
};

export interface ReadAppVersionOptions {
  /** Test seam: override native detection. */
  isNative?: () => boolean;
  /** Test seam: override the Capacitor App plugin loader. */
  getInfo?: () => Promise<{ version?: unknown; build?: unknown } | null | undefined>;
  /** Bypass the in-memory cache (tests). */
  noCache?: boolean;
}

function defaultIsNative(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    if (!cap?.isNativePlatform?.()) return false;
    return (cap.getPlatform?.() ?? "android") === "android";
  } catch {
    return false;
  }
}

async function defaultGetInfo(): Promise<{ version?: unknown; build?: unknown }> {
  const { App } = await import("@capacitor/app");
  return (await App.getInfo()) as { version?: unknown; build?: unknown };
}

let cached: AppVersionInfo | null = null;

/** Cached read; only successful native reads are cached. */
export async function readAppVersion(opts: ReadAppVersionOptions = {}): Promise<AppVersionInfo> {
  if (!opts.noCache && cached) return cached;

  const isNative = opts.isNative ?? defaultIsNative;
  let native = false;
  try {
    native = isNative();
  } catch {
    native = false;
  }
  if (!native) return WEB_INFO;

  const androidUnavailable: AppVersionInfo = {
    platform: "android",
    versionName: null,
    versionCode: null,
    valid: false,
    source: "unavailable",
  };

  let info: { version?: unknown; build?: unknown } | null | undefined;
  try {
    info = await (opts.getInfo ?? defaultGetInfo)();
  } catch {
    return androidUnavailable;
  }
  if (!info) return androidUnavailable;

  const versionName = typeof info.version === "string" && info.version.trim() !== ""
    ? info.version
    : null;
  const versionCode = parseAndroidVersionCode(info.build);

  const result: AppVersionInfo = {
    platform: "android",
    versionName,
    versionCode,
    valid: versionCode !== null,
    source: versionCode !== null || versionName !== null ? "capacitor-app" : "unavailable",
  };

  if (result.valid && !opts.noCache) cached = result;
  return result;
}

/** Synchronous access to the last successful read (null before first read). */
export function peekAppVersion(): AppVersionInfo | null {
  return cached;
}

/** Test-only cache reset. */
export function __resetAppVersionCache(): void {
  cached = null;
}
