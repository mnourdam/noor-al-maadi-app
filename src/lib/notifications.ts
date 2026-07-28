/**
 * Notifications — Quality of Life v1
 *
 * Lightweight, web-only notification infrastructure:
 *
 *  - Browser push (window.Notification): used opportunistically while the
 *    tab is open. On mobile PWA installs that grant the permission the OS
 *    will display them too. Service-worker scheduled push and native push
 *    are out of scope for v1.
 *  - In-app inbox: a rolling list of recent notifications (stored in
 *    localStorage so guests benefit too). Surfaced by the bell in AppShell
 *    and the notifications page.
 *  - Scheduling: the home / shell calls `runDailyNotifications()` on app
 *    open. It checks last-fire timestamps and emits the daily history,
 *    re-engagement and seasonal notifications when due.
 *
 * Categories follow the spec:
 *   daily       — "حدث في مثل هذا اليوم"
 *   reengagement— "هل تعلم …" curiosity hooks after 24h inactivity
 *   season      — seasonal start / claimable reward
 *   campaign    — new / hidden campaign unlocked
 */

export type NotificationCategory = "daily" | "reengagement" | "season" | "campaign" | "friend";

export interface NotificationPrefs {
  master: boolean;
  daily: boolean;
  reengagement: boolean;
  season: boolean;
  campaign: boolean;
  friend?: boolean;
  /**
   * Phase 2c — controls the on-device Daily Challenge reminder
   * scheduled by `dailyChallengeScheduler.ts`. Kept in the SAME
   * `NotificationPrefs` shape as every other category so the
   * settings UI and the scheduler share a single source of truth.
   */
  dailyChallenge?: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  master: true,
  daily: true,
  reengagement: true,
  season: false, // LC1: season notifications disabled by default (feature hidden post-beta).
  campaign: true,
  friend: true,
  dailyChallenge: true,
};


export interface InAppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
  at: number;
  /** Legacy boolean flag — kept for back-compat with older stored items. */
  read?: boolean;
  /** Timestamp the user opened/read this notification. null/undefined = unread. */
  readAt?: number | null;
}

export const INBOX_KEY = "irth.notifications.inbox.v1";
const FIRED_KEY = "irth.notifications.fired.v1";
const LAST_OPEN_KEY = "irth.lastOpenedAt";
const MAX_INBOX = 50;

// ============== Inbox storage ==============

function read<T>(k: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write<T>(k: string, v: T): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function isUnread(n: InAppNotification): boolean {
  return !n.readAt && !n.read;
}

/**
 * Canonical reader for the current user's notification preferences.
 *
 * Reads the SAME `hakaya.profile.v2` storage slot that the settings
 * UI writes through `setNotificationPrefs` in `src/lib/profile.tsx`.
 * There is intentionally NO second server-side preference source
 * for the on-device Daily Challenge reminder — the scheduler must
 * go through this helper so a toggle in the settings screen takes
 * effect immediately.
 */
const PROFILE_STORAGE_KEY = "hakaya.profile.v2";
export function readCanonicalNotificationPrefs(): NotificationPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as { settings?: { notifications?: boolean; notificationPrefs?: Partial<NotificationPrefs> } };
    const nested = parsed?.settings?.notificationPrefs ?? {};
    const merged: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, ...nested };
    // The top-level `settings.notifications` flag is the legacy master
    // switch. When explicitly false it always wins.
    if (parsed?.settings && parsed.settings.notifications === false) {
      merged.master = false;
    }
    return merged;
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}


function emitUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("irth:notifications:updated"));
  }
}

export function getInbox(): InAppNotification[] {
  return read<InAppNotification[]>(INBOX_KEY, []);
}
export function unreadCount(): number {
  return getInbox().filter(isUnread).length;
}
/** Format unread count for badge: 0 hides, 1-99 number, 100+ → "99+". */
export function formatBadgeCount(n: number): string {
  if (n <= 0) return "";
  if (n > 9) return "9+";
  return String(n);
}

export function markRead(id: string): boolean {
  const now = Date.now();
  const current = getInbox();
  const target = current.find((n) => n.id === id);
  // Already read or doesn't exist — treat as a successful no-op.
  if (!target || !isUnread(target)) return true;
  const next = current.map((n) =>
    n.id === id && isUnread(n) ? { ...n, read: true, readAt: now } : n,
  );
  const ok = write(INBOX_KEY, next);
  // Only emit on a real, persisted change. If the write fails the inbox
  // stays unchanged on disk, so the next refresh will show the item as
  // unread again — preventing silent loss.
  if (ok) emitUpdated();
  return ok;
}
export function markAllRead(): boolean {
  const now = Date.now();
  const ok = write(INBOX_KEY, getInbox().map((n) => ({ ...n, read: true, readAt: n.readAt ?? now })));
  if (ok) emitUpdated();
  return ok;
}
export function clearInbox(): void { write(INBOX_KEY, []); emitUpdated(); }

export function pushInbox(n: InAppNotification): boolean {
  const list = [n, ...getInbox().filter((x) => x.id !== n.id)].slice(0, MAX_INBOX);
  const ok = write(INBOX_KEY, list);
  if (ok) emitUpdated();
  return ok;
}

// ============== Permission + delivery ==============

export async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    try { return await Notification.requestPermission(); } catch { return "denied"; }
  }
  return Notification.permission;
}

function deliverWithStatus(n: Omit<InAppNotification, "at" | "id"> & { id?: string }): { notification: InAppNotification; pushed: boolean } {
  // Stable ID contract: callers SHOULD pass a deterministic id. When they
  // don't we derive one from (category + title + today) instead of
  // `Date.now()` — a timestamped id made every retry, resync or restart
  // look like a brand-new notification, which is how duplicates got into
  // the inbox in the first place.
  const id = n.id ?? `${n.category}:${todayKey()}:${hashText(`${n.title}|${n.body}|${n.href ?? ""}`)}`;

  // Already delivered (this device, ever within the retained window) →
  // do not resurface it and do not re-fire the OS notification.
  const existing = getInbox().find((x) => x.id === id);
  // `pushed` means "present in the inbox", so an already-delivered
  // notification reports success — callers must not retry it forever.
  if (existing) return { notification: existing, pushed: true };

  const final: InAppNotification = {
    id,
    category: n.category,
    title: n.title,
    body: n.body,
    href: n.href,
    at: Date.now(),
    read: false,
    readAt: null,
  };
  const pushed = pushInbox(final);
  if (pushed && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(final.title, { body: final.body, tag: final.id, icon: "/favicon.ico" }); } catch { /* ignore */ }
  }
  return { notification: final, pushed };
}

/** Small stable non-crypto hash — deterministic across restarts. */
function hashText(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function deliver(n: Omit<InAppNotification, "at" | "id"> & { id?: string }): InAppNotification {
  return deliverWithStatus(n).notification;
}

/** Public deliver — used by ad-hoc notifications (friend requests, etc.). */
export function deliverNotification(
  n: Omit<InAppNotification, "at" | "id"> & { id?: string },
): InAppNotification {
  return deliver(n);
}

export function deliverNotificationWithStatus(
  n: Omit<InAppNotification, "at" | "id"> & { id?: string },
): { notification: InAppNotification; pushed: boolean } {
  return deliverWithStatus(n);
}

// ============== Scheduling guards (fire-once-per-day-ish) ==============

interface Fired { [k: string]: string }
function getFired(): Fired { return read<Fired>(FIRED_KEY, {}); }
function setFired(map: Fired): void { write(FIRED_KEY, map); }
function todayKey(): string { return new Date().toISOString().slice(0, 10); }

function shouldFireDailyish(key: string): boolean {
  const fired = getFired();
  return fired[key] !== todayKey();
}
function markFired(key: string): void {
  const fired = getFired();
  fired[key] = todayKey();
  setFired(fired);
}

// ============== Last-open tracking ==============

export function touchLastOpened(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
}
export function lastOpenedAt(): number {
  if (typeof localStorage === "undefined") return Date.now();
  const v = Number(localStorage.getItem(LAST_OPEN_KEY) ?? 0);
  return v || Date.now();
}

// ============== Curiosity hooks for re-engagement ==============

const REENGAGE_HOOKS: { title: string; body: string; href: string }[] = [
  { title: "هل تعلم من أسقط بغداد؟", body: "اكتشف قصة سقوط الخلافة العباسية في الموسوعة.", href: "/encyclopedia" },
  { title: "من القائد الذي هزم المغول؟", body: "تعرّف على قطز وعين جالوت في حملاتنا.", href: "/campaigns" },
  { title: "ماذا كان داخل بيت الحكمة؟", body: "زر الأطلس وادخل بغداد العباسية.", href: "/map" },
  { title: "كم استمرت الأندلس؟", body: "اكتشف قصة الأندلس من الفتح إلى السقوط في الموسوعة.", href: "/encyclopedia" },
  { title: "أين دُفن صلاح الدين؟", body: "تجوّل في دمشق الأيوبية واكتشف أثره.", href: "/encyclopedia" },
];

// ============== Public scheduler ==============

export interface SchedulerContext {
  prefs: NotificationPrefs;
  today?: { title: string; teaser: string; href: string } | null;
  // `season` context removed in Phase 3B (Seasons demo deleted).
}


/**
 * Call on every app open.
 *
 * ⚠️ Ownership boundary (duplicate-notification fix):
 *   "في مثل هذا اليوم" (`today_in_history`) and the 24h re-engagement
 *   reminder (`comeback_24h`) are owned END-TO-END by the server
 *   pipeline: the scheduled job creates ONE row with a stable
 *   `dedupe_key`, realtime + FCM deliver it, and the Notification
 *   Center reads the same row.
 *
 *   This local scheduler used to emit its own copy of both on every
 *   app open, so the player received the server push AND a locally
 *   generated twin. That was the real source of the duplicates — it is
 *   removed here rather than hidden in the UI.
 *
 *   What remains local: last-open tracking (used by the server job's
 *   inactivity window) and the ad-hoc `deliverNotification` helpers,
 *   which now require stable ids.
 */
export function runDailyNotifications(ctx: SchedulerContext): InAppNotification[] {
  if (!ctx.prefs.master) return [];
  // Update last-opened so the server-side inactivity window stays accurate.
  touchLastOpened();
  return [];
}

/** Fire a campaign-unlocked notification (call when a new/hidden campaign becomes available). */
export function notifyCampaignUnlocked(prefs: NotificationPrefs, campaign: { id: string; title: string; hidden?: boolean }): void {
  if (!prefs.master || !prefs.campaign) return;
  const key = `campaign:${campaign.id}`;
  if (!shouldFireDailyish(key)) return;
  deliver({
    category: "campaign",
    title: campaign.hidden ? "حملة سرّية فُتحت" : "حملة جديدة متاحة",
    body: campaign.title,
    href: "/campaigns",
  });
  markFired(key);
}

/**
 * Season-change notification removed in Phase 3B — kept as a no-op wrapper
 * for source compatibility with any lingering callers.
 */
export function notifySeasonChanged(_prefs: NotificationPrefs, _season: { id: string; name: string }): void {
  return;
}
