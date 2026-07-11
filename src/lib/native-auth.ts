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

// Published bounce endpoint that returns an HTML page which immediately
// redirects Chrome Custom Tab to the APK's custom-scheme deep link (with an
// `intent://` fallback and a visible manual link). Must be allow-listed in
// Supabase auth redirect URLs (the lovable.app domain is auto-allowed).
// Chrome Custom Tab does NOT reliably follow a server 302 to a custom
// scheme, hence the bounce page instead of `/auth/callback?native=1`.
const NATIVE_REDIRECT_URL =
  "https://irth-develop.lovable.app/api/public/native-auth-bounce";

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
  console.info("[native-auth] branch=NATIVE redirectTo=", NATIVE_REDIRECT_URL);
  try {
    const { Browser } = await import("@capacitor/browser");

    // Register the deep-link listener before opening the browser so the
    // resume intent from Google → bounce → APK is never missed.
    await installNativeAuthDeepLinkListener();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      console.error("[native-auth] signInWithOAuth failed", error.message);
      return { ok: false, error: error.message };
    }
    const oauthUrl = data.url;
    if (!oauthUrl) return { ok: false, error: "Missing Google OAuth URL" };

    console.info("[native-auth] opening custom tab", oauthUrl);
    await Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
    return { ok: true };
  } catch (e) {
    console.error("[native-auth] unexpected", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
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
      console.info("[native-auth] appUrlOpen received:", url);
      if (!url.startsWith(`${NATIVE_DEEP_LINK_SCHEME}://`)) return;

      try {
        const u = new URL(url);
        const params = collectDeepLinkParams(u);

        const code = params.get("code");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription =
          params.get("error_description") || params.get("error");

        if (errorDescription) {
          console.error("[native-auth] provider error", errorDescription);
        } else if (accessToken && refreshToken) {
          console.info("[native-auth] setSession from hash tokens");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) console.error("[native-auth] session set failed", error.message);
          else console.info("[native-auth] session set OK");
        } else if (code) {
          console.info("[native-auth] exchangeCodeForSession start");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("[native-auth] exchange failed", error.message);
          else console.info("[native-auth] exchange OK");
        } else {
          console.warn("[native-auth] deep link had no code/token/error");
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
