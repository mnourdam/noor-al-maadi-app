import { useEffect, useRef, useState } from "react";
import { Crown, Sparkles, Star, X, Coins, Shield } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { levelFor, type LevelInfo } from "@/lib/progression";

const SEEN_KEY = "irth.levelup.seen";

/**
 * Watches profile.points and shows a premium celebration whenever the
 * derived level increases. State is hydration-safe: the first observed
 * level after mount is treated as the baseline (no celebration on app
 * open), and the highest celebrated level is persisted so the modal
 * never replays for the same level after a reload.
 */
export function LevelUpWatcher() {
  const { profile } = useProfile();
  const baseline = useRef<number | null>(null);
  const [pending, setPending] = useState<LevelInfo[]>([]);
  const [current, setCurrent] = useState<LevelInfo | null>(null);

  useEffect(() => {
    const lvl = levelFor(profile.points).level;
    if (baseline.current === null) {
      // First observation after hydration — initialise baseline from the
      // higher of (current derived level, last celebrated level).
      let seen = 0;
      try { seen = parseInt(localStorage.getItem(SEEN_KEY) ?? "0", 10) || 0; } catch { /* */ }
      baseline.current = Math.max(lvl, seen);
      // Persist so a brand new player still records their starting level.
      try { localStorage.setItem(SEEN_KEY, String(baseline.current)); } catch { /* */ }
      return;
    }
    if (lvl > baseline.current) {
      const newOnes: LevelInfo[] = [];
      for (let l = baseline.current + 1; l <= lvl; l++) {
        const info = levelFor(thresholdAt(l)).level === l ? levelFor(thresholdAt(l)) : null;
        if (info) newOnes.push(info);
      }
      baseline.current = lvl;
      try { localStorage.setItem(SEEN_KEY, String(lvl)); } catch { /* */ }
      if (newOnes.length) setPending((q) => [...q, ...newOnes]);
    }
  }, [profile.points]);

  // Promote queued level-ups to the active modal one at a time.
  useEffect(() => {
    if (!current && pending.length > 0) {
      setCurrent(pending[0]);
      setPending((q) => q.slice(1));
    }
  }, [current, pending]);

  if (!current) return null;
  return <LevelUpModal info={current} onClose={() => setCurrent(null)} />;
}

// Lookup the minimum XP for a level via the shared table (avoid duplicating).
import { LEVELS } from "@/lib/progression";
function thresholdAt(level: number): number {
  const entry = LEVELS.find((l) => l.level === level);
  return entry ? entry.min : 0;
}

function LevelUpModal({ info, onClose }: { info: LevelInfo; onClose: () => void }) {
  const reward = info.reward;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-4 animate-fade-in" role="dialog" aria-modal>
      <button
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-br from-surface via-background to-surface p-6 shadow-elegant animate-scale-in">
        <button onClick={onClose} aria-label="إغلاق" className="absolute top-3 left-3 grid size-8 place-items-center rounded-full border border-white/10 bg-background/60 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
        <div className="arabesque-layer pointer-events-none absolute inset-0 opacity-25" aria-hidden />
        <div className="relative text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] tracking-[0.22em] text-gold">
            <Sparkles className="size-3" /> ترقية المستوى
          </span>
          <div className="mx-auto mt-5 grid size-24 place-items-center rounded-full bg-gradient-gold text-primary-foreground shadow-elegant">
            <div className="font-display text-3xl font-extrabold">{info.level}</div>
          </div>
          <h2 className="font-display mt-4 text-xl font-bold shimmer-text">
            وصلت إلى المستوى {info.level}
          </h2>
          <p className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[12px] font-bold text-gold">
            <Crown className="size-3.5" /> {info.title}
          </p>
          <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-[10px] tracking-[0.18em] text-muted-foreground">
            <Shield className="size-3" /> {info.rank}
          </p>

          {reward && (
            <div className="mt-5 rounded-2xl border border-gold/20 bg-background/40 p-4 text-right">
              <p className="text-[10px] tracking-[0.18em] text-gold/80 text-center">
                <Star className="inline size-3" /> مكافآت الترقية
              </p>
              <ul className="mt-3 space-y-2 text-[12px]">
                {reward.title && (
                  <li className="flex items-center gap-2">
                    <Crown className="size-3.5 text-gold" />
                    <span>لقب جديد: <span className="font-bold">{reward.title}</span></span>
                  </li>
                )}
                {reward.dinars !== undefined && reward.dinars > 0 && (
                  <li className="flex items-center gap-2">
                    <Coins className="size-3.5 text-amber-300" />
                    <span>{reward.dinars} دينار</span>
                  </li>
                )}
                {reward.cosmetic && (
                  <li className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-gold" />
                    <span>{reward.cosmetic.name}</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          <button
            onClick={onClose}
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-gold py-2.5 text-[12px] font-bold text-primary-foreground hover:opacity-95"
          >
            <Sparkles className="size-4" /> واصل الرحلة
          </button>
        </div>
      </div>
    </div>
  );
}
