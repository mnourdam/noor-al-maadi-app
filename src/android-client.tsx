import { createRoot } from "react-dom/client";

import { AndroidAuthMinTest, isAndroidAuthMinPath } from "./components/AndroidAuthMinTest";
import { AndroidInputIsolationTest, isAndroidInputTestPath } from "./components/AndroidInputIsolationTest";
import { AndroidReactMinTest, isAndroidReactMinPath } from "./components/AndroidReactMinTest";
import { AndroidTextEntryPage, isAndroidTextEntryPath } from "./components/AndroidTextEntryPage";

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

// NOTE: the previous brute-force `__irthCapacitorMinimalMode` flag is no
// longer set here. We now bisect through `src/lib/androidQuietMode.ts` so
// each suspect subsystem can be re-enabled individually from the console:
//   __irthAndroidEnable("push,audio,...")   or   __irthAndroidEnable("all")
console.info("[android:quiet] default = all global subsystems gated. Use __irthAndroidEnable('all') to restore.");

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

const rootElement = document.getElementById("root");

// Note: /auth is NOT intercepted here. On Android, login buttons use AuthLink
// which navigates to the standalone /android-auth-min entry instead.

if (!rootElement) {
  throw new Error("Android app root element #root was not found.");
}

if (isAndroidReactMinPath()) {
  try {
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.info("[android-react-min] minimal React entry mounted", { path: window.location.pathname });
  createRoot(rootElement).render(<AndroidReactMinTest />);
} else if (isAndroidAuthMinPath()) {
  try {
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.info("[android-auth-min] minimal auth entry mounted", { path: window.location.pathname });
  createRoot(rootElement).render(<AndroidAuthMinTest />);
} else if (isAndroidTextEntryPath()) {
  try {
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.info("[android-text-entry] standalone text entry mounted", { path: window.location.pathname });
  createRoot(rootElement).render(<AndroidTextEntryPage />);
} else if (isAndroidInputTestPath()) {
  try {
    window.__irthAndroidInputTest = true;
    document.documentElement.classList.add("android-input-test-active");
    document.documentElement.classList.remove("irth-booting");
    document.getElementById("irth-boot-splash")?.remove();
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.info("[android-input-test] isolated Android entry mounted", { path: window.location.pathname });
  createRoot(rootElement).render(<AndroidInputIsolationTest />);
} else {
  void bootMainApp(rootElement);
}

async function bootMainApp(root: HTMLElement) {
  await import("./styles.css");
  const [{ RouterProvider }, { getRouter }, { attachSupabaseAuth }, diagnostics, perf] = await Promise.all([
    import("@tanstack/react-router"),
    import("./router"),
    import("./integrations/supabase/auth-attacher"),
    import("./lib/androidFreezeDiagnostics"),
    import("./lib/perf-mode"),
  ]);

  const { installAndroidFreezeDiagnostics, androidMark } = diagnostics;
  const { applyPerfMode } = perf;

  // TanStack Start normally injects this during its client boot. The Android
  // bundle is a plain SPA, so provide the only Start option the client-side
  // server-function stubs need: bearer-token attachment for RPC calls.
  (window as unknown as { __TSS_START_OPTIONS__?: unknown }).__TSS_START_OPTIONS__ = {
    functionMiddleware: [attachSupabaseAuth],
  };

  installAndroidFreezeDiagnostics();
  // Flip the global perf-lite CSS class BEFORE first paint so heavy
  // animations / backdrop-filter / particles never run on Android WebView.
  applyPerfMode();
  // Mark Android so route/component code can branch on it cheaply.
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      document.documentElement.classList.add("is-android", "is-capacitor");
    }
  } catch { /* ignore */ }
  // eslint-disable-next-line no-console
  console.log("[android:perf] perf-lite applied", document.documentElement.className);

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
        <p style="font-size:12px;line-height:1.7;opacity:.7;margin:0 0 16px;text-align:left;direction:ltr;background:#111c2f;padding:12px;border-radius:8px;font-family:ui-monospace,monospace">
          # .env.local (project root)<br/>
          VITE_SUPABASE_URL=...<br/>
          VITE_SUPABASE_PUBLISHABLE_KEY=...
        </p>
        <p style="font-size:12px;opacity:.6;margin:0">المتغيرات المفقودة: ${missing}</p>
      </div>
    </div>`;
  throw new Error("Stop mount: missing Supabase env for Android build.");
}


try {
  // NOTE: StrictMode intentionally omitted on Android — its double-invoke
  // of effects/renders amplifies layout work in the WebView and makes inputs
  // feel laggy. Web build still runs through TanStack Start's own pipeline.
  const router = getRouter();
  androidMark("react.mount.start", { route: window.location.pathname });
  createRoot(root).render(
    <RouterProvider router={router} />,
  );
  androidMark("react.mount.rendered", { route: window.location.pathname });
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
