/**
 * Server bridge for the Notification Center.
 *
 * - Notifications and per-user state live in Supabase (notifications +
 *   notification_deliveries). They are the durable source of truth and
 *   survive across devices.
 * - The legacy local inbox (src/lib/notifications.ts) is kept for guests
 *   and as an offline fallback; once the user signs back in, the server
 *   list takes precedence.
 *
 * All RPCs used here are SECURITY DEFINER and gated on auth.uid().
 */

import { supabase } from "@/integrations/supabase/client";
import type { NotificationPayload } from "./deepLink";
import { getActiveOwner, getIdentityEpoch, ownerUserId, onOwnerChange } from "@/lib/identity/owner";

export interface ServerNotification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  category: string | null;
  icon: string | null;
  image_url: string | null;
  deep_link: string | null;
  payload: NotificationPayload | null;
  priority: "low" | "normal" | "high";
  sender: "system" | "admin" | string;
  created_at: string;
  sent_at: string | null;
  delivery_id: string | null;
  read_at: string | null;
  opened_at: string | null;
  dismissed_at: string | null;
}

const CACHE_KEY = "irth.notifications.serverCache.v1";

function readCache(): ServerNotification[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ServerNotification[]) : [];
  } catch {
    return [];
  }
}

function writeCache(rows: ServerNotification[], current: () => boolean = () => true) {
  if (typeof localStorage === "undefined") return;
  try {
    const serialized = JSON.stringify(rows.slice(0, 200));
    if (current()) localStorage.setItem(CACHE_KEY, serialized);
  } catch { /* quota — ignore */ }
}

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("irth:notifications:updated"));
  }
}

/**
 * Fetch the user's notification list. Falls back to the offline cache if
 * the network is unreachable or the user is not signed in.
 */
// In-flight sharing only: no result cache, paging normalization or cross-limit reuse.
export const NOTIFICATION_LIST_WAIT_MS = 10_000;
let listGeneration = 0;
const listFlights = new Map<string, Map<number, Promise<ServerNotification[]>>>();
function identityScope() {
  const owner = getActiveOwner(), epoch = getIdentityEpoch();
  return { owner, current: () => getActiveOwner() === owner && getIdentityEpoch() === epoch };
}
function invalidateLists() { listGeneration += 1; }
export function fetchMyNotifications(limit = 100): Promise<ServerNotification[]> {
  const scope = identityScope(), generation = listGeneration;
  const key = JSON.stringify([scope.owner, getIdentityEpoch(), generation]);
  let flights = listFlights.get(key);
  if (!flights) { flights = new Map(); listFlights.set(key, flights); }
  const existing = flights.get(limit);
  if (existing) return existing;
  let retired = false;
  const current = () => !retired && scope.current() && listGeneration === generation;
  const fallback = () => {
    if (!current()) return [];
    const rows = readCache();
    return current() ? rows : [];
  };
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<ServerNotification[]>((resolve) => {
    timer = setTimeout(() => {
      const rows = fallback();
      retired = true;
      resolve(rows);
    }, NOTIFICATION_LIST_WAIT_MS);
  });
  const work = Promise.resolve().then(async () => {
    try {
      if (!current()) return [];
      const { data: sess } = await supabase.auth.getSession();
      if (!current()) return [];
      // Preserve current-owner offline fallback when auth is unavailable.
      if (!sess.session) return fallback();
      if (sess.session.user.id !== ownerUserId(scope.owner)) return [];
      const { data, error } = await supabase.rpc("list_my_notifications" as never, {
        p_limit: limit, p_before: null,
      } as never);
      if (!current()) return [];
      if (error) throw error;
      const rows = (data as ServerNotification[] | null) ?? [];
      if (!current()) return [];
      writeCache(rows, current);
      return current() ? rows : [];
    } catch {
      return fallback();
    }
  });
  const result = Promise.race([work, deadline]);
  flights.set(limit, result);
  const cleanup = () => {
    retired = true;
    clearTimeout(timer);
    if (flights!.get(limit) === result) flights!.delete(limit);
    if (!flights!.size && listFlights.get(key) === flights) listFlights.delete(key);
  };
  void result.then(cleanup, cleanup);
  return result;
}


export async function fetchMyUnreadCount(): Promise<number> {
  // Derive the badge from the SAME list the Notification Center renders,
  // so the two can never disagree (e.g. server RPC counts deliveries that
  // no longer surface in list_my_notifications after cleanup/RLS changes).
  // On failure/offline we still fall back to the cached list.
  try {
    const rows = await fetchMyNotifications(200);
    return rows.filter((n) => !n.read_at && !n.dismissed_at && !n.deleted_locally).length;
  } catch {
    return readCache().filter((n) => !n.read_at && !n.dismissed_at && !n.deleted_locally).length;
  }
}


export async function markNotificationRead(notificationId: string): Promise<void> {
  const scope = identityScope();
  invalidateLists();
  // NOTE: `mark_notification_read` belongs to the *personal* inbox
  // (personal_notifications). The Notification Center is backed by
  // notification_deliveries — it must use the delivery-scoped RPCs, or the
  // write silently lands on the wrong table and the badge never clears.
  try {
    const { error } = await supabase.rpc("mark_my_notification_read" as never, {
      p_notification_id: notificationId,
    } as never);
    if (error) throw error;
  } catch (err) {
    console.warn("[notifications] mark read failed", err);
  }
  if (!scope.current()) return;
  invalidateLists();
  const next = readCache().map((n) => (n.id === notificationId ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
  writeCache(next, scope.current);
  if (scope.current()) emit();
}

export async function markAllNotificationsRead(): Promise<void> {
  const scope = identityScope();
  invalidateLists();
  const now = new Date().toISOString();
  // Write cache first so the badge clears instantly, then persist.
  writeCache(readCache().map((n) => ({ ...n, read_at: n.read_at ?? now })), scope.current);
  if (!scope.current()) return;
  emit();
  if (!scope.current()) return;
  try {
    const { error } = await supabase.rpc("mark_all_my_notifications_read" as never);
    if (error) throw error;
  } catch (err) {
    console.warn("[notifications] mark all read failed", err);
  }
  if (!scope.current()) return;
  invalidateLists();
  // Re-sync from the server so the cache reflects the durable truth.
  await fetchMyNotifications(200);
  if (scope.current()) emit();
}


export async function deleteMyNotification(notificationId: string): Promise<void> {
  const scope = identityScope();
  invalidateLists();
  try {
    await supabase.rpc("delete_my_notification" as never, { p_notification_id: notificationId } as never);
  } catch (err) {
    console.warn("[notifications] delete failed", err);
  }
  if (!scope.current()) return;
  invalidateLists();
  writeCache(readCache().filter((n) => n.id !== notificationId), scope.current);
  if (scope.current()) emit();
}

export async function clearMyNotifications(): Promise<void> {
  const scope = identityScope();
  invalidateLists();
  try {
    await supabase.rpc("clear_my_notifications" as never);
  } catch (err) {
    console.warn("[notifications] clear failed", err);
  }
  if (!scope.current()) return;
  invalidateLists();
  writeCache([], scope.current);
  if (scope.current()) emit();
}

export async function recordDismissed(notificationId: string): Promise<void> {
  const scope = identityScope();
  invalidateLists();
  try {
    await supabase.rpc("record_notification_dismissed" as never, { p_notification_id: notificationId } as never);
  } catch { /* analytics only — non-fatal */ }
  if (scope.current()) invalidateLists();
}

export interface NotificationPreferences {
  [category: string]: boolean | undefined;
}

export async function fetchMyPreferences(): Promise<NotificationPreferences> {
  try {
    const { data, error } = await supabase.rpc("get_my_notification_preferences" as never);
    if (error) throw error;
    return ((data as NotificationPreferences | null) ?? {});
  } catch {
    return {};
  }
}

export async function setMyPreferences(prefs: NotificationPreferences): Promise<void> {
  try {
    await supabase.rpc("set_my_notification_preferences" as never, { p_categories: prefs } as never);
  } catch (err) {
    console.warn("[notifications] save prefs failed", err);
  }
}

/**
 * Subscribe to realtime delivery updates for the current user.
 * Returns an unsubscribe function. Re-fetches the list on any change so
 * the Bell badge and Notification Center stay in sync.
 *
 * Phase 3B (R3): a single shared, ref-counted pair of channels is opened for
 * the whole session no matter how many components subscribe (InAppBanner,
 * HUD, home, /notifications). Every listener still gets every event, filters
 * are unchanged, and the channels are removed once the last listener leaves.
 */
type NotifListener = () => void;

let sharedListeners = new Set<NotifListener>();
let sharedTeardown: (() => void) | null = null;
let releaseSharedOwner: (() => void) | null = null;

function notifyShared(current: () => boolean) {
  for (const fn of Array.from(sharedListeners)) {
    if (!current()) return;
    try { fn(); } catch { /* listener errors are non-fatal */ }
  }
}

function openSharedChannels() {
  const scope = identityScope(), uid = ownerUserId(scope.owner);
  let alive = true;
  const channels: Array<ReturnType<typeof supabase.channel>> = [];
  const current = () => alive && scope.current() && sharedListeners.size > 0;
  const remove = (channel: ReturnType<typeof supabase.channel>) => {
    try { void Promise.resolve(supabase.removeChannel(channel)).catch(() => {}); }
    catch { /* removal cannot revive retired callbacks */ }
  };
  const teardown = () => {
    alive = false;
    // Detach before SDK calls: synchronous reentry must not clear a successor.
    if (sharedTeardown === teardown) sharedTeardown = null;
    for (const channel of channels.splice(0)) remove(channel);
  };
  sharedTeardown = teardown;
  if (!uid) return;

  void (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !current() || data.user?.id !== uid) return;
      const add = (name: string, filter: { event: "*" | "INSERT"; schema: string; table: string; filter?: string }) => {
        if (!current()) return;
        const channel = supabase.channel(name).on("postgres_changes", filter, () => notifyShared(current));
        if (!current()) { remove(channel); return; }
        channels.push(channel);
        channel.subscribe();
        if (!current()) teardown();
      };
      add(`notif-deliveries-${uid}`, { event: "*", schema: "public", table: "notification_deliveries", filter: `user_id=eq.${uid}` });
      // RLS still determines accessible direct/broadcast inserts.
      add(`notif-inserts-${uid}`, { event: "INSERT", schema: "public", table: "notifications" });
    } catch { teardown(); /* auth/channel failures are non-fatal, no retry */ }
  })();
}

export function subscribeToMyNotifications(onChange: () => void): () => void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return () => {};

  const firstListener = sharedListeners.size === 0;
  sharedListeners.add(onChange);
  if (firstListener) {
    releaseSharedOwner = onOwnerChange(() => {
      const scope = identityScope();
      sharedTeardown?.();
      if (scope.current() && sharedListeners.size > 0) openSharedChannels();
    });
    openSharedChannels();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    sharedListeners.delete(onChange);
    if (sharedListeners.size === 0) {
      releaseSharedOwner?.();
      releaseSharedOwner = null;
      sharedTeardown?.();
    }
  };
}


// Augment cache type at runtime (typed as optional here to avoid breaking the row interface).
declare module "./server" {
  interface ServerNotification {
    deleted_locally?: boolean;
  }
}
