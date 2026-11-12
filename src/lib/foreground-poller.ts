/** Poll UI data only while usable. Never overlaps requests; resumes on return.
 * Does not change server push, notification delivery, or progress writes.
 */
export function startForegroundPoller(
  task: () => Promise<unknown>,
  intervalMs: number,
  options: { initialDelayMs?: number; focus?: boolean; allowBackground?: () => boolean } = {},
): () => void {
  let stopped = false;
  let inFlight = false;
  let lastStart = -Infinity;
  const started = Date.now();
  const run = async () => {
    if (
      stopped ||
      inFlight ||
      (document.visibilityState === "hidden" && !options.allowBackground?.()) ||
      navigator.onLine === false
    )
      return;
    if (Date.now() - started < (options.initialDelayMs ?? 0)) return;
    // Browsers often emit focus + visibilitychange together.
    if (Date.now() - lastStart < 1000) return;
    inFlight = true;
    lastStart = Date.now();
    try {
      await task();
    } catch {
      /* retry on the next eligible tick */
    } finally {
      inFlight = false;
    }
  };
  const wake = () => {
    void run();
  };
  const interval = window.setInterval(wake, intervalMs);
  const first = window.setTimeout(wake, options.initialDelayMs ?? 0);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("online", wake);
  if (options.focus !== false) window.addEventListener("focus", wake);
  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.clearTimeout(first);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("online", wake);
    if (options.focus !== false) window.removeEventListener("focus", wake);
  };
}
