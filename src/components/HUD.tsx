import { useEffect, useRef, useState } from "react";
import { Heart, Coins, Flame, Bell, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProfile } from "@/lib/profile";
import { HEART_MAX, getEffectiveHearts, msUntilNextHeart, formatHeartTimer } from "@/lib/hearts";
import { formatBadgeCount } from "@/lib/notifications";
import { fetchMyUnreadCount, subscribeToMyNotifications } from "@/lib/notifications/server";
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonalInboxBell } from "./notifications/PersonalInboxBell";
import { HeartsPopover, DinarsPopover, XPPopover, StreakPopover } from "./HUDStatPopovers";
import { AnimatedNumber } from "./motion/MotionPrimitives";


type BumpKey = "dinars" | "points" | "hearts";

/**
 * Compact top-of-screen HUD: hearts, dinars, streak.
 * Lives inside AppShell so every screen sees it.
 */
export function HUD() {
  const { profile } = useProfile();
  const [, force] = useState(0);
  const [unread, setUnread] = useState(0);
  const androidStable = isAndroidUltraStableMode();
  const disableGlobalFocusBlur = isAndroidFocusABDisabled("disableGlobalFocusBlur");

  useEffect(() => {
    const id = androidStable ? null : setInterval(() => force((n) => n + 1), 1_000);
    let cancelled = false;
    const recount = async () => {
      // Single source of truth: derive the badge from the same list the
      // Notification Center renders. `fetchMyUnreadCount` handles offline
      // / cache fallback internally and never throws.
      const n = await fetchMyUnreadCount();
      if (cancelled) return;
      setUnread(n);
    };

    void recount();
    const unsubRealtime = subscribeToMyNotifications(() => { void recount(); });
    // Always listen for the in-app update event — it's how foreground pushes,
    // mark-read, dismiss, and delete actions sync the badge across the app.
    window.addEventListener("irth:notifications:updated", recount);
    if (androidStable) {
      return () => {
        cancelled = true;
        window.removeEventListener("irth:notifications:updated", recount);
        unsubRealtime();
      };
    }
    const focus = () => { void recount(); };
    if (!disableGlobalFocusBlur) window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      window.removeEventListener("irth:notifications:updated", recount);
      if (!disableGlobalFocusBlur) window.removeEventListener("focus", focus);
      unsubRealtime();
    };

  }, [androidStable, disableGlobalFocusBlur]);


  const now = Date.now();
  const hearts = getEffectiveHearts(profile, now);
  const next = msUntilNextHeart(profile, now);

  // ----- Live stat bump animations -----
  const prevRef = useRef({ dinars: profile.dinars, points: profile.points, hearts });
  const [bump, setBump] = useState<Record<BumpKey, number>>({ dinars: 0, points: 0, hearts: 0 });
  const [heartShake, setHeartShake] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    const next: Partial<Record<BumpKey, number>> = {};
    if (profile.dinars > prev.dinars) next.dinars = Date.now();
    if (profile.points > prev.points) next.points = Date.now();
    if (hearts > prev.hearts) next.hearts = Date.now();
    if (hearts < prev.hearts) setHeartShake((n) => n + 1);
    prevRef.current = { dinars: profile.dinars, points: profile.points, hearts };
    if (Object.keys(next).length) setBump((b) => ({ ...b, ...next }));
  }, [profile.dinars, profile.points, hearts]);

  useEffect(() => {
    const onLost = () => setHeartShake((n) => n + 1);
    window.addEventListener("irth:heart-lost", onLost);
    return () => window.removeEventListener("irth:heart-lost", onLost);
  }, []);

  const bumpCls = (key: BumpKey) =>
    bump[key] && Date.now() - bump[key] < 700 ? "hud-bump" : "";

  return (
    <div
      className="sticky top-0 z-40 mx-auto w-full max-w-md md:max-w-2xl lg:max-w-3xl px-3 pt-2"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="glass flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-background/70 px-3 py-1.5 backdrop-blur-md">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="القلوب"
              key={heartShake}
              className={`flex items-center gap-0.5 rounded-lg px-1 py-1 -mx-1 -my-1 transition hover:bg-white/5 active:bg-white/10 ${heartShake ? "hud-shake" : ""}`}
            >
              {Array.from({ length: HEART_MAX }).map((_, i) => (
                <Heart
                  key={i}
                  className={`size-3.5 ${i < hearts ? "fill-red-500 text-red-500" : "text-white/20"}`}
                  strokeWidth={1.8}
                />
              ))}
              {hearts < HEART_MAX && (
                <span className="ms-1 text-[10px] tabular-nums text-muted-foreground" aria-label="القلب التالي خلال">
                  {formatHeartTimer(next)}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={8} className="w-72 border-gold/25 bg-background/95 backdrop-blur-md">
            <HeartsPopover profile={profile} />
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1.5 text-[11px]">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="الدنانير"
                className={`motion-tap inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-gold transition hover:bg-white/5 active:bg-white/10 ${bumpCls("dinars")}`}
              >
                <Coins className="size-3.5" /> <AnimatedNumber value={profile.dinars} />

              </button>
            </PopoverTrigger>
            <PopoverContent align="center" sideOffset={8} className="w-72 border-gold/25 bg-background/95 backdrop-blur-md">
              <DinarsPopover profile={profile} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="الخبرة"
                className={`motion-tap inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-amber-200 transition hover:bg-white/5 active:bg-white/10 ${bumpCls("points")}`}
              >
                <Star className="size-3.5" /> <AnimatedNumber value={profile.points} />

              </button>
            </PopoverTrigger>
            <PopoverContent align="center" sideOffset={8} className="w-72 border-gold/25 bg-background/95 backdrop-blur-md">
              <XPPopover profile={profile} />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="الحماسة"
                className="motion-tap inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-orange-400 transition hover:bg-white/5 active:bg-white/10"
              >
                <Flame className="size-3.5" /> <AnimatedNumber value={profile.streak} />

              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-72 border-gold/25 bg-background/95 backdrop-blur-md">
              <StreakPopover profile={profile} />
            </PopoverContent>
          </Popover>

          <Link to="/notifications" className="relative inline-flex items-center text-muted-foreground hover:text-gold" aria-label="الإشعارات">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -left-1 grid min-w-[16px] h-[16px] place-items-center rounded-full bg-gradient-gold px-1 text-[9px] font-bold text-primary-foreground">
                {formatBadgeCount(unread)}
              </span>
            )}
          </Link>
          {/* Personal inbox (P6 Step 3): visually leftmost in the RTL header.
              Only rendered for authenticated users; the component itself
              returns null for guests. */}
          <PersonalInboxBell />
        </div>
      </div>
    </div>
  );
}