// Modal shown when the user runs out of hearts mid-campaign.

import { Heart, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import { msUntilNextHeart, HEART_MAX, getEffectiveHearts } from "@/lib/hearts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function formatMs(ms: number): string {
  if (ms <= 0) return "الآن";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OutOfHeartsModal({ open, onClose }: Props) {
  const { profile, spendDinarsForHeart } = useProfile();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const eff = getEffectiveHearts(profile);
  const ms = msUntilNextHeart(profile);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl border border-rose-400/40 bg-gradient-to-b from-rose-950/80 via-surface to-stone-950/80 p-6 text-center">
        <DialogTitle className="sr-only">نفدت قلوبك</DialogTitle>
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-rose-400/40 bg-rose-500/20">
          <Heart className="size-7 text-rose-300" />
        </div>
        <h3 className="font-display mt-3 text-lg font-bold text-rose-100">نفدت قلوبك</h3>
        <p className="mt-1 text-[12px] text-rose-100/80">
          انتظر حتى تتجدد القلوب أو احصل على قلوب إضافية.
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[12px] text-foreground/90">
          <Clock className="size-3.5 text-rose-300" />
          القلب التالي خلال {formatMs(ms)}
          <span className="text-muted-foreground">· {eff}/{HEART_MAX}</span>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => spendDinarsForHeart()}
            className="rounded-xl border border-amber-300/40 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-100"
          >
            استبدال 20 دينارًا بقلب
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-muted-foreground"
          >
            عودة لاحقًا
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
