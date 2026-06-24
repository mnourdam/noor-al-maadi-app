import { useEffect } from "react";
import { useAccount } from "@/lib/account";
import { useProfile } from "@/lib/profile";
import { listFriendships } from "@/lib/social";
import { DEFAULT_NOTIFICATION_PREFS, deliverNotification } from "@/lib/notifications";

/**
 * Quietly polls the friendships table every 60s while signed in and emits
 * in-app notifications when:
 *  - a new friend request arrives (incoming pending row we haven't seen)
 *  - one of our outgoing requests transitions to accepted
 *
 * State is cached in localStorage so we don't re-notify across reloads.
 */
const SEEN_KEY = "irth.friends.seen.v1";

interface SeenState {
  incoming: string[];   // friendship row ids
  accepted: string[];   // friendship row ids
}

function readSeen(): SeenState {
  if (typeof localStorage === "undefined") return { incoming: [], accepted: [] };
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenState) : { incoming: [], accepted: [] };
  } catch { return { incoming: [], accepted: [] }; }
}
function writeSeen(s: SeenState) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function FriendNotificationsPoller() {
  const { user } = useAccount();
  const { profile } = useProfile();
  const initRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    const prefs = profile.settings?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
    if (!prefs.master) return;
    let cancelled = false;

    async function tick() {
      try {
        const list = await listFriendships(user!.id);
        if (cancelled) return;
        const seen = readSeen();
        const nextIncoming = new Set(seen.incoming);
        const nextAccepted = new Set(seen.accepted);

        for (const f of list) {
          const name = (f.other.display_name?.trim() || f.other.username || "صديق");
          if (f.direction === "incoming" && !seen.incoming.includes(f.row.id)) {
            nextIncoming.add(f.row.id);
            // First sync after sign-in: don't spam with backlog notifications.
            if (initRef.current) {
              deliverNotification({
                id: `friend_request:${f.row.id}`,
                category: "friend",
                title: "طلب صداقة جديد",
                body: `أرسل إليك ${name} طلب صداقة`,
                href: "/friends?tab=requests",
              });
            }
          }
          if (f.direction === "accepted" && !seen.accepted.includes(f.row.id)) {
            nextAccepted.add(f.row.id);
            if (initRef.current && f.row.requester === user!.id) {
              deliverNotification({
                id: `friend_request_accepted:${f.row.id}`,
                category: "friend",
                title: "تم قبول طلب الصداقة",
                body: `قبل ${name} طلب صداقتك`,
                href: "/friends",
              });
            }
          }
        }

        writeSeen({ incoming: Array.from(nextIncoming), accepted: Array.from(nextAccepted) });
        initRef.current = true;
      } catch { /* ignore network blips */ }
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