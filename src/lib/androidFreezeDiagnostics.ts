/**
 * Production stubs for the former Android freeze diagnostic suite.
 *
 * The Android input freeze was diagnosed and fixed at the root level
 * (RootShell no longer renders <html>/<body> on Capacitor/Android).
 * Ultra-stable mode and heavy instrumentation are no longer needed; the
 * public surface remains so existing call sites continue to compile.
 */

export type AndroidMarkDetail = Record<string, unknown> | undefined;

export function isAndroidNativeApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return /android/i.test(navigator.userAgent) && window.location.protocol === "capacitor:";
}

export function isAndroidUltraStableMode(): boolean {
  return false;
}

export function androidMark(_name: string, _detail?: AndroidMarkDetail): void {
  /* no-op in production */
}

export function androidMeasure(_name: string, _startedAt?: number, _detail?: AndroidMarkDetail): void {
  /* no-op in production */
}


export function recordAndroidAction(_name: string, _detail?: AndroidMarkDetail): void {
  /* no-op in production */
}

export function installAndroidFreezeDiagnostics(): void {
  /* no-op in production */
}
