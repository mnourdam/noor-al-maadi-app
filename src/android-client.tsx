import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import "./styles.css";

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

// TanStack Start normally injects this during its client boot. The Android
// bundle is a plain SPA, so provide the only Start option the client-side
// server-function stubs need: bearer-token attachment for RPC calls.
(window as unknown as { __TSS_START_OPTIONS__?: unknown }).__TSS_START_OPTIONS__ = {
  functionMiddleware: [attachSupabaseAuth],
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Android app root element #root was not found.");
}

try {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={getRouter()} />
    </StrictMode>,
  );
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[android:mount-failed]", (err as Error)?.stack ?? err);
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1424;color:#f3f4f6;font-family:system-ui,sans-serif;padding:24px;text-align:center">
      <div style="max-width:360px">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 8px">تعذّر تشغيل التطبيق</h1>
        <p style="font-size:13px;opacity:.75;margin:0 0 16px">${(err as Error)?.message ?? "Unknown error"}</p>
        <button onclick="window.location.reload()" style="padding:10px 16px;border-radius:8px;background:#d4a056;color:#0b1424;font-weight:600;border:none">إعادة المحاولة</button>
      </div>
    </div>`;
}
