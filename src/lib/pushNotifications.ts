/**
 * Push notifications setup for the native Android (Capacitor) build.
 *
 * On the web this is a no-op — `@capacitor/push-notifications` only works
 * inside the native shell. When a token is received from FCM we log it and
 * upsert it into the `device_tokens` table for the currently signed-in user.
 * If no user is signed in yet, we cache the token and persist it on the
 * next sign-in (see `flushPendingDeviceToken`).
 */

import { supabase } from "@/integrations/supabase/client";

let initialized = false;
let pendingToken: string | null = null;

function safeParse(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

const PENDING_TOKEN_KEY = "irth.pendingFcmToken";

function readPending(): string | null {
  if (pendingToken) return pendingToken;
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(PENDING_TOKEN_KEY);
    }
  } catch {}
  return null;
}

function writePending(token: string | null) {
  pendingToken = token;
  try {
    if (typeof localStorage !== "undefined") {
      if (token) localStorage.setItem(PENDING_TOKEN_KEY, token);
      else localStorage.removeItem(PENDING_TOKEN_KEY);
    }
  } catch {}
}

// PR7: cap retries — never loop forever on persistent failure.
const MAX_TOKEN_SAVE_ATTEMPTS = 3;
let tokenSaveAttempts = 0;
let tokenSaveDisabledReason: string | null = null;

/** Read-only view of the retry state. UI can surface a non-blocking banner. */
export function getPushTokenSaveState(): { disabled: boolean; attempts: number; reason: string | null } {
  return { disabled: tokenSaveAttempts >= MAX_TOKEN_SAVE_ATTEMPTS, attempts: tokenSaveAttempts, reason: tokenSaveDisabledReason };
}

/** Call after a successful manual retry or sign-in to allow saveDeviceToken to try again. */
export function resetPushTokenSaveAttempts(): void {
  tokenSaveAttempts = 0;
  tokenSaveDisabledReason = null;
}

export async function saveDeviceToken(token: string): Promise<void> {
  if (!token) return;
  if (tokenSaveAttempts >= MAX_TOKEN_SAVE_ATTEMPTS) {
    console.warn("[push] token save skipped: max attempts reached", tokenSaveDisabledReason);
    return;
  }
  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      console.log("[push] token save skipped: no user yet");
      writePending(token);
      return; // not a failed attempt — we just have no user to attach to.
    }

    console.log("[push] saving token to Supabase");
    const { error } = await supabase
      .from("device_tokens")
      .upsert(
        {
          user_id: userData.user.id,
          token,
          platform: "android",
          enabled: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );

    if (error) {
      tokenSaveAttempts += 1;
      tokenSaveDisabledReason = error.message;
      console.error("[push] token save failed", error, "attempts:", tokenSaveAttempts);
      writePending(token);
      if (tokenSaveAttempts >= MAX_TOKEN_SAVE_ATTEMPTS && typeof window !== "undefined") {
        // Non-blocking banner — UI listens to this event and shows a toast.
        window.dispatchEvent(new CustomEvent("irth:push:save-disabled", { detail: { reason: error.message } }));
      }
      return;
    }

    console.log("[push] token saved");
    tokenSaveAttempts = 0;
    tokenSaveDisabledReason = null;
    writePending(null);
  } catch (err) {
    tokenSaveAttempts += 1;
    tokenSaveDisabledReason = err instanceof Error ? err.message : String(err);
    console.error("[push] token save failed", err, "attempts:", tokenSaveAttempts);
    writePending(token);
    if (tokenSaveAttempts >= MAX_TOKEN_SAVE_ATTEMPTS && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:push:save-disabled", { detail: { reason: tokenSaveDisabledReason } }));
    }
  }
}

export async function flushPendingDeviceToken(): Promise<void> {
  const t = readPending();
  if (!t) return;
  await saveDeviceToken(t);
}

export async function initPushNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;




  try {
    const { Capacitor } = await import("@capacitor/core");
    console.log("[push] init start");
    console.log("[push] platform:", Capacitor.getPlatform());
    console.log("[push] isNativePlatform:", Capacitor.isNativePlatform());

    if (!Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
      console.log("[push] skipped: web/SSR");
      return;
    }
    if (Capacitor.getPlatform() !== "android") {
      console.log("[push] skipped: not android");
      return;
    }

    const { PushNotifications } = await import("@capacitor/push-notifications");

    // 1. Permission
    let perm = await PushNotifications.checkPermissions();
    console.log("[push] permission (check):", perm);
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
      console.log("[push] permission (request):", perm);
    }
    if (perm.receive !== "granted") {
      console.warn("[push] permission not granted:", perm.receive);
      return;
    }

    // 2. Listeners — register BEFORE calling register()
    await PushNotifications.addListener("registration", (token) => {
      console.log("[push] ✅ FCM token:", token.value);
      // Persist to Supabase (or stash for later if not signed in yet).
      saveDeviceToken(token.value).catch((err) =>
        console.error("[push] token save failed", err),
      );
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[push] ❌ registration error:", err);
    });

    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("[push] 📩 received:", notification);
        // Foreground arrival: surface the cinematic in-app banner. The
        // Notification Center copy is created server-side by the
        // send-notification function so the bell badge updates via the
        // realtime subscription as well.
        try {
          const data = (notification.data ?? {}) as Record<string, string>;
          const notifId = data.notification_id || data.id;
          if (!notifId) return;
          const detail = {
            id: notifId,
            title: notification.title ?? data.title ?? "إشعار",
            body: notification.body ?? data.body ?? "",
            type: data.type ?? null,
            category: data.category ?? data.type ?? null,
            image_url: data.image_url ?? data.image ?? null,
            deep_link: data.deep_link ?? null,
            // Foreground arrival NEVER opens anything automatically — the
            // external action is only carried so a tap can act on it.
            payload: {
              ...safeParse(data.payload),
              ...(data.external_url ? { external_url: data.external_url } : {}),
            },
          };
          window.dispatchEvent(new CustomEvent("irth:notifications:banner", { detail }));
          window.dispatchEvent(new CustomEvent("irth:notifications:updated"));
        } catch (err) {
          console.warn("[push] banner dispatch failed", err);
        }
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("[push] 👆 action performed:", action);
        // Background tap: resolve the canonical action (internal route or
        // validated external https link). Never auto-opens on receipt —
        // this handler only runs after an explicit user tap.
        try {
          const data = (action.notification?.data ?? {}) as Record<string, string>;
          const notifId = data.notification_id || data.id;
          import("@/lib/notifications/server").then(({ markNotificationRead }) => {
            if (notifId) void markNotificationRead(notifId);
          });
          const payload = safeParse(data.payload);
          if (typeof data.external_url === "string" && data.external_url) {
            (payload as Record<string, unknown>).external_url = data.external_url;
          }
          import("@/lib/notifications/action").then(({ resolveNotificationAction, openExternalUrl }) => {
            const resolved = resolveNotificationAction({
              type: data.type ?? null,
              category: data.category ?? data.type ?? null,
              deep_link: data.deep_link ?? null,
              payload,
            });
            if (resolved.kind === "external") {
              void openExternalUrl(resolved.url);
              return;
            }
            if (resolved.kind === "none") return;
            if (typeof window !== "undefined") {
              window.location.href = resolved.path;
            }
          });
        } catch (err) {
          console.warn("[push] action resolution failed", err);
        }
      },
    );

    // 3. Register with FCM
    await PushNotifications.register();
    console.log("[push] register() called — waiting for token…");
  } catch (err) {
    console.error("[push] init failed:", err);
  }
}
