import { useMemo, useState } from "react";
import { Coins, HelpCircle, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useGameHelp, type HelpOption } from "./GameHelpContext";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  dinars: number;
  /** Deduct `cost` dinars. Returns true on success. */
  spendDinars: (cost: number) => boolean;
  /** Always-on options provided by the host (e.g. the timer "+2 min"). */
  builtinOptions?: HelpOption[];
}

/**
 * Unified, premium Help dialog used across every mini-game.
 */
export function GameHelpDialog({ open, onOpenChange, dinars, spendDinars, builtinOptions = [] }: Props) {
  const ctx = useGameHelp();
  
  const options = useMemo(() => {
    return [...builtinOptions, ...(ctx?.options ?? [])];
  }, [builtinOptions, ctx?.options]);

  const [insufficientOpen, setInsufficientOpen] = useState(false);
  const [pendingCost, setPendingCost] = useState<number>(0);

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
              اختر إحدى المساعدات المتاحة لمواصلة التحدّي.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-1 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            <span className="inline-flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5 text-amber-300" />
              رصيدك
            </span>
            <span className="font-bold">{dinars} دينار</span>
          </div>

          {options.length === 0 ? (
            <p className="rounded-lg border border-amber-500/15 bg-slate-900/60 px-3 py-3 text-center text-xs text-slate-400">
              لا تتوفّر مساعدات في هذه اللعبة حاليًا.
            </p>
          ) : (
            <ul className="space-y-2">
              {options.map((opt, idx) => {
                let available = true;
                try { available = opt.getAvailable?.() ?? true; } catch { available = true; }
                const affordable = dinars >= opt.cost;
                const disabled = !available;
                return (
                  <li key={opt.id || idx}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        if (!affordable) {
                          setPendingCost(opt.cost);
                          onOpenChange(false);
                          setInsufficientOpen(true);
                          return;
                        }
                        let ok = false;
                        try { ok = opt.perform({ pay: () => spendDinars(opt.cost) }); } catch (err) {
                          // eslint-disable-next-line no-console
                          console.warn("[GameHelp] option failed", opt.id, err);
                          ok = false;
                        }
                        if (ok) onOpenChange(false);
                      }}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-gradient-to-b from-amber-500/10 to-amber-600/5 px-3 py-3 text-right transition hover:from-amber-500/20 hover:to-amber-600/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-400/40 bg-amber-500/10 text-amber-200">
                          {opt.icon}
                        </span>
                        <span className="min-w-0">
                          <p className="text-sm font-bold text-amber-100">{opt.label}</p>
                          <p className="mt-0.5 text-[11px] leading-6 text-amber-100/70">
                            {opt.description}
                          </p>
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/50 bg-slate-950/60 px-2 py-1 text-[11px] font-bold text-amber-200">
                        <Coins className="h-3 w-3" />
                        {opt.cost}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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
              تحتاج إلى {pendingCost} دنانير لاستخدام هذه المساعدة. اجمع المزيد من الدنانير من الحملات والتحديات ثم حاول مرة أخرى.
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
