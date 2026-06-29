import { useState } from "react";
import { Coins, HelpCircle, Hourglass, Lightbulb, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCrosswordHelpBridge } from "./crossword-help-bridge";
import { sfx } from "./sfx";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  dinars: number;
  spendDinars: (cost: number) => boolean;
  /** When false, the "+2 minutes" option is hidden (puzzle has no timer). */
  hasTimer: boolean;
  /** Imperative call into the host timer. */
  addSeconds: (seconds: number) => void;
  /** Disable both options once the puzzle ends or fails. */
  disabled?: boolean;
}

const REVEAL_COST = 10;
const TIME_COST = 10;
const TIME_BONUS_SECONDS = 120;

/**
 * Self-contained, hardcoded Help dialog for the Crossword mini-game.
 * Two options, no external configuration, no lazy loading, no routing.
 * Every branch is local and cannot throw out of this component.
 */
export function CrosswordHelpDialog({
  open, onOpenChange, dinars, spendDinars, hasTimer, addSeconds, disabled,
}: Props) {
  const [insufficientOpen, setInsufficientOpen] = useState(false);

  // Read bridge availability fresh each render. Never throws.
  let canReveal = false;
  try { canReveal = !!getCrosswordHelpBridge()?.hasUnrevealed(); } catch { canReveal = false; }

  const handleReveal = () => {
    if (disabled || !canReveal) return;
    if (dinars < REVEAL_COST) { onOpenChange(false); setInsufficientOpen(true); return; }
    let ok = false;
    try { ok = getCrosswordHelpBridge()?.revealOne() ?? false; } catch { ok = false; }
    if (!ok) return;
    if (!spendDinars(REVEAL_COST)) return;
    sfx("correct");
    toast.success(`تم كشف حرف مقابل ${REVEAL_COST} دنانير.`);
    onOpenChange(false);
  };

  const handleAddTime = () => {
    if (disabled || !hasTimer) return;
    if (dinars < TIME_COST) { onOpenChange(false); setInsufficientOpen(true); return; }
    if (!spendDinars(TIME_COST)) return;
    try { addSeconds(TIME_BONUS_SECONDS); } catch { /* noop */ }
    sfx("gold_unlock", "help-add-time");
    toast.success(`تمت إضافة دقيقتين مقابل ${TIME_COST} دنانير.`);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          dir="rtl"
          className="max-w-sm border-amber-500/30 bg-gradient-to-b from-slate-950 to-slate-900 text-amber-50"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-200">
              <HelpCircle className="h-5 w-5 text-amber-300" />
              المساعدة
            </DialogTitle>
            <DialogDescription className="text-amber-100/80 leading-7">
              اختر إحدى المساعدات لمواصلة المخطوط.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-300" />
              رصيدك
            </span>
            <span className="font-bold">{dinars} دينار</span>
          </div>

          <ul className="space-y-2">
            <li>
              <HelpRow
                icon={<Lightbulb className="h-4 w-4" />}
                title="كشف حرف"
                description={canReveal ? "كشف حرف واحد من كلمة لم تُحلَّ بعد." : "لا توجد حروف مخفية"}
                cost={REVEAL_COST}
                disabled={disabled || !canReveal}
                onClick={handleReveal}
              />
            </li>
            {hasTimer && (
              <li>
                <HelpRow
                  icon={<Hourglass className="h-4 w-4" />}
                  title="إضافة دقيقتين"
                  description="أضف دقيقتين إلى الوقت المتبقي."
                  cost={TIME_COST}
                  disabled={!!disabled}
                  onClick={handleAddTime}
                />
              </li>
            )}
          </ul>

          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-transparent px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/10"
            >
              <X className="h-4 w-4" />
              إغلاق
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={insufficientOpen} onOpenChange={setInsufficientOpen}>
        <DialogContent
          dir="rtl"
          className="max-w-sm border-amber-500/30 bg-gradient-to-b from-slate-950 to-slate-900 text-amber-50"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-200">
              <Coins className="h-5 w-5 text-amber-300" />
              ليس لديك دنانير كافية
            </DialogTitle>
            <DialogDescription className="text-amber-100/80 leading-7">
              اجمع المزيد من الدنانير من الحملات والتحديات ثم حاول مرة أخرى.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-3">
            <button
              type="button"
              onClick={() => setInsufficientOpen(false)}
              className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
            >
              حسنًا
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HelpRow({
  icon, title, description, cost, disabled, onClick,
}: {
  icon: React.ReactNode; title: string; description: string;
  cost: number; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-gradient-to-b from-amber-500/10 to-amber-600/5 px-3 py-3 text-right transition hover:from-amber-500/20 hover:to-amber-600/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200">
          {icon}
        </span>
        <span className="min-w-0">
          <p className="text-sm font-bold text-amber-100">{title}</p>
          <p className="mt-0.5 text-[11px] leading-6 text-amber-100/70">{description}</p>
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/50 bg-slate-950/60 px-2 py-1 text-[11px] font-bold text-amber-200">
        <Coins className="h-3 w-3" />
        {cost}
      </span>
    </button>
  );
}
