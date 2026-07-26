/**
 * Atlas crash recovery + diagnostics.
 *
 * The Atlas is the heaviest player surface (large raster + hundreds of pins),
 * and it is the one route that renders as a full-screen `fixed inset-0` layer.
 * When it throws, two things must be guaranteed:
 *
 *   1. The failure stays SCOPED to the Atlas route — never a whole-app freeze.
 *   2. There is always an escape path (Home) that does not depend on any
 *      Atlas hook, map state, or renderer.
 *
 * This module owns the non-visual half of that contract: diagnostics capture,
 * the one-session crash marker, UI-lock release, and the Atlas-only data reset.
 * Nothing here may clear player progress, account data, campaigns, museum or
 * story state.
 */

import type { QueryClient } from "@tanstack/react-query";
import { releaseAllUiLocks, releaseSurfaceLocks } from "@/lib/ui/ui-locks";


/** Session-scoped crash marker. Expires when the WebView session ends. */
const CRASH_KEY = "irth.atlas.crash.v1";
/** Survives a hard app restart for exactly one launch (cleared on read+render). */
const CRASH_LAUNCH_KEY = "irth.atlas.crash.launch.v1";
/** When set, the atlas query skips local snapshot rows and refetches remotely. */
const FORCE_REMOTE_KEY = "irth.atlas.forceRemote.v1";

export const ATLAS_QUERY_KEY_PREFIX = "atlas-entities";

export type AtlasDiagnostics = {
  at: string;
  name: string;
  message: string;
  stack?: string;
  route: string;
  componentStack?: string;
  platform: string;
  userAgent: string;
  appVersion: string;
  online: boolean;
  webgl: boolean;
  canvas2d: boolean;
  deviceMemory?: number;
  snapshotVersion?: number | null;
  userHash?: string | null;
  queryKey?: string;
};

// ── Environment probes ────────────────────────────────────────────────

export function hasWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(
      c.getContext("webgl2") ?? c.getContext("webgl") ?? c.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

export function hasCanvas2d(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return Boolean(document.createElement("canvas").getContext("2d"));
  } catch {
    return false;
  }
}

/** Old Android WebViews (< 64) have no ResizeObserver — constructing it throws. */
export function hasResizeObserver(): boolean {
  return typeof window !== "undefined" && typeof (window as any).ResizeObserver === "function";
}

/** Non-reversible, non-identifying short hash used for log correlation only. */
export function hashId(value: string | null | undefined): string | null {
  if (!value) return null;
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return `u_${(h >>> 0).toString(36)}`;
}

// ── Diagnostics ───────────────────────────────────────────────────────

export function captureAtlasDiagnostics(
  error: unknown,
  extra?: { componentStack?: string; queryKey?: string },
): AtlasDiagnostics {
  const err = error as { name?: string; message?: string; stack?: string } | null;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  return {
    at: new Date().toISOString(),
    name: err?.name ?? "Error",
    message: err?.message ?? String(error),
    stack: err?.stack,
    componentStack: extra?.componentStack,
    queryKey: extra?.queryKey,
    route: typeof location !== "undefined" ? location.pathname + location.search : "/map",
    platform: nav?.platform ?? "unknown",
    userAgent: nav?.userAgent ?? "unknown",
    appVersion:
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_APP_VERSION) || "dev",
    online: nav?.onLine !== false,
    webgl: hasWebgl(),
    canvas2d: hasCanvas2d(),
    deviceMemory: (nav as any)?.deviceMemory,
  };
}

/**
 * Emits the full diagnostic record. Kept as a single `console.error` with the
 * raw Error first so the stack survives into native logcat / Server Logs.
 */
export function logAtlasFailure(error: unknown, diag: AtlasDiagnostics): void {
  try {
    console.error("[atlas:fatal]", error);
    console.error("[atlas:fatal:diagnostics]", JSON.stringify(diag));
  } catch {
    /* never throw from the failure path */
  }
}

/** Enriches the record with async-only fields (snapshot version, hashed uid). */
export async function enrichAtlasDiagnostics(diag: AtlasDiagnostics): Promise<AtlasDiagnostics> {
  const out = { ...diag };
  try {
    const { getSnapshotVersion } = await import("@/lib/offline-storage");
    out.snapshotVersion = (await getSnapshotVersion())?.version ?? null;
  } catch {
    out.snapshotVersion = null;
  }
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    out.userHash = hashId(data.session?.user?.id ?? null);
  } catch {
    out.userHash = null;
  }
  return out;
}

// ── Crash marker (one session / one launch) ───────────────────────────

export function markAtlasCrash(diag: AtlasDiagnostics): void {
  const payload = JSON.stringify({ at: diag.at, name: diag.name, message: diag.message });
  try { sessionStorage.setItem(CRASH_KEY, payload); } catch { /* ignore */ }
  try { localStorage.setItem(CRASH_LAUNCH_KEY, payload); } catch { /* ignore */ }
}

export function hasAtlasCrashMarker(): boolean {
  try { if (sessionStorage.getItem(CRASH_KEY)) return true; } catch { /* ignore */ }
  try { return Boolean(localStorage.getItem(CRASH_LAUNCH_KEY)); } catch { return false; }
}

/** Called after a successful interactive Atlas render. */
export function clearAtlasCrashMarker(): void {
  try { sessionStorage.removeItem(CRASH_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(CRASH_LAUNCH_KEY); } catch { /* ignore */ }
}

// ── Force-remote flag ─────────────────────────────────────────────────

export function shouldForceRemoteAtlas(): boolean {
  try { return sessionStorage.getItem(FORCE_REMOTE_KEY) === "1"; } catch { return false; }
}

function setForceRemoteAtlas(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(FORCE_REMOTE_KEY, "1");
    else sessionStorage.removeItem(FORCE_REMOTE_KEY);
  } catch { /* ignore */ }
}

// ── UI-lock release ───────────────────────────────────────────────────

/**
 * SUCCESS-PATH release. Undoes scroll locks, inert branches and any layer a
 * previous crash neutralized.
 *
 * It deliberately does NOT call `neutralizeBlockingOverlays()`: the Atlas
 * itself renders as `fixed inset-0` and would be hidden by its own cleanup,
 * producing a fully blank Atlas with no error and no crash report.
 */
export function releaseUiLocks(): void {
  releaseSurfaceLocks();
}

/** CRASH-PATH release. Also hides any full-screen layer above the recovery UI. */
export function hardReleaseUiLocks(): void {
  releaseAllUiLocks();
}



// ── Atlas-only data reset ─────────────────────────────────────────────

/**
 * Clears ONLY Atlas-scoped client state:
 *  • Atlas query cache entries
 *  • `irth.atlas.*` localStorage / sessionStorage keys
 *  • the crash marker
 * and forces the next Atlas fetch to bypass the local snapshot rows.
 *
 * It never touches progress, account, campaign, museum or story data, and it
 * never deletes the shared offline snapshot (other routes depend on it).
 */
export async function resetAtlasData(queryClient?: QueryClient): Promise<void> {
  try {
    queryClient?.removeQueries({
      predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith(ATLAS_QUERY_KEY_PREFIX),
    });
  } catch { /* ignore */ }

  for (const store of [
    typeof localStorage !== "undefined" ? localStorage : null,
    typeof sessionStorage !== "undefined" ? sessionStorage : null,
  ]) {
    if (!store) continue;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith("irth.atlas.")) doomed.push(k);
      }
      doomed.forEach((k) => store.removeItem(k));
    } catch { /* ignore */ }
  }

  clearAtlasCrashMarker();
  setForceRemoteAtlas(true);
  releaseUiLocks();
}
