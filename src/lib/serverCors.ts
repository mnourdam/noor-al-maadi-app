// Shared CORS helper for server routes callable from the native Capacitor
// APK. The APK WebView uses `https://localhost` (or `http://localhost`) as
// its origin, so cross-origin fetches to the published backend require
// explicit CORS + OPTIONS handling. Web callers stay same-origin and skip
// preflight entirely.

const ALLOWED_ORIGINS = new Set<string>([
  "https://localhost",
  "http://localhost",
  "capacitor://localhost",
  // Legacy origin — MUST stay: V15 Android hardcodes this host for every
  // /api/public/* and /lovable/email/* call. Never remove.
  "https://irth-develop.lovable.app",
  "https://irth.lovable.app",
  // Public web domain (additive only).
  "https://playirth.com",
  "https://www.playirth.com",
]);

const ALLOWED_ORIGIN_SUFFIXES = [
  ".lovable.app",
  ".lovable.dev",
];

function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  try {
    const host = new URL(origin).hostname;
    if (ALLOWED_ORIGIN_SUFFIXES.some((s) => host.endsWith(s))) return origin;
  } catch {
    /* ignore */
  }
  return null;
}

export function corsHeadersFor(request: Request): Record<string, string> {
  const origin = resolveAllowedOrigin(request.headers.get("origin"));
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Accept, Origin",
    "Access-Control-Max-Age": "86400",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export function withCors(request: Request, response: Response): Response {
  const cors = corsHeadersFor(request);
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) merged.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
