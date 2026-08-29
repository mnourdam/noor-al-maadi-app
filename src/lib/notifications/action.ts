/**
 * Canonical notification ACTION resolver (V16).
 *
 * Every tap surface — push tap, in-app banner, Notification Center —
 * consumes this single contract:
 *
 *   { kind: "internal", path }   → navigate inside Irth (unchanged legacy behavior)
 *   { kind: "external", url }    → open a validated https:// site
 *   { kind: "none" }             → nothing to open
 *
 * Fail-closed rules:
 *  - a stored/FCM `external_url` is RE-VALIDATED at tap time
 *  - an unsafe/malformed external action resolves to `none` — it is never
 *    silently converted into an internal route
 *  - if both an internal deep_link and an external url are present, the
 *    action is refused (`none`); the server rejects such sends already
 */

import {
  resolveDeepLink,
  isInformationalNotification,
  type NotificationLike,
  type NotificationPayload,
} from "./deepLink";
import { validateExternalUrl } from "./externalUrl";

export type NotificationAction =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string }
  | { kind: "none" };

function rawExternal(n: NotificationLike): string | null {
  const payload = (n.payload ?? {}) as NotificationPayload;
  const v = payload["external_url"];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function resolveNotificationAction(n: NotificationLike): NotificationAction {
  const external = rawExternal(n);
  if (external) {
    const hasInternal = typeof n.deep_link === "string" && n.deep_link.trim() !== "";
    // Ambiguous action → fail closed rather than guessing.
    if (hasInternal) return { kind: "none" };
    const res = validateExternalUrl(external);
    if (!res.ok) return { kind: "none" };
    return { kind: "external", url: res.url };
  }

  if (isInformationalNotification(n)) {
    const id = (n as { id?: string | null }).id;
    // Informational entries stay inside the Notification Center; keep the
    // exact legacy destination resolveDeepLink already produces.
    return { kind: "internal", path: resolveDeepLink({ ...n, id } as NotificationLike) };
  }

  return { kind: "internal", path: resolveDeepLink(n) };
}

/**
 * Open a validated external URL.
 *
 * Android/native → Capacitor Browser (in-app browser), Web → new tab with
 * `noopener,noreferrer`. Never called on receipt — only from an explicit
 * user tap. Failures never crash the app; the user stays inside Irth.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const res = validateExternalUrl(url);
  if (!res.ok) return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform?.()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: res.url });
      return true;
    }
  } catch (err) {
    console.warn("[notifications] native external open failed", err);
  }
  try {
    if (typeof window === "undefined") return false;
    const win = window.open(res.url, "_blank", "noopener,noreferrer");
    if (win) return true;
    window.location.href = res.url;
    return true;
  } catch (err) {
    console.warn("[notifications] external open failed", err);
    return false;
  }
}
