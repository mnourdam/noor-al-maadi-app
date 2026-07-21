import { useEffect, useRef, useState, useCallback } from "react";
import { Crown, Sparkles, Star, X, Coins, Shield } from "lucide-react";
import { useProfile } from "@/lib/profile";
import { LEVELS, levelFor, type LevelInfo } from "@/lib/progression";
import { ModalPortal } from "@/components/ModalPortal";
import { OverlayDismissRegistration } from "@/lib/navigation/overlay-registration";

const SEEN_KEY = "irth.levelup.seen";

/**
 * Shows a premium celebration ONLY for genuine, incremental level-ups.
 *
 * Rules:
 *  - On first mount, baseline = max(currentLevel, persistedSeen). No toast.
 *  - On any level change of more than +1 (cloud sync / login restore / admin
 *    grant), silently re-baseline. No toast spam.
 *  - On exactly +1 increase, queue one celebration.
 *  - Persisted seen level always tracks max(seen, currentLevel) so the dialog
 *    can never replay past levels after a reload or re-login.
 */
export function LevelUpWatcher() {
  const { profile } = useProfile();
  const baseline = useRef<number | null>(null);
  const [pending, setPending] = useState<LevelInfo[]>([]);
  const [current, setCurrent] = useState<LevelInfo | null>(null);

  useEffect(() => {
    const lvl = levelFor(profile.points).level;
    let seen = 0;
    try { seen = parseInt(localStorage.getItem(SEEN_KEY) ?? "0", 10) || 0; } catch { /* */ }

    if (baseline.current === null) {
      baseline.current = Math.max(lvl, seen);
      try { localStorage.setItem(SEEN_KEY, String(baseline.current)); } catch { /* */ }
      return;
    }

    if (lvl <= baseline.current) return;

    if (lvl - baseline.current > 1 || lvl <= seen) {
      baseline.current = Math.max(lvl, seen);
      try { localStorage.setItem(SEEN_KEY, String(baseline.current)); } catch { /* */ }
      return;
    }

    const next = LEVELS.find((l) => l.level === lvl);
    baseline.current = lvl;
    try { localStorage.setItem(SEEN_KEY, String(lvl)); } catch { /* */ }
    if (next) {
      setPending((q) => {
        if (current?.level === next.level) return q;
        if (q.some((p) => p.level === next.level)) return q;
        return [...q, next];
      });
    }
  }, [profile.points, current]);

  useEffect(() => {
    if (!current && pending.length > 0) {
      const head = pending[0];
      setCurrent(head);
      setPending((q) => q.slice(1));
      try { window.dispatchEvent(new CustomEvent("irth:level-up", { detail: { level: head.level } })); } catch { /* */ }
    }
  }, [current, pending]);

  const close = useCallback(() => {
    setCurrent(null);
  }, []);

  if (!current) return null;
  return <LevelUpModal key={current.level} info={current} onClose={close} />;
}

function LevelUpModal({ info, onClose }: { info: LevelInfo; onClose: () => void }) {
  const reward = info.reward;
  const closedRef = useRef(false);

  // Both X and "واصل الرحلة" execute the identical close action. Guarded
  // against double-invocation but never disabled — buttons must always
  // respond visually and functionally to a tap.
  const handleClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose]);

  return (
    <ModalPortal>
      <OverlayDismissRegistration open onClose={handleClose} label="level-up" />
      <div className="fixed inset-0 z-[120] grid place-items-center px-4 animate-fade-in" role="dialog" aria-modal>
        <button
          type="button"
          aria-label="إغلاق"
          onClick={handleClose}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        />
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-br from-surface via-background to-surface p-6 shadow-elegant animate-scale-in">
          <button
            type="button"
            onClick={handleClose}
            aria-label="إغلاق"
            className="absolute top-3 left-3 z-10 grid size-8 place-items-center rounded-full border border-white/10 bg-background/60 text-muted-foreground hover:text-foreground"
          >
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
              type="button"
              onClick={handleClose}
              className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-gold py-2.5 text-[12px] font-bold text-primary-foreground hover:opacity-95"
            >
              <Sparkles className="size-4" /> واصل الرحلة
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
