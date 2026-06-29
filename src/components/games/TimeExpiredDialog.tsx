import { useState } from "react";
import { Hourglass, Coins, X, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  /** Player's current dinar balance. */
  dinars: number;
  /** Buy +2:00. Should: deduct 10 dinars, add 120s, close, resume. */
  onBuyTime: () => void;
  /** End the attempt: apply normal timeout penalty (heart, fail state). */
  onEndChallenge: () => void;
}

const COST = 10;

/**
 * Premium "Time Expired" grace dialog shown for any timed mini-game when the
 * countdown reaches zero. Gives the player one chance to buy 2 extra minutes
 * before the normal timeout penalty is applied.
 *
 * Self-contained: handles the insufficient-funds warning inline and keeps
 * the parent grace dialog mounted until the player explicitly picks an action.
 */
export function TimeExpiredDialog({ open, dinars, onBuyTime, onEndChallenge }: Props) {
  const [warnOpen, setWarnOpen] = useState(false);
  const canAfford = dinars >= COST;

  const handleBuy = () => {
    if (!canAfford) { setWarnOpen(true); return; }
    onBuyTime();
  };

  return (
    <>
      {/* Primary grace dialog — non-dismissible: the player must choose. */}
      <Dialog open={open}>
        <DialogContent
          dir="rtl"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="max-w-md overflow-hidden border-amber-400/40 bg-gradient-to-b from-slate-950 via-slate-950 to-amber-950/30 p-0 text-right shadow-[0_30px_80px_-20px_rgba(251,191,36,0.35)]"
        >
          <div className="relative px-6 pt-8 pb-6">
            <div className="pointer-events-none absolute inset-x-0 -top-16 mx-auto h-32 w-32 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border border-amber-400/50 bg-amber-500/15 shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)]">
              <Hourglass className="h-8 w-8 text-amber-300" />
            </div>
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-xl font-bold text-amber-100">
                انتهى الوقت
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-7 text-slate-300">
                يمكنك إضافة دقيقتين ومتابعة التحدي مقابل {COST} دنانير.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleBuy}
                className="group inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-gradient-to-b from-amber-400 to-amber-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-[0_8px_20px_-8px_rgba(251,191,36,0.7)] transition hover:from-amber-300 hover:to-amber-400"
              >
                <Hourglass className="h-4 w-4" />
                إضافة دقيقتين
                <span className="mx-1 opacity-60">—</span>
                <Coins className="h-4 w-4" />
                {COST} دنانير
              </button>
              <button
                type="button"
                onClick={onEndChallenge}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200"
              >
                <X className="h-4 w-4" />
                إنهاء التحدي
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
              <Coins className="h-3 w-3 text-amber-400/70" />
              <span>رصيدك الحالي: {dinars} دينار</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Insufficient funds — nested; closing returns to the grace dialog. */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent
          dir="rtl"
          className="max-w-sm border-rose-400/40 bg-slate-950 p-0 text-right"
        >
          <div className="px-6 pt-7 pb-5">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-rose-400/40 bg-rose-500/10">
              <AlertTriangle className="h-6 w-6 text-rose-300" />
            </div>
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-base font-bold text-rose-100">
                لا توجد دنانير كافية
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-7 text-slate-300">
                تحتاج إلى {COST} دنانير لإضافة دقيقتين إلى الوقت.
              </DialogDescription>
            </DialogHeader>
            <button
              type="button"
              onClick={() => setWarnOpen(false)}
              className="mt-5 w-full rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-100 hover:bg-amber-500/20"
            >
              حسنًا
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
