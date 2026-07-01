import type { FeedbackContext } from "./types";

export function detectPlatform(): string {
  if (typeof window === "undefined") return "server";
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };
  if (w.Capacitor?.isNativePlatform?.()) return w.Capacitor.getPlatform?.() ?? "native";
  return "web";
}

export function captureRouteContext(extra: Partial<FeedbackContext> = {}): FeedbackContext {
  if (typeof window === "undefined") return { ...extra };
  return {
    route: window.location.pathname + window.location.search,
    platform: detectPlatform(),
    locale: document?.documentElement?.lang || "ar",
    app_version: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_VERSION,
    ...extra,
  };
}

/**
 * Build the URL that opens /feedback/new pre-loaded with page context.
 * Context is serialized in a `ctx` query param (URL-encoded JSON).
 */
export function feedbackNewUrl(ctx: Partial<FeedbackContext> = {}): string {
  const full = captureRouteContext(ctx);
  try {
    const encoded = encodeURIComponent(JSON.stringify(full));
    return `/feedback/new?ctx=${encoded}`;
  } catch {
    return "/feedback/new";
  }
}

export function parseCtxParam(raw: string | undefined | null): FeedbackContext {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return typeof parsed === "object" && parsed ? (parsed as FeedbackContext) : {};
  } catch {
    return {};
  }
}
