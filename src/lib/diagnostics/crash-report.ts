/**
 * Crash diagnostics — capture the ORIGINAL exception before the generic
 * recovery UI hides it.
 *
 * Design rules:
 *  - Never throw. Every entry point is fully guarded; the failure path must
 *    never fail.
 *  - Never persist tokens, emails, or other personal data (see `redact`).
 *  - Bounded storage: a ring buffer of the last {@link MAX_REPORTS} reports.
 */

export const CRASH_REPORTS_KEY = "irth.crash.reports";
/** One-launch marker: set before the fatal screen renders, consumed on boot. */
export const CRASH_PENDING_KEY = "irth.crash.pending";
/** Consecutive failed boots. 0/absent = healthy. >= 2 = static recovery. */
export const CRASH_BOOT_FAILURES_KEY = "irth.crash.bootFailures";

const MAX_REPORTS = 5;

export type CrashReport = {
  at: string;
  name: string;
  message: string;
  stack: string;
  targetRoute: string;
  routeBefore: string;
  lastSuccessfulRoute: string;
  appVersion: string;
  authState: "signed-in" | "guest" | "unknown";
  online: boolean;
  hydrated: boolean;
  pendingNavigation: string;
  activeOverlays: string[];
  lockState: Record<string, string>;
  storageKeys: string[];
  bootMarkers: Record<string, string>;
  historyState: string;
  historyLength: number;
  boundary: string;
};

/* ────────────────────────── redaction ────────────────────────── */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const JWT_RE = /\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /(bearer\s+)[A-Za-z0-9._-]+/gi;
const LONG_TOKEN_RE = /\b(sb_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{8,})\b/g;

export function redact(input: string): string {
  try {
    return String(input ?? "")
      .replace(EMAIL_RE, "[email]")
      .replace(JWT_RE, "[token]")
      .replace(BEARER_RE, "$1[token]")
      .replace(LONG_TOKEN_RE, "[token]")
      .slice(0, 4000);
  } catch {
    return "";
  }
}

/** Storage key names only — never values. Token-ish key names are dropped. */
function safeKeyNames(store: Storage | undefined): string[] {
  const out: string[] = [];
  try {
    if (!store) return out;
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (!k) continue;
      if (/token|auth|session|password|email/i.test(k)) continue;
      out.push(k);
    }
  } catch { /* ignore */ }
  return out.sort().slice(0, 120);
}

/* ────────────────────────── environment probes ────────────────────────── */

/** The route the app last resolved successfully (updated on every onResolved). */
let lastSuccessfulRoute = "";
let previousRoute = "";

export function noteResolvedRoute(path: string) {
  try {
    previousRoute = lastSuccessfulRoute;
    lastSuccessfulRoute = path;
  } catch { /* ignore */ }
}

function probeOverlays(): string[] {
  const out: string[] = [];
  try {
    document
      .querySelectorAll<HTMLElement>(
        '[data-irth-overlay],[role="dialog"],[data-state="open"][data-radix-portal],[data-irth-recovery-layer]',
      )
      .forEach((el) => {
        const tag = el.getAttribute("data-irth-overlay") ?? el.getAttribute("role") ?? el.tagName;
        out.push(`${tag}#${el.id || "-"}`);
      });
  } catch { /* ignore */ }
  return out.slice(0, 20);
}

function probeLocks(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const html = document.documentElement;
    const body = document.body;
    out.htmlOverflow = html?.style.overflow || "";
    out.htmlClass = (html?.className || "").slice(0, 200);
    out.bodyOverflow = body?.style.overflow || "";
    out.bodyPointerEvents = body?.style.pointerEvents || "";
    out.bodyPosition = body?.style.position || "";
    out.bodyInert = body?.hasAttribute("inert") ? "1" : "";
    out.bodyAriaHidden = body?.getAttribute("aria-hidden") ?? "";
  } catch { /* ignore */ }
  return out;
}

function probeAuthState(): CrashReport["authState"] {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i) ?? "";
      if (/^sb-.*-auth-token$/.test(k)) return "signed-in";
    }
    return "guest";
  } catch {
    return "unknown";
  }
}

function probeBootMarkers(): Record<string, string> {
  const out: Record<string, string> = {};
  const read = (store: Storage, key: string, label: string) => {
    try {
      const v = store.getItem(key);
      if (v != null) out[label] = redact(v).slice(0, 120);
    } catch { /* ignore */ }
  };
  try {
    read(sessionStorage, "irth.boot-root-recovered", "boot-root-recovered");
    read(localStorage, CRASH_PENDING_KEY, "crash-pending");
    read(localStorage, CRASH_BOOT_FAILURES_KEY, "boot-failures");
    out.deepPathBoot = String(
      (window as unknown as { __IRTH_DEEP_PATH_BOOT__?: string }).__IRTH_DEEP_PATH_BOOT__ ?? "",
    );
  } catch { /* ignore */ }
  return out;
}

function appVersion(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    return env.VITE_APP_VERSION || env.MODE || "unknown";
  } catch {
    return "unknown";
  }
}

/* ────────────────────────── capture ────────────────────────── */

export function buildCrashReport(error: unknown, boundary: string): CrashReport {
  const err = (error ?? {}) as Error;
  let pathname = "";
  try { pathname = location.pathname + location.search; } catch { /* ignore */ }
  let historyState = "";
  let historyLength = 0;
  try {
    historyState = redact(JSON.stringify(history.state ?? null)).slice(0, 600);
    historyLength = history.length;
  } catch { /* ignore */ }

  return {
    at: new Date().toISOString(),
    name: redact(err?.name ?? "Error").slice(0, 120),
    message: redact(err?.message ?? String(error)).slice(0, 600),
    stack: redact(err?.stack ?? "").slice(0, 3000),
    targetRoute: pathname,
    routeBefore: previousRoute,
    lastSuccessfulRoute,
    appVersion: appVersion(),
    authState: probeAuthState(),
    online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
    hydrated: typeof document !== "undefined"
      ? (document.getElementById("root")?.childElementCount ?? 0) > 0
      : false,
    pendingNavigation: (() => {
      try {
        return String(
          (window as unknown as { __IRTH_PENDING_NAV__?: string }).__IRTH_PENDING_NAV__ ?? "",
        );
      } catch { return ""; }
    })(),
    activeOverlays: probeOverlays(),
    lockState: probeLocks(),
    storageKeys: [
      ...safeKeyNames(typeof localStorage !== "undefined" ? localStorage : undefined).map((k) => `L:${k}`),
      ...safeKeyNames(typeof sessionStorage !== "undefined" ? sessionStorage : undefined).map((k) => `S:${k}`),
    ],
    bootMarkers: probeBootMarkers(),
    historyState,
    historyLength,
    boundary,
  };
}

/**
 * Persist the diagnostic AND arm the one-launch crash marker so the next
 * launch boots clean instead of restoring the failed route.
 */
export function captureCrash(error: unknown, boundary: string): CrashReport {
  const report = buildCrashReport(error, boundary);
  try {
    // eslint-disable-next-line no-console
    console.error("[irth:crash]", JSON.stringify(report));
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(CRASH_REPORTS_KEY);
    const list: CrashReport[] = raw ? (JSON.parse(raw) as CrashReport[]) : [];
    const next = [report, ...(Array.isArray(list) ? list : [])].slice(0, MAX_REPORTS);
    localStorage.setItem(CRASH_REPORTS_KEY, JSON.stringify(next));
  } catch { /* storage full / disabled — diagnostics are best-effort */ }
  try {
    localStorage.setItem(
      CRASH_PENDING_KEY,
      JSON.stringify({ at: report.at, route: report.targetRoute, boundary }),
    );
  } catch { /* ignore */ }
  return report;
}

export function readCrashReports(): CrashReport[] {
  try {
    const raw = localStorage.getItem(CRASH_REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as CrashReport[]) : [];
  } catch {
    return [];
  }
}

export function clearCrashReports() {
  try { localStorage.removeItem(CRASH_REPORTS_KEY); } catch { /* ignore */ }
}

export function formatCrashReport(report: CrashReport): string {
  try {
    return JSON.stringify(report, null, 2);
  } catch {
    return `${report?.name}: ${report?.message}`;
  }
}
