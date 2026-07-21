// Centralized public-origin resolver.
//
// Referral links, QR codes and public share URLs MUST NEVER embed:
//   - localhost / 127.0.0.1 / 0.0.0.0
//   - capacitor://localhost, http(s)://localhost, file://, chrome://
//   - preview sandbox internal origins that outside users can't reach
//
// One trusted public origin serves the APK, production web and preview
// deployments. Preview/staging deployments on `*.lovable.app` are considered
// public enough to share (the QR/link will simply route to that build).
//
// The resolver is deterministic and safe to call from any surface — the
// referral card, the QR, share buttons, and the Historical Identity Card
// all pull from here so there is exactly one truth for "where does this
// link point".

import { isCapacitorNative } from "@/lib/native-auth";

/** The approved public Irth origin. This is the single string a scanner or
 *  message recipient must be able to reach. */
export const PUBLIC_ORIGIN = "https://irth-develop.lovable.app";

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
  // Private IPv4 ranges — never share these.
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  return false;
}

/**
 * Resolve the public origin to use for shareable links. Native/APK always
 * uses the approved `PUBLIC_ORIGIN`. Web falls back to `PUBLIC_ORIGIN` when
 * the current origin is local/internal, otherwise uses the current origin
 * so preview builds still get testable share URLs.
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
 * a URL whose origin is local/internal — callers must handle `null` (which
 * indicates the environment isn't yet ready to produce a shareable link).
 */
export function buildPublicUrl(path: string): string | null {
  const p = path.startsWith("/") ? path : `/${path}`;
  const origin = resolvePublicOrigin();
  if (isLocalOrigin(origin)) return null;
  return `${origin}${p}`;
}

/**
 * Referral URL builder. Encodes the code and always resolves through the
 * public-origin path. Returns `null` when no shareable origin is available.
 */
export function buildReferralUrl(code: string): string | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  return buildPublicUrl(`/auth?ref=${encodeURIComponent(c)}`);
}

/**
 * Public profile URL by username. Used as a share fallback when file share
 * is unavailable for the Historical Identity Card.
 */
export function buildPublicProfileUrl(username: string): string | null {
  const u = (username ?? "").trim();
  if (!u) return null;
  return buildPublicUrl(`/u/${encodeURIComponent(u)}`);
}
