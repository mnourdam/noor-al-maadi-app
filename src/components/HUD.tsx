import { useEffect, useRef, useState } from "react";
import { Heart, Coins, Flame, Bell, Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProfile } from "@/lib/profile";
import { HEART_MAX, getEffectiveHearts, msUntilNextHeart, formatHeartTimer } from "@/lib/hearts";
import { unreadCount, formatBadgeCount } from "@/lib/notifications";
import { fetchMyUnreadCount, subscribeToMyNotifications } from "@/lib/notifications/server";
import { isAndroidUltraStableMode } from "@/lib/androidFreezeDiagnostics";
import { isAndroidFocusABDisabled } from "@/lib/androidFocusAB";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HeartsPopover, DinarsPopover, XPPopover, StreakPopover } from "./HUDStatPopovers";

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
    let serverAuthoritative = false;
    const recount = async () => {
      // Server is source of truth. Local cache is only used before the first
      // successful server fetch (guest/offline cold-start).
      try {
        const n = await fetchMyUnreadCount();
        serverAuthoritative = true;
        setUnread(n);
      } catch {
        if (!serverAuthoritative) setUnread(unreadCount());
      }
    };
    void recount();
    const unsubRealtime = subscribeToMyNotifications(() => { void recount(); });
    // Always listen for the in-app update event — it's how foreground pushes,
    // mark-read, dismiss, and delete actions sync the badge across the app.
    window.addEventListener("irth:notifications:updated", recount);
    if (androidStable) {
      return () => {
        window.removeEventListener("irth:notifications:updated", recount);
        unsubRealtime();
      };
    }
    const focus = () => { void recount(); };
    if (!disableGlobalFocusBlur) window.addEventListener("focus", focus);
    return () => {
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
      className="sticky top-0 z-40 mx-auto w-full max-w-md px-3 pt-2"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="glass flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-background/70 px-3 py-1.5 backdrop-blur-md">
        <div key={heartShake} className={`flex items-center gap-0.5 ${heartShake ? "hud-shake" : ""}`}>
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
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className={`inline-flex items-center gap-1 text-gold ${bumpCls("dinars")}`}>
            <Coins className="size-3.5" /> {profile.dinars.toLocaleString("en-US")}
          </span>
          <span className={`inline-flex items-center gap-1 text-amber-200 ${bumpCls("points")}`}>
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