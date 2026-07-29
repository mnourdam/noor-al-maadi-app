// ============================================================
// Memory Engine — Feature flags (build + runtime kill switch)
// ------------------------------------------------------------
// Both must be true for any injection to occur. Either one flipped
// off ⇒ the runtimeActivities list is returned unchanged, no plan
// is consulted, no bank is queried.
// ============================================================

const RUNTIME_FLAG_KEY = "irth.memory.runtime.enabled";

function buildFlag(): boolean {
  // Explicit opt-out only. Default = enabled once shipped.
  try {
    const v = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_FEATURE_MEMORY_ENGINE;
    if (v === "0" || v === "false") return false;
  } catch {
    /* SSR / non-vite env — treat as enabled */
  }
  return true;
}

function runtimeFlag(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(RUNTIME_FLAG_KEY);
    if (raw === "0" || raw === "false") return false;
  } catch { /* ignore */ }
  return true;
}

export function memoryEnabled(): boolean {
  return buildFlag() && runtimeFlag();
}

/** Admin / debug helper. Set to `false` to instantly kill injection. */
export function setMemoryRuntimeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RUNTIME_FLAG_KEY, enabled ? "1" : "0");
  } catch { /* ignore */ }
}

export const MEMORY_RUNTIME_FLAG_KEY = RUNTIME_FLAG_KEY;
