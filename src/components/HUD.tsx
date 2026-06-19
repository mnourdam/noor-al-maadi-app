import { useEffect, useState } from "react";
import { Heart, Coins, Flame } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { HEART_MAX, getEffectiveHearts, msUntilNextHeart } from "@/lib/hearts";

/**
 * Compact top-of-screen HUD: hearts, dinars, streak.
 * Lives inside AppShell so every screen sees it.
 */
export function HUD() {
  const { profile } = useProfile();
  const [, force] = useState(0);

  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
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
            <Coins className="size-3.5" /> {profile.dinars.toLocaleString("ar-EG")}
          </span>
          <span className="inline-flex items-center gap-1 text-orange-400">
            <Flame className="size-3.5" /> {profile.streak.toLocaleString("ar-EG")}
          </span>
        </div>
      </div>
    </div>
  );
}