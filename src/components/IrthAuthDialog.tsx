import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  subscribeAuthDialog,
  closeAuthDialog,
  type AuthDialogOptions,
  type AuthDialogTone,
} from "@/lib/authDialog";
import { CheckCircle2, Mail, AlertTriangle, XCircle, Loader2 } from "lucide-react";

const TONE_ICON: Record<AuthDialogTone, React.ComponentType<{ className?: string }>> = {
  info: Mail,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const TONE_RING: Record<AuthDialogTone, string> = {
  info: "border-gold/50 bg-gold/10 text-gold",
  success: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-400/50 bg-amber-500/10 text-amber-200",
  error: "border-rose-400/50 bg-rose-500/10 text-rose-200",
};

/**
 * Global branded modal for all Irth auth / email-flow notices. Mounted once
 * inside `__root.tsx`. Only one instance renders at a time; opening a new
 * dialog replaces the current one (no stacking).
 */
export function IrthAuthDialog() {
  const [opts, setOpts] = useState<AuthDialogOptions | null>(null);
  const [busy, setBusy] = useState<"primary" | "secondary" | null>(null);

  useEffect(() => subscribeAuthDialog((next) => {
    setOpts(next);
    if (!next) setBusy(null);
  }), []);

  if (!opts) return null;

  const tone = opts.tone ?? "info";
  const Icon = TONE_ICON[tone];

  async function run(which: "primary" | "secondary") {
    const action = which === "primary" ? opts!.primary : opts!.secondary;
    if (!action) return;
    setBusy(which);
    try {
      await action.onClick?.();
    } finally {
      setBusy(null);
      if (!action.keepOpen) closeAuthDialog();
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !opts.mandatory && !busy) closeAuthDialog();
      }}
    >
      <DialogContent
        dir="rtl"
        onEscapeKeyDown={(e) => { if (opts.mandatory) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (opts.mandatory) e.preventDefault(); }}
        className="max-w-[420px] overflow-hidden border-gold/30 bg-[radial-gradient(circle_at_20%_0%,#0d1a33,transparent_60%),radial-gradient(circle_at_80%_100%,#0b1428_0%,#070e1c_75%)] p-0 text-right shadow-elegant"
      >
        {/* Decorative parchment / arabesque layer */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_20%_30%,#f5c97a_0,transparent_45%),radial-gradient(circle_at_80%_70%,#f5c97a_0,transparent_40%)]" />
        <div className="relative p-6">
          <div className={`mx-auto mb-4 grid size-14 place-items-center rounded-2xl border ${TONE_RING[tone]}`}>
            <Icon className="size-7" />
          </div>

          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="font-display text-lg font-bold text-amber-50">
              {opts.title}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-7 text-white/75">
              {opts.body}
            </DialogDescription>
          </DialogHeader>

          {opts.detail && (
            <p
              className="mt-3 rounded-lg border border-gold/25 bg-black/40 px-3 py-2 text-center text-[13px] font-medium text-gold/90"
              dir="ltr"
            >
              {opts.detail}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void run("primary")}
              className="min-h-[44px] w-full rounded-xl bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground shadow-gold transition active:scale-[0.99] disabled:opacity-60"
            >
              {busy === "primary" ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> جارٍ التنفيذ…
                </span>
              ) : opts.primary.label}
            </button>
            {opts.secondary && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("secondary")}
                className="min-h-[44px] w-full rounded-xl border border-gold/40 bg-transparent py-2.5 text-sm font-semibold text-gold transition active:scale-[0.99] disabled:opacity-60"
              >
                {busy === "secondary" ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> جارٍ التنفيذ…
                  </span>
                ) : opts.secondary.label}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
