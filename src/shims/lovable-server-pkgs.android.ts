// Android/Capacitor stub for Lovable server-only packages.
// These modules (`@lovable.dev/webhooks-js`, `@lovable.dev/email-js`) are
// only used by server route handlers that never execute inside the APK
// WebView. They are aliased to this stub in `vite.android.config.ts` so the
// client bundle can resolve the imports without pulling in server code.

export class WebhookError extends Error {
  code = "unavailable";
}

export async function verifyWebhookRequest(): Promise<never> {
  throw new Error("verifyWebhookRequest is not available in the Android build");
}

export async function sendLovableEmail(): Promise<never> {
  throw new Error("sendLovableEmail is not available in the Android build");
}

export function parseEmailWebhookPayload(): never {
  throw new Error("parseEmailWebhookPayload is not available in the Android build");
}
