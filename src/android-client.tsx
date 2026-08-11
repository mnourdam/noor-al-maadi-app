import "@/lib/identity/install";
import { createRoot } from "react-dom/client";
import { assertProductionPublicOrigin, CONFIGURED_PUBLIC_ORIGIN } from "@/lib/share/publicOrigin";
import { runSafeBootContract } from "@/lib/diagnostics/safe-boot";

// Android release invariant: the shareable public origin must be configured.
// If VITE_PUBLIC_APP_ORIGIN is missing/invalid the APK would silently ship a
// dev-only fallback origin, so we hard-fail at boot instead. Vite dev builds
// (import.meta.env.DEV) tolerate the fallback so we can iterate locally.
try {
  if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
    assertProductionPublicOrigin();
  }
  // eslint-disable-next-line no-console
  console.info("[android] public origin:", CONFIGURED_PUBLIC_ORIGIN ?? "(dev fallback)");
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[android:boot] invalid public origin config", err);
  throw err;
}

// Surface uncaught errors to Logcat via Capacitor's Console plugin so blank /
// error-boundary screens are diagnosable on real devices.
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[android:error]", e?.message, (e?.error as Error)?.stack ?? e?.error);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("[android:unhandledrejection]", (e?.reason as Error)?.stack ?? e?.reason);
});

// Capacitor opens the app at `https://localhost/index.html` (or similar) when
// `base: "./"` is used. TanStack Router's history would then see a pathname
// that no route matches. Normalize to `/` before the router boots.
try {
  const p = window.location.pathname;
  if (p.endsWith("/index.html") || p === "" || p === "/index.html") {
    const base = p.replace(/index\.html$/, "") || "/";
    window.history.replaceState(null, "", base + window.location.search + window.location.hash);
  }
} catch { /* ignore */ }

// ── Guaranteed clean-boot contract ──
// If the previous session ended on the fatal recovery screen, consume the
// one-launch marker, clear ONLY transient navigation/error/overlay state and
// boot at `/`. Player data is never touched. Must run before the router reads
// the location.
try {
  const boot = runSafeBootContract();
  if (boot.recovered) {
    // eslint-disable-next-line no-console
    console.warn("[android:safe-boot]", JSON.stringify(boot));
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[android:safe-boot] failed", err);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Android app root element #root was not found.");
}

void bootMainApp(rootElement);

async function bootMainApp(root: HTMLElement) {
  await import("./styles.css");
  const [{ RouterProvider }, { getRouter }, { attachSupabaseAuth }, perf] = await Promise.all([
    import("@tanstack/react-router"),
    import("./router"),
    import("./integrations/supabase/auth-attacher"),
    import("./lib/perf-mode"),
  ]);

  const { applyPerfMode } = perf;

  // TanStack Start normally injects this during its client boot. The Android
  // bundle is a plain SPA, so provide the only Start option the client-side
  // server-function stubs need: bearer-token attachment for RPC calls.
  (window as unknown as { __TSS_START_OPTIONS__?: unknown }).__TSS_START_OPTIONS__ = {
    functionMiddleware: [attachSupabaseAuth],
  };

  // Flip the global perf-lite CSS class BEFORE first paint so heavy
  // animations / backdrop-filter / particles never run on Android WebView.
  applyPerfMode();
  try {
    if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
      document.documentElement.classList.add("is-android", "is-capacitor");
    }
  } catch { /* ignore */ }

  // Capacitor APK builds embed Supabase config at build time via Vite env vars.
  // If they are missing, surface a clear setup screen rather than crashing into
  // the TanStack error boundary (which would just say "This page didn't load").
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      !supabaseUrl ? "VITE_SUPABASE_URL" : null,
      !supabaseKey ? "VITE_SUPABASE_PUBLISHABLE_KEY" : null,
    ].filter(Boolean).join(", ");
    // eslint-disable-next-line no-console
    console.error("[android:env-missing]", missing);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1424;color:#f3f4f6;font-family:system-ui,sans-serif;padding:24px;text-align:center" dir="rtl">
        <div style="max-width:420px">
          <h1 style="font-size:20px;font-weight:700;margin:0 0 12px;color:#d4a056">إعداد مطلوب</h1>
          <p style="font-size:14px;line-height:1.7;opacity:.85;margin:0 0 16px">
            هذا البناء المحلي لتطبيق أندرويد يحتاج إلى مفاتيح Supabase وقت البناء.
          </p>
          <p style="font-size:12px;opacity:.6;margin:0">المتغيرات المفقودة: ${missing}</p>
        </div>
      </div>`;
    throw new Error("Stop mount: missing Supabase env for Android build.");
  }

  try {
    // Phase 5 Hardening: Safe Unified Bootstrap
    // We register the listener and check for Cold Boot launch URL before the router boots.
    // This ensures that even if the OS delivered the intent before we were ready, we recover it.
    void import("./lib/native-auth").then((m) => {
      console.info("[IrthAuth] BOOT_SEQUENCE_START");
      return m.installNativeAuthDeepLinkListener();
    }).catch((err) => {
      console.error("[IrthAuth] BOOT_SEQUENCE_FAILED", err);
    });

    const router = getRouter();
    createRoot(root).render(<RouterProvider router={router} />);
  } catch (err) {

    // eslint-disable-next-line no-console
    console.error("[android:mount-failed]", (err as Error)?.stack ?? err);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1424;color:#f3f4f6;font-family:system-ui,sans-serif;padding:24px;text-align:center">
        <div style="max-width:360px">
          <h1 style="font-size:18px;font-weight:600;margin:0 0 8px">تعذّر تشغيل التطبيق</h1>
          <p style="font-size:13px;opacity:.75;margin:0 0 16px">${(err as Error)?.message ?? "Unknown error"}</p>
          <button onclick="window.location.reload()" style="padding:10px 16px;border-radius:8px;background:#d4a056;color:#0b1424;font-weight:600;border:none">إعادة المحاولة</button>
        </div>
      </div>`;
  }
}
