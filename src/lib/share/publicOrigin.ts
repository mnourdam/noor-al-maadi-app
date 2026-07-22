// Centralized public-origin resolver.
//
// Referral links, QR codes and public share URLs MUST NEVER embed:
//   - localhost / 127.0.0.1 / 0.0.0.0
//   - capacitor://localhost, http(s)://localhost, file://, chrome://
//   - preview sandbox internal origins that outside users can't reach
//
// The approved public origin is supplied by the build via
// `VITE_PUBLIC_APP_ORIGIN`. Android release builds fail hard if it's absent
// or points at a local/invalid origin (see `assertProductionPublicOrigin`).
// Production web must set the same variable. Development and preview may
// fall back to the current non-local browser origin.

import { isCapacitorNative } from "@/lib/native-auth";

const RAW_CONFIGURED_ORIGIN: string | undefined =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_PUBLIC_APP_ORIGIN;

/**
 * Development-only safety net so Vite dev / preview / test runners still
 * produce a shareable URL when the env var isn't wired. Production and
 * release APK builds MUST override this via VITE_PUBLIC_APP_ORIGIN.
 * `assertProductionPublicOrigin()` blocks a release from ever silently
 * shipping with this fallback.
 */
const DEV_FALLBACK_ORIGIN = "https://irth-develop.lovable.app";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

const LOCAL_PROTOCOLS = new Set([
  "capacitor:",
  "file:",
  "chrome:",
  "chrome-extension:",
  "about:",
  "ionic:",
]);

/**
 * True if the given origin string is a local / internal / WebView origin
 * that should never appear in a shared URL or QR code.
 */
export function isLocalOrigin(origin: string | null | undefined): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  if (LOCAL_PROTOCOLS.has(url.protocol)) return true;
  if (url.protocol !== "https:" && url.protocol !== "http:") return true;
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (host.endsWith(".local")) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

/**
 * Validate a configured public origin: must be HTTPS, not local, and MUST
 * NOT carry a path, query, or fragment. Returns the normalized origin or
 * `null` if the value is invalid.
 */
export function validateConfiguredOrigin(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (isLocalOrigin(url.origin)) return null;
  // Must be pure origin — no embedded path/query/fragment.
  if (url.pathname && url.pathname !== "/") return null;
  if (url.search) return null;
  if (url.hash) return null;
  return url.origin;
}

const CONFIGURED_ORIGIN = validateConfiguredOrigin(RAW_CONFIGURED_ORIGIN);

/**
 * The single approved public origin. Configured via VITE_PUBLIC_APP_ORIGIN
 * at build time. Falls back to the development origin ONLY when the env
 * var is absent — production/APK release builds must fail before shipping
 * without a valid configured origin (see `assertProductionPublicOrigin`).
 */
export const PUBLIC_ORIGIN: string = CONFIGURED_ORIGIN ?? DEV_FALLBACK_ORIGIN;

/** The origin resolved from configuration, or `null` if none was provided.
 *  Distinct from `PUBLIC_ORIGIN` (which always resolves to a usable string
 *  in development) so release-build assertions can detect the difference. */
export const CONFIGURED_PUBLIC_ORIGIN: string | null = CONFIGURED_ORIGIN;

/**
 * Assert that a valid public origin is configured. Call from Android
 * release entry points (and any production bootstrap that must never
 * silently ship the dev fallback). Throws with an Arabic-safe English
 * message so the failure is loud in native logcat.
 */
export function assertProductionPublicOrigin(): void {
  if (!CONFIGURED_ORIGIN) {
    throw new Error(
      "VITE_PUBLIC_APP_ORIGIN is missing or invalid. " +
        "Set it to the approved HTTPS Irth origin (no path/query, not local) before building.",
    );
  }
}

/**
 * Resolve the public origin to use for shareable links. Native/APK always
 * uses the configured `PUBLIC_ORIGIN`. Web falls back to `PUBLIC_ORIGIN`
 * when the current origin is local/internal, otherwise uses the current
 * origin so non-local preview builds still get testable share URLs.
 */
export function resolvePublicOrigin(): string {
  if (typeof window === "undefined") return PUBLIC_ORIGIN;
  if (isCapacitorNative()) return PUBLIC_ORIGIN;
  const current = window.location.origin;
  if (isLocalOrigin(current)) return PUBLIC_ORIGIN;
  return current;
}

/**
 * Build a shareable path on the resolved public origin. Refuses to return
 * a URL whose origin is local/internal — callers must handle `null`.
 */
export function buildPublicUrl(path: string): string | null {
  const p = path.startsWith("/") ? path : `/${path}`;
  const origin = resolvePublicOrigin();
  if (isLocalOrigin(origin)) return null;
  return `${origin}${p}`;
}

export function buildReferralUrl(code: string): string | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  return buildPublicUrl(`/auth?ref=${encodeURIComponent(c)}`);
}

export function buildPublicProfileUrl(username: string): string | null {
  const u = (username ?? "").trim();
  if (!u) return null;
  return buildPublicUrl(`/u/${encodeURIComponent(u)}`);
}
