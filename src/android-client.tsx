import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import "./styles.css";

// TanStack Start normally injects this during its client boot. The Android
// bundle is a plain SPA, so provide the only Start option the client-side
// server-function stubs need: bearer-token attachment for RPC calls.
(window as any).__TSS_START_OPTIONS__ = {
  functionMiddleware: [attachSupabaseAuth],
};

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Android app root element #root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);