// ============================================================
// Bounded async — centralized soft-deadline helper.
// ------------------------------------------------------------
// Startup network operations MUST NOT block indefinitely. This
// helper races a promise against a deadline and returns a
// normalized outcome — {success | timeout | offline | failed}.
// The underlying promise is NOT cancelled (Supabase RPCs are not
// AbortController-aware); it continues in the background so a
// late success can atomically upgrade UI state via a callback.
// ============================================================
export type BoundedOutcome<T> =
  | { kind: "success"; value: T }
  | { kind: "timeout" }
  | { kind: "offline"; error?: unknown }
  | { kind: "failed"; error: unknown };

const DEFAULT_TIMEOUT_MS = 5000;

function isOffline(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg =
    err instanceof Error ? err.message :
    typeof err === "string" ? err : "";
  return /Failed to fetch|NetworkError|network request failed|offline/i.test(msg);
}

export async function withBoundedTimeout<T>(
  work: Promise<T> | (() => Promise<T>),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onLate?: (outcome: BoundedOutcome<T>) => void,
): Promise<BoundedOutcome<T>> {
  const p = typeof work === "function" ? (work as () => Promise<T>)() : work;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<BoundedOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      if (settled) return;
      resolve({ kind: "timeout" });
    }, Math.max(0, timeoutMs));
  });

  const workPromise: Promise<BoundedOutcome<T>> = p.then(
    (value): BoundedOutcome<T> => ({ kind: "success", value }),
    (error): BoundedOutcome<T> =>
      isOffline(error) ? { kind: "offline", error } : { kind: "failed", error },
  );

  // Wire the background completion for late outcomes.
  void workPromise.then((outcome) => {
    settled = true;
    if (timer) clearTimeout(timer);
    if (onLate) {
      try { onLate(outcome); } catch { /* ignore */ }
    }
  });

  const first = await Promise.race([workPromise, timeoutPromise]);
  if (first.kind !== "timeout") settled = true;
  if (timer && first.kind !== "timeout") clearTimeout(timer);
  return first;
}
