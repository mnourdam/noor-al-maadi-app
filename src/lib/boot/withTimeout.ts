import { recordTrace } from "@/lib/diag-trace";
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
  const msg =
    err instanceof Error ? err.message :
    typeof err === "string" ? err : "";
  // Differentiate: only classify as "offline" if it's a confirmed lack of network
  // or a terminal transport error. Generic "Failed to fetch" is treated as 
  // "failed" to allow the system to retry or show specific service errors.
  return /network request failed|offline|NetworkError/i.test(msg);
}

export async function withBoundedTimeout<T>(
  work: Promise<T> | (() => Promise<T>),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onLate?: (outcome: BoundedOutcome<T>) => void,
  label?: string
): Promise<BoundedOutcome<T>> {
  if (label) recordTrace("sync-forensics", "SOFT_TIMEOUT_ARMED", `${label} (${timeoutMs}ms)`);
  const p = typeof work === "function" ? (work as () => Promise<T>)() : work;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<BoundedOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      if (settled) return;
      if (label) recordTrace("sync-forensics", "SOFT_TIMEOUT_TRIGGERED", label);
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
  if (first.kind !== "timeout") {
    settled = true;
    if (label) recordTrace("sync-forensics", "SOFT_TIMEOUT_CANCELLED", label);
  }
  if (timer && first.kind !== "timeout") clearTimeout(timer);
  return first;
}
