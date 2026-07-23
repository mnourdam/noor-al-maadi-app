// ============================================================
// <PersonalInboxBell /> — quiet unread badge with deep link
// ------------------------------------------------------------
// Aligned to P6.3 principles:
//   * No sound. No toast. No popover with a scrolling feed.
//   * A small bell with an unread number, linking to /inbox.
//   * Polls at a slow interval (60s) plus a fetch on mount.
//   * Anon users get nothing rendered.
//
// Placement is left to the app shell; this component is safe
// to render anywhere in an authenticated tree.
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

  const label = count > 0 ? `الصندوق: ${count} غير مقروء` : "الصندوق";
  return (
    <Link
      to="/inbox"
      aria-label={label}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/30 text-foreground/80",
        "hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Bell className="size-4" aria-hidden="true" />
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-medium tabular-nums text-background"
          aria-live="polite"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
