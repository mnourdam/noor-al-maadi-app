// ============================================================
// Android Input Warmup
// ------------------------------------------------------------
// Primes the Android WebView's first focus / IME / viewport-resize
// path so the very first real text input the user taps does not
// freeze. Runs once per page session. No-op on web.
//
// Strategy: insert an offscreen, readOnly <input>, focus it, then
// blur and remove on the next frame. readOnly prevents the soft
// keyboard from actually opening, while still walking the WebView
// through its first focus/blur lifecycle.
// ============================================================

declare global {
  interface Window {
    __irthAndroidInputWarmed?: boolean;
  }
}

function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
  } catch { /* ignore */ }
  return /Android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export function warmupAndroidInput(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isAndroid()) return;
  if (window.__irthAndroidInputWarmed) return;
  window.__irthAndroidInputWarmed = true;

  const run = () => {
    try {
      const probe = document.createElement("input");
      probe.type = "text";
      probe.readOnly = true; // keyboard stays hidden
      probe.setAttribute("aria-hidden", "true");
      probe.tabIndex = -1;
      probe.style.cssText = [
        "position:fixed",
        "left:-9999px",
        "top:-9999px",
        "width:1px",
        "height:1px",
        "opacity:0",
        "pointer-events:none",
        "border:0",
        "padding:0",
        "margin:0",
      ].join(";");
      document.body.appendChild(probe);
      try { probe.focus({ preventScroll: true } as FocusOptions); } catch { /* ignore */ }
      // Yield twice so the WebView completes its first focus pass.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try { probe.blur(); } catch { /* ignore */ }
          try { probe.remove(); } catch { /* ignore */ }
        });
      });
    } catch { /* ignore */ }
  };

  // Defer until after first paint so we don't compete with mount work.
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(run, 120);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(run, 120), { once: true });
  }
}
