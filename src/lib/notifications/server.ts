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

function writeCache(rows: ServerNotification[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows.slice(0, 200)));
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
export async function fetchMyNotifications(limit = 100): Promise<ServerNotification[]> {
  try {
    // Guests have no inbox — the RPC is signed-in only.
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return readCache();
    const { data, error } = await supabase.rpc("list_my_notifications" as never, {
      p_limit: limit,
      p_before: null,
    } as never);
    if (error) throw error;
    const rows = (data as ServerNotification[] | null) ?? [];
    writeCache(rows);
    return rows;
  } catch (err) {
    console.warn("[notifications] fetch failed, using cache", err);
    return readCache();
  }
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
  try {
    await supabase.rpc("mark_notification_read" as never, { p_notification_id: notificationId } as never);
  } catch (err) {
    console.warn("[notifications] mark read failed", err);
  }
  const next = readCache().map((n) => (n.id === notificationId ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n));
  writeCache(next);
  emit();
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await supabase.rpc("mark_all_notifications_read" as never);
  } catch (err) {
    console.warn("[notifications] mark all read failed", err);
  }
  const now = new Date().toISOString();
  writeCache(readCache().map((n) => ({ ...n, read_at: n.read_at ?? now })));
  emit();
}

export async function deleteMyNotification(notificationId: string): Promise<void> {
  try {
    await supabase.rpc("delete_my_notification" as never, { p_notification_id: notificationId } as never);
  } catch (err) {
    console.warn("[notifications] delete failed", err);
  }
  writeCache(readCache().filter((n) => n.id !== notificationId));
  emit();
}

export async function clearMyNotifications(): Promise<void> {
  try {
    await supabase.rpc("clear_my_notifications" as never);
  } catch (err) {
    console.warn("[notifications] clear failed", err);
  }
  writeCache([]);
  emit();
}

export async function recordDismissed(notificationId: string): Promise<void> {
  try {
    await supabase.rpc("record_notification_dismissed" as never, { p_notification_id: notificationId } as never);
  } catch { /* analytics only — non-fatal */ }
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
 */
export function subscribeToMyNotifications(onChange: () => void): () => void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return () => {};
  let alive = true;
  const channels: Array<ReturnType<typeof supabase.channel>> = [];

  (async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!alive || !uid) return;

    // Per-user deliveries (read/dismissed/deleted state).
    channels.push(
      supabase
        .channel(`notif-deliveries-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notification_deliveries", filter: `user_id=eq.${uid}` },
          () => onChange(),
        )
        .subscribe(),
    );

    // Notifications inserts: catches both direct (target_user_id=uid) and
    // broadcast/all rows that have no per-user delivery row yet. RLS
    // ensures the user only sees rows they are allowed to read.
    channels.push(
      supabase
        .channel(`notif-inserts-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications" },
          () => onChange(),
        )
        .subscribe(),
    );
  })();

  return () => {
    alive = false;
    for (const c of channels) supabase.removeChannel(c);
  };
}

// Augment cache type at runtime (typed as optional here to avoid breaking the row interface).
declare module "./server" {
  interface ServerNotification {
    deleted_locally?: boolean;
  }
}
