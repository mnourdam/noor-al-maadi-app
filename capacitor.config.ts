import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the Irth Android app.
//
// `webDir` must point at the directory produced by `npm run build:android:web`
// (see vite.android.config.ts). That directory must contain index.html before
// running `npx cap sync android`.
const config: CapacitorConfig = {
  appId: "app.lovable.irth",
  appName: "Irth",
  webDir: "dist/android",
  android: {
    allowMixedContent: false,
    captureInput: false,
    initialFocus: false,
    useLegacyBridge: true,
    resolveServiceWorkerRequests: false,
    webContentsDebuggingEnabled: true,
    includePlugins: ["@capacitor/app", "@capacitor/push-notifications"],
  },
  plugins: {
    // Diagnostic native input build: keep Capacitor's core SystemBars plugin
    // from installing inset/CSS listeners while we isolate WebView + IME input.
    SystemBars: {
      insetsHandling: "disable",
      hidden: false,
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;