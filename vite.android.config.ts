// Android/Capacitor-only Vite config.
//
// Produces a static SPA bundle in `dist/android/` that Capacitor packages
// into the Android APK. Lovable preview / cloud builds use vite.config.ts
// and are unaffected by this file.
//
// Key requirements baked in:
//   * SPA mode  -> TanStack Start emits a static index.html shell that
//     hydrates on the client (no SSR runtime in the APK).
//   * `base: "./"` -> all generated asset URLs are RELATIVE, which is
//     required for Android WebView / `file://`-style loading inside
//     Capacitor. Absolute `/assets/...` paths break inside the APK.
//   * `nitro: false` -> we don't want a server bundle for the APK.
//   * Output -> `dist/android/` (matches capacitor.config.ts -> webDir).
//   * Post-build finalize step (scripts/finalize-android.mjs, wired via
//     the npm script) guarantees `dist/android/index.html` exists and uses
//     relative asset URLs even if the prerender step changes shape.
//
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    spa: { enabled: true },
  },
  nitro: false,
  vite: {
    base: "./",
    build: {
      outDir: "dist/android",
      emptyOutDir: true,
      manifest: true,
    },
  },
});
