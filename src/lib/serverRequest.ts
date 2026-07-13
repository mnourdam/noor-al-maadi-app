// Native-safe HTTP transport for APK → backend calls.
//
// On the web (including Lovable preview and any browser) this is a thin
// wrapper around the standard `fetch` API and returns a real `Response`.
// On Capacitor Android the WebView's fetch is subject to the WebView's
// same-origin / CORS rules and returns opaque `TypeError: Failed to fetch`
// for cross-origin backend calls. To bypass that we route native requests
// through `CapacitorHttp`, which performs the HTTP call in the native Java
// layer and hands the response body back to JS.
//
// The returned object exposes the small surface every caller in this app
// actually uses: `ok`, `status`, `headers.get(name)`, `text()`, `json()`,
// `clone()`. That keeps existing call sites almost unchanged.

import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { getServerApiUrl } from "@/lib/serverApi";

export interface ServerResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  clone(): ServerResponse;
}

export interface ServerRequestInit {
  method?: string;
  headers?: Record<string, string>;
  /** Object bodies are JSON-encoded. Strings are sent as-is. */
  body?: unknown;
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function normalizeHeaders(h?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const k of Object.keys(h)) out[k] = h[k];
  return out;
}

function makeHeadersView(h: Record<string, string>): { get(name: string): string | null } {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(h)) lower[k.toLowerCase()] = h[k];
  return { get: (name) => (lower[name.toLowerCase()] ?? null) };
}

function wrapNative(status: number, headers: Record<string, string>, rawBody: unknown): ServerResponse {
  const text = typeof rawBody === "string" ? rawBody : rawBody == null ? "" : JSON.stringify(rawBody);
  const parsedJson: unknown = typeof rawBody === "object" && rawBody != null ? rawBody : undefined;
  const view = makeHeadersView(headers);
  const self: ServerResponse = {
    ok: status >= 200 && status < 300,
    status,
    headers: view,
    async text() { return text; },
    async json<T = unknown>(): Promise<T> {
      if (parsedJson !== undefined) return parsedJson as T;
      if (!text) return undefined as unknown as T;
      return JSON.parse(text) as T;
    },
    clone() { return self; },
  };
  return self;
}

function wrapFetch(res: Response): ServerResponse {
  return {
    ok: res.ok,
    status: res.status,
    headers: { get: (n) => res.headers.get(n) },
    text: () => res.text(),
    json: <T,>() => res.json() as Promise<T>,
    clone: () => wrapFetch(res.clone()),
  };
}

/**
 * Perform a backend request. Accepts an app-absolute path
 * (e.g. `/lovable/email/auth-custom/dispatch`) or a full URL. Native builds
 * are routed through CapacitorHttp so the request bypasses the WebView's
 * cross-origin gate; web builds fall through to `fetch`.
 */
export async function serverRequest(
  pathOrUrl: string,
  init: ServerRequestInit = {},
): Promise<ServerResponse> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : getServerApiUrl(pathOrUrl);
  const method = (init.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(init.headers);

  let body: string | undefined;
  if (init.body !== undefined && init.body !== null) {
    if (typeof init.body === "string") {
      body = init.body;
    } else {
      body = JSON.stringify(init.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  if (isNative()) {
    try {
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        // CapacitorHttp accepts an object OR a string; passing the pre-encoded
        // string keeps Content-Type honesty and avoids double-encoding.
        data: body,
      });
      const respHeaders: Record<string, string> = {};
      const rawHeaders = (res.headers ?? {}) as Record<string, string>;
      for (const k of Object.keys(rawHeaders)) respHeaders[k] = String(rawHeaders[k]);
      return wrapNative(res.status ?? 0, respHeaders, res.data);
    } catch (e) {
      // Surface as a real Error so callers can catch/log without leaking
      // request bodies or tokens.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`native_http_error: ${msg}`);
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
  });
  return wrapFetch(res);
}
