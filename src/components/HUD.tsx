import { useEffect, useState } from "react";
import { Heart, Coins, Flame, Bell, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProfile } from "@/lib/profile";
import { HEART_MAX, getEffectiveHearts, msUntilNextHeart, formatHeartTimer } from "@/lib/hearts";
import { unreadCount, formatBadgeCount } from "@/lib/notifications";

/**
 * Compact top-of-screen HUD: hearts, dinars, streak.
 * Lives inside AppShell so every screen sees it.
 */
export function HUD() {
  const { profile } = useProfile();
  const [, force] = useState(0);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    const recount = () => setUnread(unreadCount());
    recount();
    window.addEventListener("irth:notifications:updated", recount);
    const focus = () => recount();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(id);
      window.removeEventListener("irth:notifications:updated", recount);
      window.removeEventListener("focus", focus);
    };
  }, []);

  const now = Date.now();
  const hearts = getEffectiveHearts(profile, now);
  const next = msUntilNextHeart(profile, now);
  const mins = Math.max(1, Math.ceil(next / 60_000));

  return (
    <div className="sticky top-0 z-40 mx-auto w-full max-w-md px-3 pt-2">
      <div className="glass flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-background/70 px-3 py-1.5 backdrop-blur-md">
        <div className="flex items-center gap-0.5">
          {Array.from({ length: HEART_MAX }).map((_, i) => (
            <Heart
              key={i}
              className={`size-3.5 ${i < hearts ? "fill-red-500 text-red-500" : "text-white/20"}`}
              strokeWidth={1.8}
            />
          ))}
          {hearts < HEART_MAX && (
            <span className="ms-1 text-[10px] tabular-nums text-muted-foreground">{mins}د</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-gold">
            <Coins className="size-3.5" /> {profile.dinars.toLocaleString("en-US")}
          </span>
          <span className="inline-flex items-center gap-1 text-amber-200">
            <Star className="size-3.5" /> {profile.points.toLocaleString("en-US")}
          </span>
          <span className="inline-flex items-center gap-1 text-orange-400">
            <Flame className="size-3.5" /> {profile.streak.toLocaleString("en-US")}
          </span>
          <Link to="/notifications" className="relative inline-flex items-center text-muted-foreground hover:text-gold" aria-label="الإشعارات">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -left-1 grid min-w-[16px] h-[16px] place-items-center rounded-full bg-gradient-gold px-1 text-[9px] font-bold text-primary-foreground">
                {formatBadgeCount(unread)}
              </span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}