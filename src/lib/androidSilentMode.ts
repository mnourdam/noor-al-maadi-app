// ============================================================
// Android Silent Mode gate
// ------------------------------------------------------------
// Android WebView HTML5 audio routes through STREAM_MUSIC, which is
// NOT muted by the ringer's Silent / Vibrate modes. We bridge to a
// tiny native plugin (RingerMode) to read the system ringer state
// and short-circuit playback in audioManager / splashSfx.
//
// Default behavior: respect device silent mode. A future override
// (e.g. "play even in silent mode") can flip `overrideAllow`.
// ============================================================

import { isAndroidNativeApp } from "./androidFreezeDiagnostics";

export type RingerMode = "normal" | "vibrate" | "silent" | "unknown";

interface RingerModePlugin {
  getMode(): Promise<{ mode: RingerMode }>;
}

let cached: RingerMode = "unknown";
let polling = false;
let bound = false;

function getPlugin(): RingerModePlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, unknown>; isNativePlatform?: () => boolean };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  const plugin = cap.Plugins?.["RingerMode"] as RingerModePlugin | undefined;
  return plugin ?? null;
}

async function refresh(): Promise<void> {
  const plugin = getPlugin();
  if (!plugin) return;
  if (polling) return;
  polling = true;
  try {
    const res = await plugin.getMode();
    if (res?.mode === "normal" || res?.mode === "vibrate" || res?.mode === "silent") {
      cached = res.mode;
    }
  } catch {
    /* keep last known */
  } finally {
    polling = false;
  }
}

/** Install lifecycle listeners + prime cache. Safe to call multiple times. */
export function initAndroidSilentMode(): void {
  if (bound || typeof window === "undefined") return;
  if (!isAndroidNativeApp()) return;
  bound = true;
  void refresh();
  // Re-check on resume / focus — user may have toggled the hardware switch
  // while the app was backgrounded.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });
  window.addEventListener("focus", () => { void refresh(); });
  // Capacitor App resume event (if @capacitor/app present).
  try {
    const cap = (window as unknown as {
      Capacitor?: { Plugins?: { App?: { addListener?: (ev: string, cb: () => void) => void } } };
    }).Capacitor;
    cap?.Plugins?.App?.addListener?.("appStateChange", () => { void refresh(); });
  } catch { /* ignore */ }
}

/** Synchronous gate. Returns false ONLY when we know device is silenced. */
export function deviceAllowsAudio(): boolean {
  if (typeof window === "undefined") return true;
  if (!isAndroidNativeApp()) return true; // non-Android: rely on browser/OS
  // Until the first probe resolves, default to allowing audio so cold-start
  // SFX aren't suppressed for normal users. The cache fills within the first
  // tick on real devices.
  if (cached === "unknown") return true;
  return cached === "normal";
}

/** Test hook / future setting bridge. */
export function _setRingerModeForTest(mode: RingerMode): void {
  cached = mode;
}
