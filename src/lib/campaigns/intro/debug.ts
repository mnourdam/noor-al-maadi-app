// ============================================================
// Campaign Intros — observability (Stage 6)
// ------------------------------------------------------------
// Development-only tracing. In a production build `introDebug` is a
// no-op: the calls stay, the output does not. Real errors go through
// `introError`, which is the ONLY thing allowed to log in production —
// and even then it never logs payloads that could contain identity.
// ============================================================

function isDev(): boolean {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

/** Dev-only structured trace. Zero output (and zero work) in production. */
export function introDebug(event: string, data?: Record<string, unknown>): void {
  if (!isDev()) return;
  try {
    // eslint-disable-next-line no-console
    console.debug(`[campaign-intro] ${event}`, data ?? {});
  } catch {
    /* never let tracing break playback */
  }
}

/** Actual failures only. Kept message-only, never identity payloads. */
export function introError(event: string, error?: unknown): void {
  try {
    const message =
      error instanceof Error ? error.message : error ? String(error) : "";
    // eslint-disable-next-line no-console
    console.error(`[campaign-intro] ${event}${message ? `: ${message}` : ""}`);
  } catch {
    /* ignore */
  }
}
