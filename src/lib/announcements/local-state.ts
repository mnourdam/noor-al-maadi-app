/**
 * Device-local announcement state.
 *
 *  - guest acknowledgements for generic announcements (no login required
 *    merely to dismiss a public announcement)
 *  - optional-update snooze, keyed by announcement id + recommended version
 *    so a NEWER recommendation always prompts again
 *
 * Mandatory updates intentionally have NO local state: they can never be
 * acknowledged, snoozed or remembered.
 */

const ACK_KEY = "irth.announcements.ack.v1";
const SNOOZE_KEY = "irth.announcements.snooze.v1";

/** 72 hours. */
export const OPTIONAL_SNOOZE_MS = 72 * 60 * 60 * 1000;

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object" ? parsed : fallback) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full / private mode — non-fatal */ }
}

export function getLocalAcks(): string[] {
  const map = readJson<Record<string, number>>(ACK_KEY, {});
  return Object.keys(map);
}

export function hasLocalAck(id: string): boolean {
  return Boolean(readJson<Record<string, number>>(ACK_KEY, {})[id]);
}

export function recordLocalAck(id: string, now = Date.now()): void {
  const map = readJson<Record<string, number>>(ACK_KEY, {});
  map[id] = now;
  writeJson(ACK_KEY, map);
}

function snoozeKey(id: string, versionCode: number): string {
  return `${id}:${versionCode}`;
}

export function isOptionalSnoozed(id: string, versionCode: number, now = Date.now()): boolean {
  const map = readJson<Record<string, number>>(SNOOZE_KEY, {});
  const until = map[snoozeKey(id, versionCode)];
  return typeof until === "number" && until > now;
}

export function snoozeOptional(id: string, versionCode: number, now = Date.now()): void {
  const map = readJson<Record<string, number>>(SNOOZE_KEY, {});
  map[snoozeKey(id, versionCode)] = now + OPTIONAL_SNOOZE_MS;
  writeJson(SNOOZE_KEY, map);
}

/** Test-only reset. */
export function __resetAnnouncementLocalState(): void {
  try {
    localStorage.removeItem(ACK_KEY);
    localStorage.removeItem(SNOOZE_KEY);
  } catch { /* ignore */ }
}
