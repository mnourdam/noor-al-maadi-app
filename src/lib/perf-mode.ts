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
    const ua = navigator.userAgent || "";
    const w: any = window;

    const isCapacitor = !!w.Capacitor?.isNativePlatform?.();
    const isAndroid = /Android/i.test(ua);
    const smallScreen = window.matchMedia("(max-width: 480px)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowMem = typeof (navigator as any).deviceMemory === "number" && (navigator as any).deviceMemory <= 4;
    const lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;

    const lite =
      isCapacitor ||
      reduceMotion ||
      (isAndroid && (smallScreen || lowMem || lowCpu)) ||
      (smallScreen && (lowMem || lowCpu));

    html.classList.toggle("perf-lite", !!lite);
    if (reduceMotion) html.classList.add("perf-no-motion");
  } catch {
    // never throw from a perf hint
  }
}
