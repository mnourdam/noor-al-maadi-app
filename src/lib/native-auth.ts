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
  getAndClearGoogleAuthIntent,
  resolveGoogleAuthResult,
  stashGoogleAuthResult,
  stashOAuthError,
} from "@/lib/googleAuthResult";

import { consumeAuthOrigin } from "@/lib/authOrigin";
import { recordTrace } from "@/lib/diag-trace";
import { getDurableAuthStorage } from "@/lib/nativeAuthStorage";
import {
  isCodeConsumedDurably,
  isLaunchUrlHandled,
  markCodeConsumedDurably,
  markLaunchUrlHandled,
} from "@/lib/nativeAuthReplayGuard";
import { setRecoveryMode } from "@/lib/recoveryMode";
import { setAuthReady } from "./identity/guard";
import { getActiveOwner } from "./identity/owner";
import { getIdentityEpochSafe } from "./offline/flush";

// Published bounce endpoint that returns an HTML page which immediately
// redirects Chrome Custom Tab to the APK's custom-scheme deep link (with an
// `intent://` fallback and a visible manual link). Must be allow-listed in
// Supabase auth redirect URLs (the lovable.app domain is auto-allowed).
// Chrome Custom Tab does NOT reliably follow a server 302 to a custom
// scheme, hence the bounce page instead of `/auth/callback?native=1`.
const NATIVE_REDIRECT_URL =
  "https://irth-develop.lovable.app/api/public/native-auth-bounce";
const NATIVE_AUTH_STORAGE_KEY = "irth-native-auth";
const NATIVE_CODE_VERIFIER_KEY = `${NATIVE_AUTH_STORAGE_KEY}-code-verifier`;

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

// Bounded await with a persisted trace of the outcome. Guarantees that a
// hung awaited stage cannot silently swallow the diagnostics — the failing
// stage is written to the diag-trace ring even if the promise never resolves.
async function tracedAwait<T>(
  stage: string,
  op: () => Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T; ms: number } | { ok: false; error: string; ms: number; timedOut: boolean }> {
  const t0 = Date.now();
  recordTrace("native-auth", `${stage}-start`);
  try {
    const result = await Promise.race<
      { kind: "ok"; value: T } | { kind: "timeout" }
    >([
      op().then((v) => ({ kind: "ok" as const, value: v })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" as const }), timeoutMs),
      ),
    ]);
    const ms = Date.now() - t0;
    if (result.kind === "timeout") {
      recordTrace("native-auth", `${stage}-timeout`, `${ms}ms`);
      return { ok: false, error: `${stage}-timeout`, ms, timedOut: true };
    }
    recordTrace("native-auth", `${stage}-success`, `${ms}ms`);
    return { ok: true, value: result.value, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    recordTrace("native-auth", `${stage}-error`, `${ms}ms:${msg.slice(0, 80)}`);
    return { ok: false, error: msg, ms, timedOut: false };
  }
}

export async function signInWithGoogleNative(): Promise<{ ok: boolean; error?: string }> {
  recordTrace("pkce-audit", "googleLogin:tap");
  recordTrace("pkce-audit", "activeOwner", getActiveOwner());
  recordTrace("pkce-audit", "identityEpoch", getIdentityEpochSafe());
  if (oauthFlowActive) {
    console.warn("[native-auth] OAUTH_FLOW_ALREADY_ACTIVE — ignoring duplicate tap");
    return { ok: false, error: "هناك عملية تسجيل دخول قيد التنفيذ بالفعل." };
  }

  oauthFlowActive = true;
  recordTrace("native-auth", "native-auth-start");
  console.info("[native-auth] branch=NATIVE redirectTo=", NATIVE_REDIRECT_URL);
  try {
    const browserImport = await tracedAwait(
      "browser-import",
      () => import("@capacitor/browser"),
      3000,
    );
    if (!browserImport.ok) {
      return { ok: false, error: `browser-import:${browserImport.error}` };
    }
    const { Browser } = browserImport.value;

    // Register the deep-link listener before opening the browser so the
    // resume intent from Google → bounce → APK is never missed.
    const listener = await tracedAwait(
      "listener-install",
      () => installNativeAuthDeepLinkListener(),
      3000,
    );
    if (!listener.ok) {
      return { ok: false, error: `listener-install:${listener.error}` };
    }

    // Client creation touches the durable storage adapter at import time.
    // The adapter is localStorage + memory only, so no Capacitor plugin can
    // block before Browser.open().
    const clientInit = await tracedAwait(
      "pkce-client-init",
      async () => {
        const client = getNativePkceSupabaseClient();
        recordTrace("pkce-audit", "pkceClient:create/reuse");
        return client;
      },
      3000,
    );
    if (!clientInit.ok) {
      return { ok: false, error: `pkce-client-init:${clientInit.error}` };
    }
    const nativeClient = clientInit.value;

    const storageTest = await nativeStorageSelfTest();
    if (!storageTest.ok) {
      return { ok: false, error: storageTest.error };
    }

    // signInWithOAuth internally reads/writes the PKCE verifier via the
    // storage adapter.
    const oauth = await tracedAwait(
      "signInWithOAuth",
      () =>
        nativeClient.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: NATIVE_REDIRECT_URL,
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        }),
      8000,
    );
    if (!oauth.ok) {
      return { ok: false, error: `signInWithOAuth:${oauth.error}` };
    }
    const { data, error } = oauth.value;
    if (error) {
      console.error("[native-auth] signInWithOAuth failed", error.message);
      recordTrace("native-auth", "signInWithOAuth-provider-error", error.message);
      return { ok: false, error: error.message };
    }
    const oauthUrl = data.url;
    if (!oauthUrl) {
      recordTrace("native-auth", "signInWithOAuth-missing-url");
      return { ok: false, error: "Missing Google OAuth URL" };
    }
    recordTrace("native-auth", "signInWithOAuth-url", `len=${oauthUrl.length}`);

    // V11: Explicitly await durable persistence before opening the browser.
    // The key is NATIVE_CODE_VERIFIER_KEY, but Supabase also stores the 
    // flow identifier and potentially other metadata under the storageKey.
    // We prioritize the verifier durability.
    const storage = getDurableAuthStorage();
    const persisted = await tracedAwait(
      "pkce-durable-persist",
      () => storage.ensureDurablePersistence(NATIVE_CODE_VERIFIER_KEY),
      3000
    );

    if (!persisted.ok || !persisted.value) {
      console.error("[native-auth] PKCE durability failure before browser-open");
      recordTrace("native-auth", "pkce-durability-failure");
      return { ok: false, error: "تعذر تأمين رمز الدخول بشكل دائم. يرجى المحاولة مرة أخرى." };
    }

    console.info("[native-auth] PKCE verifier persisted durably. opening custom tab", sanitizeOAuthUrl(oauthUrl));
    recordTrace("pkce-audit", "oauth:browser-open");
    const open = await tracedAwait(
      "browser-open",
      () => Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" }),
      5000,
    );
    if (!open.ok) {
      recordTrace("pkce-audit", "oauth:browser-open-failed", open.error);
      return { ok: false, error: `تعذر فتح نافذة تسجيل الدخول: ${open.error}` };
    }

    return { ok: true };
  } catch (e) {
    console.error("[native-auth] unexpected", e);
    recordTrace(
      "native-auth",
      "signInWithGoogleNative-crash",
      e instanceof Error ? e.message : String(e),
    );
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    // Reset flow active state. If browser opened, the callback will handle the next state.
    // If it failed before opening, we must allow retry.
    oauthFlowActive = false;
  }
}

let nativePkceClient: SupabaseClient<Database> | null = null;

/**
 * Nullifies the module-level singleton Supabase client.
 * Called during logout or identity switches to ensure the next native OAuth 
 * flow uses a fresh client instance, preventing PKCE code-verifier mismatches 
 * without affecting durable storage.
 */
export function resetNativePkceClient(): void {
  console.info("[native-auth] resetNativePkceClient called");
  nativePkceClient = null;
}

function getNativePkceSupabaseClient(): SupabaseClient<Database> {
  if (nativePkceClient) return nativePkceClient;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase config for native OAuth.");
  }
  // Durable storage adapter — backed by window.localStorage with an in-memory
  // fallback. The storageKey is deliberately distinct from the main `supabase`
  // client's default key so the two clients cannot fight over the same slot.
  
  nativePkceClient = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      storage: getDurableAuthStorage() as unknown as Storage,
      storageKey: NATIVE_AUTH_STORAGE_KEY,
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

// Idempotency: avoid processing the same authorization code twice.
const processedCodes = new Set<string>();
const inFlightCodes = new Set<string>();
let oauthFlowActive = false;

export function isNativeAuthListenerInstalled(): boolean { return listenerInstalled; }
export function isNativeAuthListenerRegistered(): boolean { return listenerRegistered; }

let callbackCounter = 0;

/** Unified handler for all native auth callbacks (appUrlOpen + getLaunchUrl) */
export async function handleNativeAuthCallback(url: string | null | undefined): Promise<void> {
  const callId = ++callbackCounter;
  if (!url) {
    console.info("[IrthAuth] CALLBACK_IGNORED reason=empty_url");
    return;
  }
  
  if (!url.startsWith(`${NATIVE_DEEP_LINK_SCHEME}://`)) {
    console.info("[IrthAuth] CALLBACK_IGNORED reason=wrong_scheme", url.slice(0, 30));
    return;
  }

  console.info("[IrthAuth] CALLBACK_ACCEPTED", sanitizeOAuthUrl(url));
  recordTrace("pkce-audit", "deeplink:received", `${url.split("?")[0]} (id=${callId})`);
  recordTrace("pkce-audit", "callback:start", `id=${callId}`);
  
  let exchangedOk = false;
  let exchangeError: string | null = null;
  let isRecoveryLink = false;

  try {
    const u = new URL(url);
    const params = collectDeepLinkParams(u);
    const code = params.get("code");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    recordTrace("pkce-audit", "deeplink:url-has-code", !!code);

    // 1. Idempotency & In-Flight Guard.
    //    In-memory Sets protect within one JS context; the durable marker
    //    (fingerprint only, never the raw code) protects across WebView
    //    reloads and Android process restarts.
    if (code) {
      if (processedCodes.has(code) || isCodeConsumedDurably(code)) {
        console.info("[IrthAuth] CALLBACK_ALREADY_PROCESSED", `code_len=${code.length}`);
        recordTrace("native-auth", "callback-already-processed");
        await recoverAndContinueAfterReplay();
        return;
      }
      if (inFlightCodes.has(code)) {
        console.info("[IrthAuth] CALLBACK_IN_FLIGHT_IGNORED", `code_len=${code.length}`);
        recordTrace("native-auth", "callback-in-flight-ignored");
        return;
      }

      // Mark as in-flight IMMEDIATELY before any async work
      inFlightCodes.add(code);
    }

    try {
      const linkType = params.get("type");
      isRecoveryLink = linkType === "recovery";
      if (isRecoveryLink) {
        setRecoveryMode(true);
        recordTrace("native-auth", "OAUTH_RECOVERY_LINK_DETECTED");
      }

      const errorDescription = params.get("error_description") || params.get("error");
      logPkceVerifierState("before exchange");

      if (errorDescription) {
        exchangeError = errorDescription;
        console.error("[IrthAuth] OAUTH_ERROR", errorDescription);
        stashOAuthError({
          reason: errorDescription.toLowerCase().includes("cancel") ? "USER_CANCELLED" : "OAUTH_EXCHANGE_FAILED",
          message: errorDescription,
          ts: Date.now()
        });
      } else if (accessToken && refreshToken) {
        console.info("[IrthAuth] IMPLICIT_FLOW_START");
        recordTrace("native-auth", "IMPLICIT_FLOW_START");
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          exchangeError = error.message;
          stashOAuthError({ reason: "OAUTH_EXCHANGE_FAILED", message: error.message, ts: Date.now() });
        } else {
          exchangedOk = !!data.session;
          recordTrace("native-auth", "SESSION_VERIFIED");
        }
      } else if (code) {
        console.info("[IrthAuth] EXCHANGE_START");
        recordTrace("native-auth", "EXCHANGE_START");
        recordTrace("pkce-audit", "pkce:beforeExchange", JSON.stringify({
          owner: getActiveOwner(),
          epoch: getIdentityEpochSafe()
        }));
        const nativeClient = getNativePkceSupabaseClient();
        const { data, error } = await nativeClient.auth.exchangeCodeForSession(code);
        if (error) {
          exchangeError = error.message;
          console.error("[IrthAuth] EXCHANGE_FAILED", error.message);
          recordTrace("native-auth", "EXCHANGE_FAILED", error.message);
          recordTrace("pkce-audit", "pkce:exchangeFailure", error.message);
          stashOAuthError({ reason: "OAUTH_EXCHANGE_FAILED", message: error.message, ts: Date.now() });
        } else {
          console.info("[IrthAuth] EXCHANGE_SUCCESS");
          recordTrace("native-auth", "EXCHANGE_SUCCESS");
          recordTrace("pkce-audit", "pkce:exchangeSuccess");

          // SUCCESS: Mark as processed to prevent any late duplicate calls from
          // showing errors. The durable marker is written BEFORE any navigation
          // so a WebView reload / process restart cannot replay this code.
          processedCodes.add(code);
          markCodeConsumedDurably(code);
          if (processedCodes.size > 20) {
            const first = processedCodes.values().next().value;
            if (first !== undefined) processedCodes.delete(first);
          }

          const session = data.session;
          if (session?.access_token && session?.refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });
            if (setErr) {
              exchangeError = setErr.message;
              recordTrace("native-auth", "MAIN_SESSION_BRIDGE_FAILED", setErr.message);
            } else {
              exchangedOk = true;
              console.info("[IrthAuth] MAIN_SESSION_READY");
              recordTrace("native-auth", "MAIN_SESSION_READY");
            }
          } else {
            exchangeError = "الجلسة غير مكتملة";
          }
        }
      } else {
        exchangeError = "الرابط غير صالح";
      }

      // TIERED COMPLETION: Only close browser AFTER verifying session
      if (exchangedOk) {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          exchangedOk = false;
          exchangeError = "تعذر تأكيد الجلسة النهائية";
        }
      }
    } finally {
      // Always clear in-flight status so a retry is possible if it failed
      if (code) inFlightCodes.delete(code);
    }
  } catch (e) {
    exchangeError = e instanceof Error ? e.message : String(e);
    console.error("[IrthAuth] CALLBACK_CRASH", exchangeError);
  }

  // BROWSER CLOSURE & NAVIGATION
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    console.info("[IrthAuth] BROWSER_CLOSE");
    recordTrace("native-auth", "browser-close");
  } catch (err) {
    console.warn("[native-auth] Browser.close failed", err);
  }

  if (exchangedOk) {
    console.info("[IrthAuth] AUTH_COMPLETE");
    if (isRecoveryLink) {
      if (typeof window !== "undefined") window.location.replace("/reset-password");
    } else {
      // Post-login sync in background
      (async () => {
        try {
          const { data: userRes } = await supabase.auth.getUser();
          const intent = getAndClearGoogleAuthIntent();
          const kind = await resolveGoogleAuthResult({
            user: userRes.user,
            intent,
            supabase,
          });
          stashGoogleAuthResult(kind);
        } catch { /* ignore */ }
      })();

      const signedIn = await waitForSignedIn(8000);
      if (!signedIn) recordTrace("native-auth", "TIMEOUT_WITH_VALID_SESSION");
      if (typeof window !== "undefined") {
        const dest = consumeAuthOrigin("/profile");
        console.info("[IrthAuth] NAVIGATING to", dest);
        window.location.replace(dest);
      }
    }
  } else {
    console.error("[IrthAuth] AUTH_FAILED", exchangeError);
    if (isRecoveryLink) setRecoveryMode(false);
    if (typeof window !== "undefined") {
      try { window.sessionStorage.setItem("irth.oauth_error.v1", "1"); } catch { /* ignore */ }
      window.location.replace("/auth?oauth_error=1");
    }
  }
}

export async function installNativeAuthDeepLinkListener(): Promise<void> {
  if (listenerInstalled) {
    console.info("[native-auth] listener already installed — checking launch URL");
    try {
      const { App } = await import("@capacitor/app");
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        console.info("[IrthAuth] CALLBACK_LAUNCH_URL caught in double-install check");
        void handleNativeAuthCallback(launch.url);
      }
    } catch { /* ignore */ }
    return;
  }
  
  listenerInstalled = true;
  console.info("[IrthAuth] LISTENER_INSTALLING");
  
  try {
    const { App } = await import("@capacitor/app");
    
    // 1. Capture Warm-Resume events
    await App.addListener("appUrlOpen", async (event: { url: string }) => {
      console.info("[IrthAuth] CALLBACK_APP_URL_OPEN fired");
      void handleNativeAuthCallback(event.url);
    });

    // 2. Capture Cold-Boot events (Recovery Path)
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      console.info("[IrthAuth] CALLBACK_LAUNCH_URL caught during boot");
      recordTrace("native-auth", "cold-boot-intent-captured");
      void handleNativeAuthCallback(launch.url);
    }
    
    listenerRegistered = true;
    console.info("[IrthAuth] LISTENER_READY");
  } catch (e) {
    console.error("[IrthAuth] LISTENER_FAILED", e);
  }
}


function logPkceVerifierState(stage: string): void {
  try {
    // The native PKCE client uses storageKey "irth-native-auth"; gotrue-js
    // stores its verifier under `${storageKey}-code-verifier`.
    void getDurableAuthStorage()
      .getItem(NATIVE_CODE_VERIFIER_KEY)
      .then((value) => {
        const len = value ? value.length : 0;
        console.info("[native-auth] pkce verifier", stage, `<len:${len}>`);
        recordTrace("native-auth", "pkce-verifier-probe", `${stage}:len=${len}`);
      })
      .catch(() => { /* ignore */ });
  } catch { /* ignore */ }
}

async function nativeStorageSelfTest(): Promise<{ ok: true } | { ok: false; error: string }> {
  const storage = getDurableAuthStorage();
  const key = `${NATIVE_AUTH_STORAGE_KEY}-self-test`;
  const value = `ok-${Date.now()}`;
  try {
    await storage.setItem(key, value);
    const roundTrip = await storage.getItem(key);
    await storage.removeItem(key);
    if (roundTrip !== value) {
      recordTrace("native-auth", "storage-self-test-failure", "roundtrip-mismatch");
      return { ok: false, error: "تعذر تجهيز التخزين الآمن لتسجيل الدخول عبر Google. أعد المحاولة." };
    }
    recordTrace("native-auth", "storage-self-test-success");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordTrace("native-auth", "storage-self-test-failure", msg.slice(0, 80));
    return { ok: false, error: "تعذر تجهيز التخزين الآمن لتسجيل الدخول عبر Google. أعد المحاولة." };
  }
}

function readLocalStorageValue(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
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
