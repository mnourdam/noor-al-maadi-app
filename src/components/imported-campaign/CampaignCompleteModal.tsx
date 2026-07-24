// Final-completion modal for an imported campaign.
// Lists XP, coins, and resolves unlock IDs to Arabic encyclopedia titles.

import { Sparkles, Zap, Coins, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UnlockList } from "./UnlockList";
import { AnimatedNumber, Stagger } from "@/components/motion/MotionPrimitives";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  xp: number;
  coins: number;
  unlockIds: string[];
  campaignTitle: string;
  /** When true, hide numeric rewards and show the legacy-unavailable notice. */
  legacyRewardsUnavailable?: boolean;
}

export function CampaignCompleteModal({
  open, onClose, campaignId, xp, coins, unlockIds, campaignTitle,
  legacyRewardsUnavailable = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[90vh] max-w-md flex-col overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-b from-amber-900/40 via-surface to-stone-950/80 p-0 text-center"
      >
        <DialogTitle className="sr-only">أتممت الحملة</DialogTitle>

        {/* Sticky header */}
        <div className="shrink-0 border-b border-white/5 bg-stone-950/60 px-6 pb-4 pt-6 backdrop-blur">
          <div className="motion-unlock-glow mx-auto grid size-14 place-items-center rounded-full border border-gold/60 bg-gold/15">
            <Trophy className="size-7 text-gold" />
          </div>
          <h3 className="font-display mt-3 text-xl font-bold shimmer-text">أتممتَ الحملة</h3>
          <p className="mt-1 text-sm text-gold/80">{campaignTitle}</p>
          {!legacyRewardsUnavailable && (
            <Stagger className="mt-4 flex items-center justify-center gap-3 text-[13px]">
              <span className="motion-reveal is-in inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-200">
                <Zap className="size-3.5" /> +<AnimatedNumber value={xp} /> XP
              </span>
              <span className="motion-reveal is-in inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-200">
                <Coins className="size-3.5" /> +<AnimatedNumber value={coins} /> دينار
              </span>
            </Stagger>
          )}
        </div>

        {/* Scrollable body */}
        <div
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-right"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {legacyRewardsUnavailable ? (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-center">
              <p className="text-sm font-bold text-gold">بيانات المكافآت غير متوفرة</p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                هذه الحملة أُنجزت قبل اعتماد نظام سجل المكافآت الحالي، لذلك لا يمكن عرض تفاصيل المكافآت المكتسبة بدقة.
              </p>
            </div>
          ) : unlockIds.length > 0 ? (
            <>
              <div className="mb-2 flex items-center gap-1 text-[11px] tracking-widest text-gold/80">
                <Sparkles className="size-3.5" /> فُتح في موسوعتك ({unlockIds.length})
              </div>
              <UnlockList ids={unlockIds} variant="card" />
            </>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">لا توجد مكافآت إضافية.</p>
          )}
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-white/5 bg-stone-950/60 px-6 py-4 backdrop-blur">
          <div className="flex flex-col gap-2">
            <Link
              to="/collection"
              className="motion-tap rounded-xl bg-gradient-gold py-2.5 text-center text-sm font-bold text-primary-foreground shadow-gold"
              onClick={onClose}
            >
              افتح المتحف
            </Link>
            <Link
              to="/campaigns/imported/$id"
              params={{ id: campaignId }}
              className="motion-tap rounded-xl border border-white/10 py-2 text-center text-xs text-muted-foreground"
              onClick={onClose}
            >
              عودة لختام الحملة
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
