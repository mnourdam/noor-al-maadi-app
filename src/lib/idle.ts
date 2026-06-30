// Lightweight scheduler — defer non-critical work past first paint.
// Uses requestIdleCallback when available, falls back to setTimeout.
// Safe in SSR (no-ops on server).

export type IdleHandle = { cancel: () => void };


export function scheduleIdle(fn: () => void, timeout = 2000): IdleHandle {
  if (typeof window === "undefined") return { cancel: () => {} };
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (h: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(() => fn(), { timeout });
    return { cancel: () => w.cancelIdleCallback?.(id) };
  }
  const id = window.setTimeout(fn, Math.min(timeout, 200));
  return { cancel: () => window.clearTimeout(id) };
}

// Decode an image safely. Resolves even if decode is unsupported / fails,
// so callers can use it as a "best-effort" gate before swapping slides.
export function decodeImage(src: string): Promise<void> {
  if (typeof window === "undefined" || !src) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.src = src;
      const done = () => resolve();
      if (typeof img.decode === "function") {
        img.decode().then(done, done);
      } else {
        img.onload = done;
        img.onerror = done;
      }
    } catch {
      resolve();
    }
  });
}

// Lightweight, dev-only perf logger. Keeps a single shared timeline.
const DEV = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;
export function perfMark(label: string, extra?: Record<string, unknown>) {
  if (!DEV) return;
  try {
    const t = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
    // eslint-disable-next-line no-console
    console.info(`[perf] ${label}`, { tMs: t, ...(extra ?? {}) });
  } catch { /* noop */ }
}
