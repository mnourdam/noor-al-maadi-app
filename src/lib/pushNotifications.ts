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

export async function saveDeviceToken(token: string): Promise<void> {
  if (!token) return;
  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      console.log("[push] token save skipped: no user yet");
      writePending(token);
      return;
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
      console.error("[push] token save failed", error);
      writePending(token);
      return;
    }

    console.log("[push] token saved");
    writePending(null);
  } catch (err) {
    console.error("[push] token save failed", err);
    writePending(token);
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
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        console.log("[push] 👆 action performed:", action);
      },
    );

    // 3. Register with FCM
    await PushNotifications.register();
    console.log("[push] register() called — waiting for token…");
  } catch (err) {
    console.error("[push] init failed:", err);
  }
}
