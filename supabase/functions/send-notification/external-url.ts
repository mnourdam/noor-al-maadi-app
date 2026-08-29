// Server-side mirror of `src/lib/notifications/externalUrl.ts`.
// Kept dependency-free so the Edge Function can validate before any row
// is created. Policy MUST stay identical to the client validator.

export type ExternalUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function validateExternalUrl(raw: unknown): ExternalUrlResult {
  if (typeof raw !== "string") return { ok: false, error: "external_url must be a string" };
  const value = raw.trim();
  if (!value) return { ok: false, error: "external_url is empty" };
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: "external_url is malformed" };
  if (value.startsWith("//") || value.startsWith("/")) {
    return { ok: false, error: "external_url must be an absolute https:// URL" };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "external_url is malformed" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "external_url must be an absolute https:// URL" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "external_url must not contain credentials" };
  }
  if (!parsed.hostname || !parsed.hostname.includes(".")) {
    return { ok: false, error: "external_url is malformed" };
  }
  return { ok: true, url: parsed.toString() };
}

/**
 * Resolve the mutually-exclusive action contract for an incoming send body.
 * - internal `deep_link` only        → { kind: "internal" }
 * - `payload.external_url` only      → { kind: "external", url }
 * - both supplied                    → rejected (never guessed)
 * - neither                          → { kind: "none" }
 */
export function resolveRequestAction(body: {
  deep_link?: unknown;
  payload?: unknown;
  external_url?: unknown;
}):
  | { ok: true; kind: "none" | "internal" }
  | { ok: true; kind: "external"; url: string }
  | { ok: false; error: string } {
  const payload = (body.payload && typeof body.payload === "object")
    ? body.payload as Record<string, unknown>
    : {};
  const rawExternal = body.external_url ?? payload["external_url"];
  const hasExternal = typeof rawExternal === "string" && rawExternal.trim() !== "";
  const hasInternal = typeof body.deep_link === "string" && body.deep_link.trim() !== "";

  if (hasExternal && hasInternal) {
    return { ok: false, error: "conflicting action: provide either deep_link or external_url, not both" };
  }
  if (hasExternal) {
    const res = validateExternalUrl(rawExternal);
    if (!res.ok) return res;
    return { ok: true, kind: "external", url: res.url };
  }
  return { ok: true, kind: hasInternal ? "internal" : "none" };
}
