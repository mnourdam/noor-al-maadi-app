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

      let exchangedOk = false;
      let exchangeError: string | null = null;
      try {
        const u = new URL(url);
        const params = collectDeepLinkParams(u);

        const code = params.get("code");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription =
          params.get("error_description") || params.get("error");

        // Sanity: log whether the PKCE verifier is present in this instance's
        // localStorage. If it's missing here, `exchangeCodeForSession` will
        // fail — meaning the OAuth start and the callback ran against
        // different Supabase client instances / storages.
        try {
          if (typeof localStorage !== "undefined") {
            const verifierKeys = Object.keys(localStorage).filter((k) =>
              k.includes("code-verifier") || k.endsWith("-code-verifier"),
            );
            console.info(
              "[native-auth] pkce verifier keys in localStorage:",
              verifierKeys.length,
              verifierKeys,
            );
          }
        } catch { /* ignore */ }

        if (errorDescription) {
          exchangeError = errorDescription;
          console.error("[native-auth] provider error", errorDescription);
        } else if (accessToken && refreshToken) {
          console.info("[native-auth] setSession from hash tokens");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            exchangeError = error.message;
            console.error("[native-auth] setSession failed", error.message);
          } else {
            exchangedOk = !!data.session;
            console.info("[native-auth] setSession OK user=", data.session?.user?.id);
          }
        } else if (code) {
          console.info("[native-auth] exchangeCodeForSession start code.len=", code.length);
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            exchangeError = error.message;
            console.error("[native-auth] exchange failed:", error.message);
          } else {
            exchangedOk = !!data.session;
            console.info(
              "[native-auth] exchange OK user=",
              data.session?.user?.id,
              "email=",
              data.session?.user?.email,
            );
          }
        } else {
          exchangeError = "الرابط لا يحتوي على رمز مصادقة";
          console.warn("[native-auth] deep link had no code/token/error");
        }

        if (exchangedOk) {
          const { data: sess } = await supabase.auth.getSession();
          console.info(
            "[native-auth] getSession after exchange -> user=",
            sess.session?.user?.id ?? "(none)",
          );
          if (!sess.session) {
            exchangedOk = false;
            exchangeError = exchangeError ?? "لم يتم حفظ الجلسة داخل التطبيق";
          }
        }
      } catch (e) {
        exchangeError = e instanceof Error ? e.message : String(e);
        console.error("[native-auth] deep-link handler crashed:", exchangeError);
      } finally {
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch { /* ignore */ }

        if (exchangedOk) {
          // Wait for the account provider to see SIGNED_IN before we navigate,
          // so /profile does not render a Guest flash while onAuthStateChange
          // is still propagating.
          await waitForSignedIn(3000);
          try {
            if (typeof window !== "undefined") {
              // Full reload is the most reliable way to force the router,
              // account provider, and all queries to re-hydrate with the
              // freshly persisted Supabase session inside the APK WebView.
              window.location.replace("/profile");
            }
          } catch { /* ignore */ }
        } else {
          try {
            if (typeof window !== "undefined") {
              const msg = exchangeError
                ? `تعذر إكمال تسجيل الدخول عبر Google: ${exchangeError}`
                : "تعذر إكمال تسجيل الدخول عبر Google. حاول مرة أخرى.";
              const w = window as unknown as { alert?: (m: string) => void };
              w.alert?.(msg);
              window.location.replace("/auth");
            }
          } catch { /* ignore */ }
        }
      }
    });
  } catch (e) {
    console.error("[native-auth] listener install failed", e);
  }
}

async function waitForSignedIn(timeoutMs: number): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return true;
  return new Promise((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        try { sub.subscription.unsubscribe(); } catch { /* ignore */ }
        resolve(true);
      }
    });
    setTimeout(() => {
      try { sub.subscription.unsubscribe(); } catch { /* ignore */ }
      resolve(false);
    }, timeoutMs);
  });
}
