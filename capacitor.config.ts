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
    includePlugins: ["@capacitor/app", "@capacitor/push-notifications", "@capacitor/browser", "@capacitor/preferences", "@capacitor/local-notifications", "@capacitor/share", "@capacitor/filesystem"],
  },
  plugins: {
    // Diagnostic native input build: keep Capacitor's core SystemBars plugin
    // from installing inset/CSS listeners while we isolate WebView + IME input.
    SystemBars: {
      insetsHandling: "disable",
      hidden: false,
    },
    // Phase 2c — Smart Daily Challenge Notifications.
    // Standard inexact alarm scheduling; no SCHEDULE_EXACT_ALARM required.
    // The plugin auto-registers a BOOT_COMPLETED receiver so scheduled
    // notifications persist across device reboots.
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#C9A24B",
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;