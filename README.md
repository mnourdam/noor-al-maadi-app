# Irth

Lovable preview and cloud deploy use the standard scripts (`npm run dev`,
`npm run build`). The Android APK uses a separate, isolated build path so it
can never break the Lovable build.

---

## Android APK Build

The Android build uses its own Vite config (`vite.android.config.ts`) and
writes a static SPA bundle to `dist/android/`. Capacitor (`capacitor.config.ts`)
is wired to that same directory via `webDir: "dist/android"`.

### One-time setup (Windows)

Run these once in PowerShell or Command Prompt from the project root:

```bat
npm install
npm install --save-dev @capacitor/cli @capacitor/assets
npm install @capacitor/core @capacitor/android @capacitor/app
npx cap add android
```

You also need:

* Android Studio (for the Android SDK + `gradlew.bat`)
* JDK 17+
* `ANDROID_HOME` environment variable set

### Generate launcher icons + splash (one-time, or whenever assets change)

The branded source images live in `resources/`:

* `resources/icon.png`            — full launcher icon
* `resources/icon-foreground.png` — adaptive-icon foreground
* `resources/icon-background.png` — adaptive-icon background
* `resources/splash.png`          — splash screen

Generate all Android densities with:

```bat
npx @capacitor/assets generate --android
```

This writes the launcher icons into `android/app/src/main/res/mipmap-*` and
the splash into `drawable-*`.

### Build the web bundle for Android

```bat
npm run build:android:web
```

Produces `dist/android/index.html` plus hashed assets. This script is
completely independent of `npm run build` — Lovable preview and deploy are
not affected.

### Sync the web bundle into the Android project

```bat
npm run sync:android
```

Runs `build:android:web` and then `npx cap sync android`.

### Open in Android Studio

```bat
npm run open:android
```

### Build a debug APK from the command line

```bat
npm run apk:debug
```

The APK lands at:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

### Common pitfalls

* If `cap sync` complains that `dist/android/index.html` is missing, you
  forgot `npm run build:android:web`.
* If the launcher icon still looks like the default Android robot, you
  forgot `npx @capacitor/assets generate --android` (or you ran it before
  `npx cap add android`).
* Never edit `vite.config.ts` to make the Android build work — use
  `vite.android.config.ts` instead. The two configs are intentionally
  separate so Lovable preview can never be broken by Android tweaks.