/**
 * Push notifications setup for the native Android (Capacitor) build.
 *
 * On the web this is a no-op — `@capacitor/push-notifications` only works
 * inside the native shell. We only log the FCM token for now; persisting
 * it to the backend will come in a later step.
 */

let initialized = false;

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
      // The FCM device token. Copy this from logcat / Chrome remote
      // devtools console to send a test push from Firebase Console.
      console.log("[push] ✅ FCM token:", token.value);
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
