// Diagnostic trace persistence for the native-auth-diagnostics screen.
//
// Records a small ring of recent stage transitions to localStorage so the
// diagnostics page can display what actually happened during a signup or
// Google-OAuth flow — including flows that navigate away and back.
//
// NEVER store tokens, codes, passwords, emails, or session bodies. Only
// stage names and short safe metadata (status codes, boolean flags).

export type TraceChannel =
  | "native-auth"
  | "signup"
  | "deep-link"
  | "campaign-persistence"
  | "tutorial"
  | "achievement"
  | "export-audit"
  | "logout-audit"
  | "pkce-audit"
  | "hearts-audit"
  | "sync-forensics";

export interface TraceEntry {
  ts: string;          // ISO timestamp
  stage: string;       // short stage name
  detail?: string;     // optional short safe detail
}

const MAX_ENTRIES = 500;

function keyFor(channel: TraceChannel): string {
  return `diag-trace:${channel}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function recordTrace(
  channel: TraceChannel,
  stage: string,
  detail?: string | number | boolean | null,
): void {
  try {
    const s = safeStorage();
    if (!s) return;
    const raw = s.getItem(keyFor(channel));
    const arr: TraceEntry[] = raw ? JSON.parse(raw) : [];
    arr.push({
      ts: new Date().toISOString(),
      stage,
      detail: detail == null ? undefined : String(detail).slice(0, 1000),
    });
    while (arr.length > MAX_ENTRIES) arr.shift();
    s.setItem(keyFor(channel), JSON.stringify(arr));
  } catch { /* ignore */ }
}

export function readTrace(channel: TraceChannel): TraceEntry[] {
  try {
    const s = safeStorage();
    if (!s) return [];
    const raw = s.getItem(keyFor(channel));
    return raw ? (JSON.parse(raw) as TraceEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearTrace(channel: TraceChannel): void {
  try {
    const s = safeStorage();
    if (!s) return;
    s.removeItem(keyFor(channel));
  } catch { /* ignore */ }
}
