// Android/Capacitor-only Vite config.
//
// This file is NEVER used by Lovable preview or by the Lovable cloud build.
// Lovable uses vite.config.ts.  This config is used ONLY when you run
// `npm run build:android:web` locally to produce a static SPA bundle that
// Capacitor can package into the Android APK.
//
// Key differences vs vite.config.ts:
//   * SPA mode is enabled  -> TanStack Start emits a static index.html shell
//     that hydrates on the client (no SSR runtime required at runtime).
//   * No custom server.entry override -> avoids breaking the SPA prerender
//     step that looks up the bundled server module by filename.
//   * Output goes to dist/android/ to match capacitor.config.ts -> webDir.
//
// To rebuild the Android web bundle:
//   npm run build:android:web
//
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Emit a static SPA shell (dist/android/index.html) that boots the
    // TanStack Router on the client. Required for Capacitor.
    spa: { enabled: true },
  },
  vite: {
    build: {
      // Capacitor reads this directory via capacitor.config.ts -> webDir.
      outDir: "dist/android",
      emptyOutDir: true,
    },
  },
});