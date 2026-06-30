// Lightweight runtime perf-mode detector.
// Adds `perf-lite` class on <html> when running on a low-power surface:
//   - Capacitor / Android WebView
//   - Small touch screens (<=480 logical px)
//   - prefers-reduced-motion
//   - low device memory or low hardware concurrency
//
// All heavy CSS (infinite animations, backdrop-blur, big glows, particles,
// embers, parallax, ken-burns) is toned down via `html.perf-lite` rules in
// styles.css. This file only flips the flag; it does not touch components.

export function applyPerfMode() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const html = document.documentElement;
  try {
    const disableFocusVisualToggles = (() => {
      try { return !!(window as any).__IRTH_ANDROID_FOCUS_AB__?.disableFocusVisualToggles; }
      catch { return false; }
    })();
    if (disableFocusVisualToggles) return;

    const ua = navigator.userAgent || "";
    const w: any = window;

    const isCapacitor = !!w.Capacitor?.isNativePlatform?.();
    const isNativeAndroid = isCapacitor && w.Capacitor?.getPlatform?.() === "android";
    const isAndroid = /Android/i.test(ua);
    const isWebView = /; wv\)/.test(ua) || /Version\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(ua);
    const smallScreen = window.matchMedia("(max-width: 480px)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const deviceMemory = typeof (navigator as any).deviceMemory === "number"
      ? (navigator as any).deviceMemory : null;
    const hwConcurrency = typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency : null;
    const lowMem = deviceMemory != null && deviceMemory <= 4;
    const lowCpu = hwConcurrency != null && hwConcurrency <= 4;

    // Any Android device (native or browser) gets perf-lite by default —
    // Android WebView is the platform that suffers most from filter:blur and
    // backdrop-filter compositing. Desktops keep the full visual identity.
    const lite =
      isCapacitor ||
      isAndroid ||
      isWebView ||
      reduceMotion ||
      (smallScreen && (lowMem || lowCpu));

    html.classList.toggle("perf-lite", !!lite);
    if (reduceMotion) html.classList.add("perf-no-motion");
    if (isNativeAndroid) {
      html.classList.add("is-android", "is-capacitor", "perf-lite", "perf-no-motion");
    } else if (isAndroid) {
      html.classList.add("is-android");
    }

    try {
      // eslint-disable-next-line no-console
      console.info("[perf-mode]", {
        lite, isCapacitor, isNativeAndroid, isAndroid, isWebView,
        smallScreen, reduceMotion, deviceMemory, hwConcurrency,
      });
    } catch { /* noop */ }
  } catch {
    // never throw from a perf hint
  }
}
