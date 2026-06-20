// Unified discovery / reveal modal for ALL collectibles.
// Used by:
//  - /collection (legacy + imported + Supabase encyclopedia unlocks)
//  - imported-campaign reward lists (UnlockList) and completion modal
//
// Goal: every unlocked item — regardless of source (legacy data.ts,
// imported registry, or encyclopedia_entities) — surfaces through the
// SAME visual presentation: rarity ribbon, SFX, title, subtitle,
// summary lines, source-campaign chip, and an "open in encyclopedia"
// action when an entity slug is available.

import { useEffect } from "react";
import { Sparkles, BookOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { audioManager } from "@/lib/audioManager";

export type CollectibleRarity = "common" | "rare" | "epic" | "legendary";

export interface CollectibleRevealItem {
  rarity: CollectibleRarity;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  lines: string[];
  /** e.g. "من حملة البعثة النبوية" or "من الموسوعة". */
  sourceLabel?: string;
  /** Already in archive — show confirmation copy instead of "add". */
  alreadyOwned?: boolean;
  /** If provided, render an "افتح في الموسوعة" button. */
  onOpenEncyclopedia?: () => void;
}

const RARITY_META: Record<CollectibleRarity, { label: string; chip: string; wash: string }> = {
  common:    { label: "عادي",   chip: "bg-white/10 text-white/70",                        wash: "from-white/10 to-transparent" },
  rare:      { label: "نادر",   chip: "bg-sky-400/15 text-sky-200",                       wash: "from-sky-400/20 via-sky-400/5 to-transparent" },
  epic:      { label: "ملحمي",  chip: "bg-fuchsia-400/15 text-fuchsia-200",               wash: "from-fuchsia-400/20 via-fuchsia-400/5 to-transparent" },
  legendary: { label: "أسطوري", chip: "bg-gradient-gold text-primary-foreground",         wash: "from-gold/25 via-gold/5 to-transparent" },
};

export function CollectibleRevealDialog({
  item,
  onClose,
}: {
  item: CollectibleRevealItem | null;
  onClose: () => void;
}) {
  const open = !!item;
  const meta = item ? RARITY_META[item.rarity] : RARITY_META.common;

  useEffect(() => {
    if (item) {
      audioManager.playSfx("unlock-reward", { dedupeKey: `reveal:${item.title}` });
    }
  }, [item]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-sm overflow-hidden border-white/10 bg-surface p-0 [&>button]:text-gold"
      >
        {item && (
          <div className="relative">
            <div className={`relative overflow-hidden p-6 text-center bg-gradient-to-b ${meta.wash}`}>
              <div
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 30%, oklch(0.82 0.14 82 / 0.25), transparent 40%), radial-gradient(circle at 80% 70%, oklch(0.82 0.14 82 / 0.15), transparent 45%)",
                }}
              />
              <div className="reward-burst relative mx-auto grid size-24 place-items-center overflow-hidden rounded-2xl bg-black/40 text-5xl ring-1 ring-white/10 animate-gold-pulse">
                {item.icon}
              </div>
              <span className={`mt-3 inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${meta.chip}`}>
                <Sparkles className="me-1 inline size-3" />
                {meta.label} · اكتُشف
              </span>
              <DialogTitle className="font-display shimmer-text mt-2 text-2xl font-extrabold">
                {item.title}
              </DialogTitle>
              <p className="mt-1 text-xs text-gold/90">{item.subtitle}</p>
              {item.sourceLabel && (
                <p className="mt-1 text-[10px] tracking-wider text-gold/70">{item.sourceLabel}</p>
              )}
            </div>

            <div className="space-y-2 p-5 text-[12.5px] leading-7 text-foreground/85">
              {item.lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
              <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-center text-[11px] font-bold text-emerald-200">
                تمت إضافته إلى أرشيفك
              </p>
            </div>

            <div className="flex flex-col gap-2 px-5 pb-5">
              {item.onOpenEncyclopedia && (
                <button
                  onClick={() => { item.onOpenEncyclopedia?.(); onClose(); }}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-gold/40 bg-gold/10 py-2.5 text-sm font-bold text-gold"
                >
                  <BookOpen className="size-4" /> افتح في الموسوعة
                </button>
              )}
              <button
                onClick={onClose}
                className={`w-full rounded-xl py-2.5 text-sm font-bold ${
                  item.alreadyOwned
                    ? "border border-white/10 text-muted-foreground"
                    : "bg-gradient-gold text-primary-foreground shadow-gold"
                }`}
              >
                {item.alreadyOwned ? "إغلاق" : "أضف إلى أرشيفي"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
