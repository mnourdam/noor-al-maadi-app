// ============================================================
// Startup timeline — bounded ring buffer of boot milestones.
// ------------------------------------------------------------
// Records timestamps for major cold-start stages so the persistence
// diagnostics page can render a full picture of what happened
// between native splash and first Home render. In-memory only —
// intentional: startup traces are per-boot and should not
// accumulate across launches. A window event is dispatched so the
// diagnostics page can subscribe.
// ============================================================

export type StartupStage =
  | "js-boot"
  | "react-mounted"
  | "local-snapshot-ready"
  | "auth-session-ready"
  | "local-progress-ready"
  | "server-reconciliation-started"
  | "server-reconciliation-soft-timeout"
  | "offline-local-entered"
  | "server-reconciliation-success"
  | "server-reconciliation-failed"
  | "onboarding-request"
  | "onboarding-request-concurrent"
  | "app-shell-first-rendered"
  | "home-first-rendered"
  | "startup-failure";

export interface StartupMark {
  stage: StartupStage;
  ts: number;      // Date.now()
  perf: number;    // performance.now()
  detail?: string;
}

const MAX = 200;
const marks: StartupMark[] = [];
const onboardingCounters = { total: 0, concurrent: 0 };
let lastFailure: string | null = null;

function emit() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("irth:startup-timeline:changed"));
    }
  } catch { /* ignore */ }
}

export function recordStartupMark(stage: StartupStage, detail?: string): void {
  const nowPerf = typeof performance !== "undefined" ? performance.now() : 0;
  marks.push({ stage, ts: Date.now(), perf: nowPerf, detail });
  while (marks.length > MAX) marks.shift();
  if (stage === "onboarding-request") onboardingCounters.total += 1;
  if (stage === "onboarding-request-concurrent") onboardingCounters.concurrent += 1;
  if (stage === "startup-failure") lastFailure = detail ?? "unknown";
  emit();
}

export function readStartupMarks(): StartupMark[] {
  return marks.slice();
}

export function readOnboardingCounters(): { total: number; concurrent: number } {
  return { ...onboardingCounters };
}

export function readLastStartupFailure(): string | null {
  return lastFailure;
}

/** First-usable-frame = react-mounted. Terminal reconciliation = success or offline. */
export function readStartupSummary(): {
  jsBoot: number | null;
  reactMounted: number | null;
  firstUsableFrameMs: number | null;
  terminalReconciliationMs: number | null;
} {
  const find = (s: StartupStage) => marks.find((m) => m.stage === s)?.ts ?? null;
  const jsBoot = find("js-boot");
  const reactMounted = find("react-mounted");
  const terminalTs =
    find("server-reconciliation-success") ??
    find("offline-local-entered") ??
    find("server-reconciliation-failed");
  return {
    jsBoot,
    reactMounted,
    firstUsableFrameMs: jsBoot && reactMounted ? reactMounted - jsBoot : null,
    terminalReconciliationMs: jsBoot && terminalTs ? terminalTs - jsBoot : null,
  };
}

// Record js-boot immediately on module load in a browser context.
if (typeof window !== "undefined") {
  try { recordStartupMark("js-boot"); } catch { /* ignore */ }
}
