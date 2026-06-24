import { useEffect } from "react";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { listFriendships } from "@/lib/social";
import { DEFAULT_NOTIFICATION_PREFS, INBOX_KEY, deliverNotificationWithStatus, getInbox, unreadCount } from "@/lib/notifications";

/**
 * Quietly polls the friendships table every 60s while signed in and emits
 * in-app notifications when:
 *  - a new friend request arrives (incoming pending row we haven't seen)
 *  - one of our outgoing requests transitions to accepted
 *
 * State is cached in localStorage so we don't re-notify across reloads.
 */
export const FRIEND_NOTIFICATIONS_SEEN_KEY = "irth.friends.seen.v1";

interface SeenState {
  incoming: string[];   // friendship row ids
  accepted: string[];   // friendship row ids
}

export interface FriendNotificationRowDebug {
  rowId: string;
  status: string;
  direction: string;
  requester: string;
  userA: string;
  userB: string;
  otherId: string;
  otherName: string;
  notificationId: string | null;
  blockedBySeen: boolean;
  deliverNotificationCalled: boolean;
  deliveredToInbox: boolean;
  error: string | null;
}

export interface FriendNotificationPollerDiagnostics {
  mounted: boolean;
  mountedCount: number;
  source: string;
  ranAt: number;
  userId: string;
  seenKey: string;
  inboxKey: string;
  friendshipCount: number;
  incomingPending: unknown[];
  outgoingAccepted: unknown[];
  generatedNotificationIds: string[];
  currentSeen: SeenState;
  rows: FriendNotificationRowDebug[];
  deliverNotificationCalledIds: string[];
  inboxCount: number;
  unreadCount: number;
  error: string | null;
}

interface FriendPollerDebugState {
  mounted: boolean;
  mountedCount: number;
  lastMountedAt: number | null;
  lastUnmountedAt: number | null;
  lastTick: FriendNotificationPollerDiagnostics | null;
}

const debugFallback: FriendPollerDebugState = {
  mounted: false,
  mountedCount: 0,
  lastMountedAt: null,
  lastUnmountedAt: null,
  lastTick: null,
};

type DebugWindow = Window & { __irthFriendNotificationsPoller?: FriendPollerDebugState };

function debugState(): FriendPollerDebugState {
  if (typeof window === "undefined") return debugFallback;
  const w = window as DebugWindow;
  if (!w.__irthFriendNotificationsPoller) w.__irthFriendNotificationsPoller = { ...debugFallback };
  return w.__irthFriendNotificationsPoller;
}

function emitDebugUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("irth:friend-notifications:debug"));
}

function setMounted(mounted: boolean) {
  const state = debugState();
  state.mountedCount = Math.max(0, state.mountedCount + (mounted ? 1 : -1));
  state.mounted = state.mountedCount > 0;
  if (mounted) state.lastMountedAt = Date.now();
  else state.lastUnmountedAt = Date.now();
  emitDebugUpdated();
}

function setLastTick(diag: FriendNotificationPollerDiagnostics) {
  const state = debugState();
  state.lastTick = diag;
  emitDebugUpdated();
}

export function getFriendNotificationsDebugState(): FriendPollerDebugState {
  const state = debugState();
  return {
    mounted: state.mounted,
    mountedCount: state.mountedCount,
    lastMountedAt: state.lastMountedAt,
    lastUnmountedAt: state.lastUnmountedAt,
    lastTick: state.lastTick,
  };
}

export function readFriendNotificationSeen(): SeenState {
  if (typeof localStorage === "undefined") return { incoming: [], accepted: [] };
  try {
    const raw = localStorage.getItem(FRIEND_NOTIFICATIONS_SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenState) : { incoming: [], accepted: [] };
  } catch { return { incoming: [], accepted: [] }; }
}
function writeSeen(s: SeenState): boolean {
  try {
    localStorage.setItem(FRIEND_NOTIFICATIONS_SEEN_KEY, JSON.stringify(s));
    return true;
  } catch { return false; }
}
export function clearFriendNotificationSeen() {
  try { localStorage.removeItem(FRIEND_NOTIFICATIONS_SEEN_KEY); } catch { /* ignore */ }
}

export async function runFriendNotificationPollerTick(
  userId: string,
  options: { deliver?: boolean; source?: string; isCancelled?: () => boolean } = {},
): Promise<FriendNotificationPollerDiagnostics> {
  const deliver = options.deliver ?? true;
  const source = options.source ?? "manual";
  const state = getFriendNotificationsDebugState();
  const seen = readFriendNotificationSeen();
  const diag: FriendNotificationPollerDiagnostics = {
    mounted: state.mounted,
    mountedCount: state.mountedCount,
    source,
    ranAt: Date.now(),
    userId,
    seenKey: FRIEND_NOTIFICATIONS_SEEN_KEY,
    inboxKey: INBOX_KEY,
    friendshipCount: 0,
    incomingPending: [],
    outgoingAccepted: [],
    generatedNotificationIds: [],
    currentSeen: seen,
    rows: [],
    deliverNotificationCalledIds: [],
    inboxCount: getInbox().length,
    unreadCount: unreadCount(),
    error: null,
  };

  try {
    const list = await listFriendships(userId);
    if (options.isCancelled?.()) {
      diag.error = "cancelled";
      setLastTick(diag);
      return diag;
    }

    diag.friendshipCount = list.length;
    diag.incomingPending = list
      .filter((f) => f.direction === "incoming" && f.row.status === "pending")
      .map((f) => ({ row: f.row, other: f.other }));
    diag.outgoingAccepted = list
      .filter((f) => f.direction === "accepted" && f.row.status === "accepted" && f.row.requester === userId)
      .map((f) => ({ row: f.row, other: f.other }));

    const nextIncoming = new Set(seen.incoming);
    const nextAccepted = new Set(seen.accepted);
    let changedSeen = false;

    for (const f of list) {
      const name = (f.other.display_name?.trim() || f.other.username || "صديق");
      const isIncoming = f.direction === "incoming" && f.row.status === "pending";
      const isAccepted = f.direction === "accepted" && f.row.status === "accepted" && f.row.requester === userId;
      if (!isIncoming && !isAccepted) continue;

      const notificationId = isIncoming ? `friend_request:${f.row.id}` : `friend_request_accepted:${f.row.id}`;
      const blockedBySeen = isIncoming ? seen.incoming.includes(f.row.id) : seen.accepted.includes(f.row.id);
      const rowDebug: FriendNotificationRowDebug = {
        rowId: f.row.id,
        status: f.row.status,
        direction: f.direction,
        requester: f.row.requester,
        userA: f.row.user_a,
        userB: f.row.user_b,
        otherId: f.other.id,
        otherName: name,
        notificationId,
        blockedBySeen,
        deliverNotificationCalled: false,
        deliveredToInbox: false,
        error: null,
      };
      diag.generatedNotificationIds.push(notificationId);

      if (!blockedBySeen && deliver) {
        rowDebug.deliverNotificationCalled = true;
        diag.deliverNotificationCalledIds.push(notificationId);
        try {
          const result = deliverNotificationWithStatus(isIncoming ? {
            id: notificationId,
            category: "friend",
            title: "طلب صداقة جديد",
            body: `أرسل إليك ${name} طلب صداقة`,
            href: "/friends?tab=requests",
          } : {
            id: notificationId,
            category: "friend",
            title: "تم قبول طلب الصداقة",
            body: `قبل ${name} طلب صداقتك`,
            href: "/friends",
          });
          rowDebug.deliveredToInbox = result.pushed && getInbox().some((n) => n.id === notificationId);
          if (rowDebug.deliveredToInbox) {
            if (isIncoming) nextIncoming.add(f.row.id);
            else nextAccepted.add(f.row.id);
            changedSeen = true;
          } else {
            rowDebug.error = "deliverNotification returned, but notification id was not found in inbox";
          }
        } catch (error) {
          rowDebug.error = error instanceof Error ? error.message : String(error);
        }
      }

      diag.rows.push(rowDebug);
    }

    if (changedSeen) {
      const ok = writeSeen({ incoming: Array.from(nextIncoming), accepted: Array.from(nextAccepted) });
      if (!ok) diag.error = "Delivered notification, but failed to write friend seen set";
    }

    diag.currentSeen = readFriendNotificationSeen();
    diag.inboxCount = getInbox().length;
    diag.unreadCount = unreadCount();
  } catch (error) {
    diag.error = error instanceof Error ? error.message : String(error);
  }

  setLastTick(diag);
  return diag;
}

export function FriendNotificationsPoller() {
  const { user } = useAccount();
  const { profile } = useProfile();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    const prefs = profile.settings?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
    if (!prefs.master || prefs.friend === false) return;
    let cancelled = false;

    async function tick() {
      await runFriendNotificationPollerTick(user!.id, {
        deliver: true,
        source: "mounted-poller",
        isCancelled: () => cancelled,
      });
    }

    tick();
    const id = setInterval(tick, 60_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, profile.settings?.notificationPrefs]);

  return null;
}