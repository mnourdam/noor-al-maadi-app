// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // SPA mode: emit a static index.html shell that hydrates client-side.
    // Required so Capacitor can package the app as a static Android bundle
    // (`npx cap sync android` expects `dist/client/index.html`).
    spa: { enabled: true },
    // Render the SPA shell at "/" so `dist/client/index.html` exists after build.
    pages: [{ path: "/", prerender: { enabled: true } }],
  },
  vite: {
    build: {
      // Match Capacitor's expected webDir layout: dist/client/index.html.
      // Inside the Lovable sandbox nitro overrides this with the Cloudflare
      // output layout, so this only affects local/self-hosted builds.
      outDir: "dist/client",
      emptyOutDir: true,
    },
  },
});
