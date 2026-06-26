import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

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
  },
  plugins: {
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: false,
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;