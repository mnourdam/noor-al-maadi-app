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
import { setRecoveryMode } from "@/lib/recoveryMode";

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
      async () => getNativePkceSupabaseClient(),
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
    // storage adapter. The adapter is intentionally localStorage + memory only
    // on native so no Capacitor plugin can block Browser.open().
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

    // Atomic storage verification: ensure PKCE verifier is durable before opening browser
    let verifier = readLocalStorageValue(NATIVE_CODE_VERIFIER_KEY);
    if (!verifier) {
      // Best-effort read from memory fallback via durable storage adapter
      verifier = await getDurableAuthStorage().getItem(NATIVE_CODE_VERIFIER_KEY);
    }
    
    const verifierLen = verifier?.length ?? 0;
    recordTrace("native-auth", "pkce-verifier-present", `before browser-open:len=${verifierLen}`);
    
    if (!verifier || verifierLen < 10) {
      console.error("[native-auth] PKCE verifier missing or invalid after signInWithOAuth");
      recordTrace("native-auth", "pkce-verifier-missing-critical");
      return { ok: false, error: "تعذر تأمين رمز الدخول عبر Google. يرجى المحاولة مرة أخرى." };
    }

    console.info("[native-auth] PKCE verifier verified. opening custom tab", sanitizeOAuthUrl(oauthUrl));
    const open = await tracedAwait(
      "browser-open",
      () => Browser.open({ url: oauthUrl, presentationStyle: "fullscreen" }),
      5000,
    );
    if (!open.ok) {
      recordTrace("native-auth", "browser-open-failed", open.error);
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
      let isRecoveryLink = false;
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

        // Idempotency check for codes
        if (code) {
          if (processedCodes.has(code)) {
            console.info("[native-auth] ignoring duplicate appUrlOpen for code (already processed)");
            recordTrace("native-auth", "duplicate-callback-ignored");
            return;
          }
          processedCodes.add(code);
          // Keep the set size bounded
          if (processedCodes.size > 10) {
            const first = processedCodes.values().next().value;
            if (first !== undefined) processedCodes.delete(first);
          }
        }

        const linkType = params.get("type");
        isRecoveryLink = linkType === "recovery";
        // Recovery: lock the app into password-reset mode BEFORE the PKCE
        // exchange so that even if `onAuthStateChange` fires SIGNED_IN before
        // we navigate, the root RecoveryModeGuard force-redirects any route
        // to `/reset-password` and the user cannot access the account.
        if (isRecoveryLink) {
          setRecoveryMode(true);
          recordTrace("native-auth", "OAUTH_RECOVERY_LINK_DETECTED");
        }
        const errorDescription =
          params.get("error_description") || params.get("error");
        if (code) recordTrace("native-auth", "CODE_DETECTED");

        // Sanity: log whether the PKCE verifier is present in this instance's
        // localStorage. If it's missing here, `exchangeCodeForSession` will
        // fail — meaning the OAuth start and the callback ran against
        // different Supabase client instances / storages.
        logPkceVerifierState("before exchange");

        if (errorDescription) {
          exchangeError = errorDescription;
          console.info("[native-auth] ignored because provider returned error:", errorDescription);
          console.error("[native-auth] provider error", errorDescription, "payload=", describeSearchParams(params));
          
          stashOAuthError({
            reason: errorDescription.toLowerCase().includes("cancel") ? "USER_CANCELLED" : "OAUTH_EXCHANGE_FAILED",
            message: errorDescription,
            ts: Date.now()
          });
        } else if (accessToken && refreshToken) {
          console.info("[native-auth] parsed hash tokens (implicit flow)");
          console.info("[native-auth] setSession from hash tokens");
          recordTrace("native-auth", "IMPLICIT_FLOW_START");
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            exchangeError = error.message;
            console.error("[native-auth] setSession failed", error.message);
            stashOAuthError({ reason: "OAUTH_EXCHANGE_FAILED", message: error.message, ts: Date.now() });
          } else {
            exchangedOk = !!data.session;
            console.info("[native-auth] setSession OK");
            recordTrace("native-auth", "SESSION_VERIFIED");
          }

        } else if (code) {
          console.info("[native-auth] parsed code (len=", code.length, ")");
          console.info("[native-auth] exchanging code");
          recordTrace("native-auth", "CODE_EXCHANGE_STARTED");
          const nativeClient = getNativePkceSupabaseClient();
          const { data, error } = await nativeClient.auth.exchangeCodeForSession(code);
          if (error) {
            exchangeError = error.message;
            console.error("[native-auth] exchange failed:", error.message);
            recordTrace("native-auth", "CODE_EXCHANGE_FAILED", error.message);
            stashOAuthError({ reason: "OAUTH_EXCHANGE_FAILED", message: error.message, ts: Date.now() });
          } else {
            console.info("[native-auth] exchange success");
            recordTrace("native-auth", "CODE_EXCHANGE_SUCCESS");
            // The native PKCE client owns a separate storageKey, so the main
            // `supabase` client will NOT auto-hydrate. Copy the tokens across
            // explicitly.
            const session = data.session;
            if (session?.access_token && session?.refresh_token) {
              const { error: setErr } = await supabase.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              });
              if (setErr) {
                exchangeError = setErr.message;
                console.error("[native-auth] main setSession failed:", setErr.message);
                recordTrace("native-auth", "MAIN_CLIENT_SESSION_SET_FAILED", setErr.message);
                stashOAuthError({ reason: "SESSION_NOT_ESTABLISHED", message: setErr.message, ts: Date.now() });
              } else {
                exchangedOk = true;
                recordTrace("native-auth", "MAIN_CLIENT_SESSION_SET_SUCCESS");
                recordTrace("native-auth", "SESSION_VERIFIED");
              }
            } else {
              exchangeError = "الجلسة غير مكتملة";
              console.error("[native-auth] exchange returned no tokens");
              stashOAuthError({ reason: "SESSION_NOT_ESTABLISHED", message: exchangeError, ts: Date.now() });
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
          // Password recovery: do NOT surface Google-auth dialogs and force
          // the user into the mandatory reset-password screen. RecoveryMode
          // is already set; the guard would redirect anyway, but navigating
          // explicitly avoids a flash of home/profile.
          if (isRecoveryLink) {
            recordTrace("native-auth", "OAUTH_RECOVERY_NAVIGATE_RESET");
            try {
              if (typeof window !== "undefined") {
                window.location.replace("/reset-password");
              }
            } catch { /* ignore */ }
          } else {
            recordTrace("native-auth", "AUTH_SUCCESS");
            
            // Post-login operations in background.
            (async () => {
              try {
                recordTrace("native-auth", "POST_LOGIN_SYNC_STARTED");
                const { data: userRes } = await supabase.auth.getUser();
                const intent = getAndClearGoogleAuthIntent();
                const kind = await resolveGoogleAuthResult({
                  user: userRes.user,
                  intent,
                  supabase,
                });
                stashGoogleAuthResult(kind);
                recordTrace("native-auth", "POST_LOGIN_SYNC_SUCCESS");
              } catch (e) { 
                recordTrace("native-auth", "POST_LOGIN_SYNC_FAILED", e instanceof Error ? e.message : String(e));
                // Do NOT surface this as a login failure to the user.
              }
            })();

            // Authoritative success check with a long mobile-friendly timeout
            // but return immediately if session is verified.
            console.info("[native-auth] waitForSignedIn start");
            const signedIn = await waitForSignedIn(8000);
            console.info("[native-auth] waitForSignedIn done result=", signedIn);
            
            if (!signedIn) {
              // If we reach here, a valid session was set via setSession but
              // onAuthStateChange didn't fire in time. We STILL consider it
              // success since the tokens are in storage.
              recordTrace("native-auth", "TIMEOUT_WITH_VALID_SESSION");
            }

            try {
              if (typeof window !== "undefined") {
                const dest = consumeAuthOrigin("/profile");
                console.info("[native-auth] NAVIGATION_STARTED to", dest);
                recordTrace("native-auth", "NAVIGATION_STARTED", dest);
                window.location.replace(dest);
              }
            } catch { /* ignore */ }
          }
        } else {
          // Failed exchange — clear recovery lock so a fresh link retry
          // is possible from /auth.
          if (isRecoveryLink) setRecoveryMode(false);
          console.info("[native-auth] not navigating — exchange did not succeed");
          try {
            if (typeof window !== "undefined") {
              console.warn("[native-auth] surfacing OAuth failure to user; exchangeError=", exchangeError ? "(present)" : "(none)");
              try { window.sessionStorage.setItem("irth.oauth_error.v1", "1"); } catch { /* ignore */ }
              window.location.replace("/auth?oauth_error=1");
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
