// Durable replay protection for the Android native Google OAuth callback.
//
// Why: `processedCodes` / `inFlightCodes` in native-auth.ts are module-level
// Sets. The success path finishes with `window.location.replace(...)`, which
// reloads the WebView and wipes them. On the next boot Capacitor's
// `App.getLaunchUrl()` still returns the ORIGINAL launching intent, so the
// already-consumed authorization code is submitted a second time, Supabase
// rejects it, and the (actually signed-in) user is bounced to
// `/auth?oauth_error=1`.
//
// This module persists a short-lived FINGERPRINT — never the raw code, never
// the raw callback URL — so the replay is recognised across WebView reloads
// and full Android process restarts.
//
// Storage keys live under the `irth.native-auth` prefix, which is listed in
// SHARED_PREFIXES (src/lib/identity/partition.ts) and is therefore NOT
// owner-partitioned: the marker must be readable before any identity is known.

const CONSUMED_KEY = "irth.native-auth.consumed.v1";
const LAUNCH_URL_KEY = "irth.native-auth.launchurl.v1";

/** Markers older than this are pruned and ignored. */
export const REPLAY_MARKER_TTL_MS = 10 * 60 * 1000;

/** Cap on retained markers per key so storage can never grow unbounded. */
const MAX_MARKERS = 12;

type MarkerMap = Record<string, number>;

/**
 * Non-reversible 128-bit-ish fingerprint (four FNV-1a passes over salted
 * variants). Synchronous on purpose: the guard must run before any await in
 * the callback path, and SubtleCrypto is async-only. This is a replay
 * fingerprint, not a security primitive — the raw secret is never persisted
 * and cannot be reconstructed from the digest.
 */
export function fingerprint(input: string): string {
  const salts = ["a", "b", "c", "d"];
  let out = "";
  for (const salt of salts) {
    const s = `${salt}:${input.length}:${input}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(36).padStart(7, "0");
  }
  return out;
}

function readMarkers(key: string): MarkerMap {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const out: MarkerMap = {};
    for (const [k, v] of Object.entries(parsed as MarkerMap)) {
      if (typeof v === "number" && now - v < REPLAY_MARKER_TTL_MS) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMarkers(key: string, markers: MarkerMap): void {
  try {
    if (typeof window === "undefined") return;
    let entries = Object.entries(markers).sort((a, b) => b[1] - a[1]);
    if (entries.length > MAX_MARKERS) entries = entries.slice(0, MAX_MARKERS);
    window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore — guard degrades to in-memory only */
  }
}

function has(key: string, fp: string): boolean {
  return Object.prototype.hasOwnProperty.call(readMarkers(key), fp);
}

function mark(key: string, fp: string): void {
  const markers = readMarkers(key);
  markers[fp] = Date.now();
  writeMarkers(key, markers);
}

/** True when this authorization code was already exchanged successfully. */
export function isCodeConsumedDurably(code: string): boolean {
  return has(CONSUMED_KEY, fingerprint(code));
}

/** Record a successful exchange. Must run BEFORE any navigation/reload. */
export function markCodeConsumedDurably(code: string): void {
  mark(CONSUMED_KEY, fingerprint(code));
}

/** True when this exact launch URL was already handed to the callback. */
export function isLaunchUrlHandled(url: string): boolean {
  return has(LAUNCH_URL_KEY, fingerprint(url));
}

/** Record that a launch URL was picked up, so a relaunch cannot replay it. */
export function markLaunchUrlHandled(url: string): void {
  mark(LAUNCH_URL_KEY, fingerprint(url));
}
