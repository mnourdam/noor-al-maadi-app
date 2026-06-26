/**
 * Android Quiet-Mode bisection harness.
 *
 * Diagnostic finding (June 2026): the Capacitor-minimal input test typed
 * fine, but the full Irth app path froze inputs on the same WebView. So the
 * cause is NOT Capacitor itself — it is one of the global subsystems that
 * the full app boots: push notifications, audio init, friend poller,
 * back-navigation guard, splash, achievement/level watchers, the Android
 * back handler, the heartbeat / auth-state listener, orientation lock,
 * ledger / offline sync, etc.
 *
 * Quiet mode disables each of those by default on Android-Capacitor so we
 * can confirm the freeze goes away, then re-enable them one-by-one via:
 *
 *   localStorage.setItem("irth.android.enable", "push,audio,splash,...")
 *   // or
 *   localStorage.setItem("irth.android.enable", "all")
 *
 * On the web, all sections are always enabled — quiet mode is a no-op.
 *
 * Sections (must match every gated subsystem):
 *   push, audio, friendPoller, backNavGuard, achievement, levelUp,
 *   splash, firstLaunch, backHandler, heartbeat, orientationLock,
 *   ledger, offlineSnapshot, orphanUnlocks, authListener
 */

export type AndroidQuietSection =
  | "push"
  | "audio"
  | "friendPoller"
  | "backNavGuard"
  | "achievement"
  | "levelUp"
  | "splash"
  | "firstLaunch"
  | "backHandler"
  | "heartbeat"
  | "orientationLock"
  | "ledger"
  | "offlineSnapshot"
  | "orphanUnlocks"
  | "authListener";

const STORAGE_KEY = "irth.android.enable";

let cachedEnabled: Set<string> | null = null;

function isAndroidCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    }).Capacitor;
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

function readEnabledSet(): Set<string> {
  if (cachedEnabled) return cachedEnabled;
  const set = new Set<string>();
  try {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("aenable");
      if (q) q.split(",").forEach((s) => set.add(s.trim()));
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) raw.split(",").forEach((s) => set.add(s.trim()));
    }
  } catch { /* ignore */ }
  cachedEnabled = set;
  return set;
}

/**
 * True when the named subsystem should run.
 * - Off Android: always true.
 * - On Android: true only when "all" or the section name is in the enable list.
 */
export function isSectionEnabled(section: AndroidQuietSection): boolean {
  if (!isAndroidCapacitor()) return true;
  const set = readEnabledSet();
  if (set.has("all")) return true;
  return set.has(section);
}

/** True when quiet mode is actively suppressing subsystems on this device. */
export function isAndroidQuietActive(): boolean {
  if (!isAndroidCapacitor()) return false;
  const set = readEnabledSet();
  return !set.has("all");
}

/**
 * Quick helper for the console:
 *   __irthAndroidEnable("all")          → re-enable everything
 *   __irthAndroidEnable("push,audio")   → only push + audio
 *   __irthAndroidEnable("")             → quiet (default)
 */
if (typeof window !== "undefined") {
  (window as unknown as { __irthAndroidEnable?: (v: string) => void }).__irthAndroidEnable = (v: string) => {
    try {
      if (v) window.localStorage.setItem(STORAGE_KEY, v);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    cachedEnabled = null;
    // eslint-disable-next-line no-console
    console.warn("[android:quiet] enable list set to:", v || "(none) — reload to apply");
  };
}
