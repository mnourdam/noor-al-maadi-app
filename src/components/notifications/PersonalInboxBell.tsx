// ============================================================
// <PersonalInboxBell /> — quiet unread indicator with deep link
// ------------------------------------------------------------
// FROZEN COMPONENT CONTRACT (P6 Step 3).
// Communicates "there is something meaningful waiting for you",
// never "click me". Rules:
//   * No sound. No toast. No popover feed.
//   * Subtle unread dot (no numeric explosion in the header).
//   * No bouncing, pulsing, or attention-seeking animations.
//   * Polls at a slow interval (60s) plus a fetch on focus/mount.
//   * Anon users get nothing rendered.
// ============================================================

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccount } from "@/lib/account";
import { useOnline } from "@/hooks/useOnline";
import { unreadNotificationCount } from "@/lib/notifications/personal";

interface Props {
  className?: string;
}

export function PersonalInboxBell({ className }: Props) {
  const { user } = useAccount();
  const online = useOnline();
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!user || !online) return;
    let alive = true;
    const load = () => {
      void unreadNotificationCount().then((n) => {
        if (alive) setCount(n);
      });
    };
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, online]);

  if (!user) return null;

  const hasUnread = count > 0;
  const label = hasUnread ? `الصندوق الشخصي: يوجد جديد` : "الصندوق الشخصي";

  return (
    <Link
      to="/inbox"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex items-center justify-center text-muted-foreground transition-colors",
        "hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md",
        className,
      )}
    >
      <Bell className="size-4" aria-hidden="true" strokeWidth={1.8} />
      {hasUnread && (
        <span
          // Small, static gold dot. No pulse, no bounce, no ring animation.
          className="pointer-events-none absolute -top-0.5 -left-0.5 size-1.5 rounded-full bg-gold"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
