// Native Google OAuth flow for the Capacitor APK.
//
// Why this exists: in-WebView Google sign-in is unreliable (Google blocks it,
// session state stuck inside the WebView, broker iframe flows don't apply).
// On Android we open Google's consent screen in a Chrome Custom Tab via
// @capacitor/browser, then capture the redirect via a custom-scheme deep link
// and finalize the PKCE exchange inside the app so the session lives in the
// app's own Supabase client (auto-refresh + FCM registration keep working).

import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";

// Published web callback that bounces back to the custom scheme. Must be
// allow-listed in Supabase auth redirect URLs (the lovable.app domain is
// auto-allowed). The `?native=1` flag tells /auth/callback to redirect to the
// custom scheme instead of exchanging the code itself.
const NATIVE_REDIRECT_URL =
  "https://irth-develop.lovable.app/auth/callback?native=1";

// Important: native Google sign-in must use the Lovable OAuth broker, not the
// raw backend /auth/v1/authorize endpoint. The raw backend provider can be
// disabled or missing a project-local OAuth secret while the broker has the
// managed Google credentials. Using the broker also matches the published web
// flow and avoids the APK error: "Unsupported provider: missing OAuth secret".
const NATIVE_OAUTH_BROKER_URL = "https://irth-develop.lovable.app/~oauth/initiate";
const NATIVE_OAUTH_STATE_KEY = "irth-native-oauth-state";

// Custom scheme registered in AndroidManifest.xml (intent-filter on
// MainActivity). Matches Capacitor's appId.
export const NATIVE_DEEP_LINK_SCHEME = "app.lovable.irth";
export const NATIVE_DEEP_LINK_HOST = "auth";
export const NATIVE_DEEP_LINK_PATH = "/callback";

export function isCapacitorNative(): boolean {
  try {
    if (Capacitor.isNativePlatform()) return true;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export async function signInWithGoogleNative(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Browser } = await import("@capacitor/browser");

    const state = generateNativeOAuthState();
    try { window.sessionStorage.setItem(NATIVE_OAUTH_STATE_KEY, state); } catch { /* ignore */ }
    const params = new URLSearchParams({
      provider: "google",
      redirect_uri: NATIVE_REDIRECT_URL,
      state,
    });
    const oauthUrl = `${NATIVE_OAUTH_BROKER_URL}?${params.toString()}`;

    // Required QA signal: this must be a Lovable broker URL, never the raw
    // backend `/auth/v1/authorize` URL that lacks Google OAuth credentials.
    console.info(`Google OAuth URL: ${oauthUrl}`);
    if (oauthUrl.includes(".supabase.co/auth/v1/authorize")) {
      return { ok: false, error: "Invalid Google OAuth endpoint" };
    }

    await Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function generateNativeOAuthState(): string {
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

function collectDeepLinkParams(url: URL): URLSearchParams {
  const params = new URLSearchParams(url.search);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => params.set(key, value));
  }
  return params;
}

// Registered once at app boot (android-client.tsx). Listens for the OS handing
// the custom-scheme URL back after Google auth, exchanges the PKCE code for a
// session inside the app, closes the Custom Tab, and lets onAuthStateChange
// drive the rest (profile sync, FCM token registration, redirects).
let listenerInstalled = false;
export async function installNativeAuthDeepLinkListener(): Promise<void> {
  if (listenerInstalled) return;
  listenerInstalled = true;
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", async (event: { url: string }) => {
      const url = event?.url ?? "";
      if (!url.startsWith(`${NATIVE_DEEP_LINK_SCHEME}://`)) return;

      try {
        // Parse query + hash from the deep link. The Lovable OAuth broker can
        // return tokens in the URL fragment; the legacy direct backend flow
        // returned a PKCE code in the query string.
        const u = new URL(url);
        const params = collectDeepLinkParams(u);
        const state = params.get("state");
        const expectedState = (() => {
          try { return window.sessionStorage.getItem(NATIVE_OAUTH_STATE_KEY); } catch { return null; }
        })();
        try { window.sessionStorage.removeItem(NATIVE_OAUTH_STATE_KEY); } catch { /* ignore */ }

        if (expectedState && state && state !== expectedState) {
          console.error("[native-auth] state mismatch");
          return;
        }

        const code = params.get("code");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription =
          params.get("error_description") || params.get("error");

        if (errorDescription) {
          console.error("[native-auth] provider error", errorDescription);
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) console.error("[native-auth] session set failed", error.message);
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("[native-auth] exchange failed", error.message);
        }
      } catch (e) {
        console.error("[native-auth] deep-link parse failed", e);
      } finally {
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch { /* ignore */ }
        try {
          // Route the user to their profile/home after sign-in.
          if (typeof window !== "undefined") {
            const target = "/profile";
            if (window.location.pathname !== target) {
              window.history.replaceState(null, "", target);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          }
        } catch { /* ignore */ }
      }
    });
  } catch (e) {
    console.error("[native-auth] listener install failed", e);
  }
}
