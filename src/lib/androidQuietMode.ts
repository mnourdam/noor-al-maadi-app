/**
 * Production stub for the former Android Quiet-Mode bisection harness.
 *
 * The Android input freeze was diagnosed and fixed at the root level
 * (RootShell no longer renders <html>/<body> on Capacitor/Android).
 * All previously gated subsystems run normally on every platform now.
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

export function isSectionEnabled(_section: AndroidQuietSection): boolean {
  return true;
}

export function isAndroidQuietActive(): boolean {
  return false;
}
