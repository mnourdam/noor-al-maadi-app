// Final-completion modal for an imported campaign.
// Lists XP, coins, and resolves unlock IDs to Arabic encyclopedia titles.

import { Sparkles, Zap, Coins, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UnlockList } from "./UnlockList";

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  xp: number;
  coins: number;
  unlockIds: string[];
  campaignTitle: string;
}

export function CampaignCompleteModal({
  open, onClose, campaignId, xp, coins, unlockIds, campaignTitle,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl border border-gold/50 bg-gradient-to-b from-amber-900/40 via-surface to-stone-950/80 p-6 text-center">
        <DialogTitle className="sr-only">أتممت الحملة</DialogTitle>
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-gold/60 bg-gold/15">
          <Trophy className="size-7 text-gold" />
        </div>
        <h3 className="font-display mt-3 text-xl font-bold shimmer-text">أتممتَ الحملة</h3>
        <p className="mt-1 text-sm text-gold/80">{campaignTitle}</p>

        <div className="mt-5 flex items-center justify-center gap-3 text-[13px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-200">
            <Zap className="size-3.5" /> +{xp} XP
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-200">
            <Coins className="size-3.5" /> +{coins} دينار
          </span>
        </div>

        {unlockIds.length > 0 && (
          <div className="mt-5 text-right">
            <div className="mb-2 flex items-center gap-1 text-[11px] tracking-widest text-gold/80">
              <Sparkles className="size-3.5" /> فُتح في موسوعتك
            </div>
            <UnlockList ids={unlockIds} variant="card" />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/collection"
            className="rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold"
            onClick={onClose}
          >
            افتح المتحف
          </Link>
          <Link
            to="/campaigns/imported/$id"
            params={{ id: campaignId }}
            className="rounded-xl border border-white/10 py-2 text-xs text-muted-foreground"
            onClick={onClose}
          >
            عودة لختام الحملة
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
