/**
 * Canonical external-URL policy for notifications (V16).
 *
 * ONE pure validator, shared by:
 *   1. the Admin composer (before send)
 *   2. the `send-notification` Edge Function (mirrored in
 *      `supabase/functions/send-notification/external-url.ts`)
 *   3. the client at tap time (never trust a stored/FCM value)
 *
 * Policy: absolute `https://` URLs only, with a real host and no
 * embedded credentials. Everything else fails closed.
 */

export type ExternalUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Arabic, user-facing errors — never raw technical detail. */
export const EXTERNAL_URL_ERRORS = {
  empty: "أدخل الرابط الخارجي.",
  scheme: "يجب أن يبدأ الرابط بـ https://",
  invalid: "الرابط الخارجي غير صالح.",
  credentials: "الرابط الخارجي غير صالح.",
} as const;

export function validateExternalUrl(raw: unknown): ExternalUrlResult {
  if (typeof raw !== "string") return { ok: false, error: EXTERNAL_URL_ERRORS.empty };
  // Harmless surrounding whitespace (including newlines pasted from chat)
  // is normalized away; interior whitespace is NOT — it makes the URL
  // malformed and must be rejected by the parser below.
  const value = raw.trim();
  if (!value) return { ok: false, error: EXTERNAL_URL_ERRORS.empty };
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: EXTERNAL_URL_ERRORS.invalid };

  // Protocol-relative and relative values never reach the parser as an
  // absolute URL — reject explicitly so the message is meaningful.
  if (value.startsWith("//") || value.startsWith("/")) {
    return { ok: false, error: EXTERNAL_URL_ERRORS.scheme };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: EXTERNAL_URL_ERRORS.invalid };
  }

  // Parse-based protocol check — never a string prefix test.
  if (parsed.protocol !== "https:") return { ok: false, error: EXTERNAL_URL_ERRORS.scheme };
  if (parsed.username || parsed.password) return { ok: false, error: EXTERNAL_URL_ERRORS.credentials };
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, error: EXTERNAL_URL_ERRORS.invalid };
  }

  return { ok: true, url: parsed.toString() };
}

export function isValidExternalUrl(raw: unknown): boolean {
  return validateExternalUrl(raw).ok;
}
