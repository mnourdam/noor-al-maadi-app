// Native Google OAuth flow for the Capacitor APK.
//
// Why this exists: in-WebView Google sign-in is unreliable (Google blocks it,
// session state stuck inside the WebView, broker iframe flows don't apply).
// On Android we open Google's consent screen in a Chrome Custom Tab via
// @capacitor/browser, then capture the redirect via a custom-scheme deep link
// and finalize the PKCE exchange inside the app so the session lives in the
// app's own Supabase client (auto-refresh + FCM registration keep working).

import { supabase } from "@/integrations/supabase/client";

// Published web callback that bounces back to the custom scheme. Must be
// allow-listed in Supabase auth redirect URLs (the lovable.app domain is
// auto-allowed). The `?native=1` flag tells /auth/callback to redirect to the
// custom scheme instead of exchanging the code itself.
const NATIVE_REDIRECT_URL =
  "https://irth-develop.lovable.app/auth/callback?native=1";

// Custom scheme registered in AndroidManifest.xml (intent-filter on
// MainActivity). Matches Capacitor's appId.
export const NATIVE_DEEP_LINK_SCHEME = "app.lovable.irth";
export const NATIVE_DEEP_LINK_HOST = "auth";
export const NATIVE_DEEP_LINK_PATH = "/callback";

export function isCapacitorNative(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export async function signInWithGoogleNative(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { Browser } = await import("@capacitor/browser");

    // skipBrowserRedirect → returns the OAuth URL instead of navigating the
    // WebView. The PKCE verifier is generated and stored in the app's
    // localStorage by supabase-js right now, so the eventual code exchange
    // (also inside the app) will succeed.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.url) return { ok: false, error: "تعذر إنشاء رابط Google" };

    await Browser.open({ url: data.url, presentationStyle: "fullscreen" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
        // Parse query + hash from the deep link.
        const u = new URL(url);
        const code = u.searchParams.get("code");
        const errorDescription =
          u.searchParams.get("error_description") || u.searchParams.get("error");

        if (errorDescription) {
          console.error("[native-auth] provider error", errorDescription);
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
