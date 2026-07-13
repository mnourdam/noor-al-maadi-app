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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  computeGoogleAuthResult,
  getAndClearGoogleAuthIntent,
  stashGoogleAuthResult,
} from "@/lib/googleAuthResult";
import { consumeAuthOrigin } from "@/lib/authOrigin";
import { recordTrace } from "@/lib/diag-trace";

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
  recordTrace("native-auth", "native-auth-start");
  console.info("[native-auth] branch=NATIVE redirectTo=", NATIVE_REDIRECT_URL);
  try {
    const { Browser } = await import("@capacitor/browser");

    // Register the deep-link listener before opening the browser so the
    // resume intent from Google → bounce → APK is never missed.
    await installNativeAuthDeepLinkListener();

    const nativeClient = getNativePkceSupabaseClient();
    const { data, error } = await nativeClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: NATIVE_REDIRECT_URL,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      console.error("[native-auth] signInWithOAuth failed", error.message);
      recordTrace("native-auth", "pkce-exchange-failure", error.message);
      return { ok: false, error: error.message };
    }
    const oauthUrl = data.url;
    if (!oauthUrl) return { ok: false, error: "Missing Google OAuth URL" };

    logPkceVerifierState("after signInWithOAuth");
    console.info("[native-auth] opening custom tab", sanitizeOAuthUrl(oauthUrl));
    recordTrace("native-auth", "browser-opened");
    await Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" });
    return { ok: true };
  } catch (e) {
    console.error("[native-auth] unexpected", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

let nativePkceClient: SupabaseClient<Database> | null = null;

function getNativePkceSupabaseClient(): SupabaseClient<Database> {
  if (nativePkceClient) return nativePkceClient;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase config for native OAuth.");
  }
  nativePkceClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return nativePkceClient;
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
let listenerRegistered = false;
export function isNativeAuthListenerInstalled(): boolean { return listenerInstalled; }
export function isNativeAuthListenerRegistered(): boolean { return listenerRegistered; }
export async function installNativeAuthDeepLinkListener(): Promise<void> {
  if (listenerInstalled) {
    console.info("[native-auth] listener already installed — skipping");
    return;
  }
  listenerInstalled = true;
  console.info("[native-auth] listener installed");
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", async (event: { url: string }) => {
      console.info("[native-auth] appUrlOpen fired");
      recordTrace("native-auth", "app-url-open");
      recordTrace("deep-link", "appUrlOpen-fired");
      const url = event?.url ?? "";
      console.info("[native-auth] url=", url ? sanitizeOAuthUrl(url) : "(empty)");
      if (!url) {
        console.info("[native-auth] ignored because url was empty");
        recordTrace("deep-link", "ignored-empty-url");
        return;
      }
      if (!url.startsWith(`${NATIVE_DEEP_LINK_SCHEME}://`)) {
        console.info(`[native-auth] ignored because url did not start with ${NATIVE_DEEP_LINK_SCHEME}://`);
        recordTrace("deep-link", "ignored-wrong-scheme");
        return;
      }

      let exchangedOk = false;
      let exchangeError: string | null = null;
      try {
        const u = new URL(url);
        const params = collectDeepLinkParams(u);
        recordTrace("deep-link", "parsed", `scheme=${u.protocol.replace(":", "")};host=${u.host};path=${u.pathname}`);
        console.info("[app-url-open]", {
          ts: new Date().toISOString(),
          platform: "android",
          stage: "deep-link-received",
          scheme: u.protocol.replace(":", ""),
          host: u.host,
          hasCode: params.has("code"),
          hasState: params.has("state"),
          hasAccessToken: params.has("access_token"),
          hasError: params.has("error") || params.has("error_description"),
          nativeMarker: params.get("native") === "1",
        });
        console.info("[native-auth] appUrlOpen sanitized:", sanitizeOAuthUrl(url));
        console.info("[native-auth] appUrlOpen payload shape:", describeSearchParams(params));

        const code = params.get("code");
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription =
          params.get("error_description") || params.get("error");
        if (code) recordTrace("native-auth", "code-detected");


        // Sanity: log whether the PKCE verifier is present in this instance's
        // localStorage. If it's missing here, `exchangeCodeForSession` will
        // fail — meaning the OAuth start and the callback ran against
        // different Supabase client instances / storages.
        logPkceVerifierState("before exchange");

        if (errorDescription) {
          exchangeError = errorDescription;
          console.info("[native-auth] ignored because provider returned error:", errorDescription);
          console.error("[native-auth] provider error", errorDescription, "payload=", describeSearchParams(params));
        } else if (accessToken && refreshToken) {
          console.info("[native-auth] parsed hash tokens (implicit flow)");
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
            console.info("[native-auth] setSession OK");
          }
        } else if (code) {
          console.info("[native-auth] parsed code (len=", code.length, ")");
          console.info("[native-auth] exchanging code");
          recordTrace("native-auth", "pkce-exchange-start");
          const nativeClient = getNativePkceSupabaseClient();
          const { data, error } = await nativeClient.auth.exchangeCodeForSession(code);
          if (error) {
            exchangeError = error.message;
            console.error("[native-auth] exchange failed:", error.message);
            recordTrace("native-auth", "pkce-exchange-failure", error.message);
          } else {
            console.info("[native-auth] exchange success");
            recordTrace("native-auth", "pkce-exchange-success");
            const { data: mainSess } = await supabase.auth.getSession();
            exchangedOk = !!mainSess.session;
            if (!exchangedOk) {
              exchangeError = "لم يتم حفظ الجلسة داخل التطبيق";
              console.error("[native-auth] main client getSession returned no session after exchange");
            } else {
              console.info("[native-auth] main client hydrated from shared storage");
              recordTrace("native-auth", "session-established");
            }
          }

        } else {
          exchangeError = "الرابط لا يحتوي على رمز مصادقة";
          console.info("[native-auth] ignored because deep link had no code / token / error");
          console.warn("[native-auth] deep link had no code/token/error payload=", describeSearchParams(params));
        }

        if (exchangedOk) {
          const { data: sess } = await supabase.auth.getSession();
          console.info("[native-auth] getSession after exchange hasUser=", Boolean(sess.session?.user?.id));
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
          console.info("[native-auth] browser closing");
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
          console.info("[native-auth] browser closed");
          recordTrace("native-auth", "browser-close");
        } catch (closeErr) {
          console.warn(
            "[native-auth] browser close failed:",
            closeErr instanceof Error ? closeErr.message : String(closeErr),
          );
        }

        if (exchangedOk) {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const intent = getAndClearGoogleAuthIntent();
            stashGoogleAuthResult(
              computeGoogleAuthResult(sess.session?.user, intent),
            );
          } catch { /* ignore */ }

          console.info("[native-auth] waitForSignedIn start");
          const signedIn = await waitForSignedIn(3000);
          console.info("[native-auth] waitForSignedIn done result=", signedIn);
          try {
            if (typeof window !== "undefined") {
              const dest = consumeAuthOrigin("/profile");
              console.info("[native-auth] navigating to", dest);
              window.location.replace(dest);
            }
          } catch { /* ignore */ }
        } else {
          console.info("[native-auth] not navigating — exchange did not succeed");
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
    listenerRegistered = true;
  } catch (e) {
    console.error("[native-auth] listener install failed", e);
  }
}

function logPkceVerifierState(stage: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const verifierKeys = Object.keys(localStorage).filter((k) =>
      k.includes("code-verifier") || k.endsWith("-code-verifier"),
    );
    const described = verifierKeys.map((key) => {
      const value = localStorage.getItem(key) ?? "";
      return `${key}:<len:${value.length}>`;
    });
    console.info("[native-auth] pkce verifier", stage, verifierKeys.length, described);
  } catch { /* ignore */ }
}

function sanitizeOAuthUrl(input: URL | string): string {
  const u = typeof input === "string" ? new URL(input) : new URL(input.toString());
  for (const key of Array.from(u.searchParams.keys())) {
    const value = u.searchParams.get(key) ?? "";
    if (isSensitiveOAuthKey(key)) {
      u.searchParams.set(key, `<len:${value.length}>`);
    }
  }
  if (u.hash) u.hash = "#<fragment-present>";
  return u.toString();
}

function describeSearchParams(params: URLSearchParams): string {
  const entries: string[] = [];
  params.forEach((value, key) => {
    entries.push(`${key}:${isSensitiveOAuthKey(key) ? `<len:${value.length}>` : value}`);
  });
  return entries.length ? entries.join(",") : "(none)";
}

function isSensitiveOAuthKey(key: string): boolean {
  return /(^code$|token|session|jwt|secret|refresh|access|id_token)/i.test(key);
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
