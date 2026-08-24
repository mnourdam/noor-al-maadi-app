import { recordTrace } from "@/lib/diag-trace";
// ============================================================
// Boot Reconciliation State Machine (Priority-Zero §4)
// ------------------------------------------------------------
// One canonical readiness signal that every progression consumer
// (Hero recommendation, Worlds progress, Achievements, Tutorial
// auto-start) must respect. Consumers may paint immediately using
// local data, but must NOT commit to an empty/unreconciled state
// as if it were the reconciled truth.
//
// States:
//   idle           — nothing started yet
//   loading-local  — reading local mirrors (localStorage / IDB)
//   loading-server — awaiting server fetches (bounded)
//   reconciled     — server data merged; terminal-ok
//   offline-local  — offline; local data is authoritative for now
//   failed         — bounded network wait exceeded / hard error
//
// Terminal-ready = one of { reconciled, offline-local, failed }.
// ============================================================

export type ReconciliationState =
  | "idle"
  | "loading-local"
  | "loading-server"
  | "reconciled"
  | "offline-local"
  | "failed";

type Listener = (s: ReconciliationState) => void;

let state: ReconciliationState = "idle";
let startedAt = 0;
let terminalAt = 0;
let lastError: string | null = null;
const listeners = new Set<Listener>();

const TERMINAL: ReadonlySet<ReconciliationState> = new Set([
  "reconciled",
  "offline-local",
  "failed",
]);

function emit(): void {
  for (const l of Array.from(listeners)) {
    try { l(state); } catch { /* ignore */ }
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:reconciliation:changed", {
        detail: { state, lastError },
      }));
    }
  } catch { /* ignore */ }
}

export function getReconciliationState(): ReconciliationState { return state; }
export function isReconciliationTerminal(): boolean { return TERMINAL.has(state); }
export function getReconciliationError(): string | null { return lastError; }
export function getReconciliationStartedAt(): number { return startedAt; }
export function getReconciliationTerminalAt(): number { return terminalAt; }

export function subscribeReconciliation(l: Listener): () => void {
  listeners.add(l);
  // Fire once so late subscribers observe the current state.
  try { l(state); } catch { /* ignore */ }
  return () => { listeners.delete(l); };
}

export function setReconciliationState(next: ReconciliationState, err: string | null = null): void {
  if (state === next && lastError === err) return;
  state = next;
  lastError = err;
  if (next !== "idle" && startedAt === 0) startedAt = Date.now();
  if (TERMINAL.has(next)) {
    terminalAt = Date.now();
  }
  emit();
}

/** Convenience: await a terminal state up to `timeoutMs` ms. */
export function awaitReconciliationReady(timeoutMs = 8000): Promise<ReconciliationState> {
  if (isReconciliationTerminal()) return Promise.resolve(state);
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      unsub();
      // Bounded wait exhausted — do not flip state; return current.
      resolve(state);
    }, timeoutMs);
    const unsub = subscribeReconciliation((s) => {
      if (TERMINAL.has(s)) {
        clearTimeout(t);
        unsub();
        resolve(s);
      }
    });
  });
}

/** Test/dev only. */
export function __resetReconciliationForTests(): void {
  state = "idle";
  startedAt = 0;
  terminalAt = 0;
  lastError = null;
}
