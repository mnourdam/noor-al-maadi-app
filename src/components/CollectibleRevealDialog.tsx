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
import { Sparkles, BookOpen, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { audioManager } from "@/lib/audioManager";

import {
  RARITY_STYLE,
  normalizeRarity,
  type ArtifactRarity,
} from "@/lib/rarity";

export type CollectibleRarity = ArtifactRarity;

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
  /** Show a locked-preview variant instead of the reveal celebration. */
  locked?: boolean;
  /** Arabic hint shown for locked items, e.g. "ينفتح عند إكمال: <campaign>". */
  lockedHint?: string;
}

const RARITY_META = RARITY_STYLE;


export function CollectibleRevealDialog({
  item,
  onClose,
}: {
  item: CollectibleRevealItem | null;
  onClose: () => void;
}) {
  const open = !!item;
  const meta = item ? RARITY_META[normalizeRarity(item.rarity)] : RARITY_META.common;

  useEffect(() => {
    if (item && !item.locked) {
      audioManager.playSfx("unlock-reward", { dedupeKey: `reveal:${item.title}` });
    }
  }, [item]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-sm overflow-hidden border-white/10 bg-surface p-0 [&>button]:text-gold"
      >
        {item && (item.locked ? (
          <div className="relative">
            <div className="relative overflow-hidden p-6 text-center bg-gradient-to-b from-black/40 to-transparent">
              <div className="relative mx-auto grid size-24 place-items-center overflow-hidden rounded-2xl bg-black/60 ring-1 ring-gold/30">
                <span className="absolute select-none text-5xl opacity-25 blur-[3px] grayscale" aria-hidden>
                  {item.icon}
                </span>
                <Lock className="size-9 text-gold" />
              </div>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-[10px] font-bold tracking-wider text-gold ring-1 ring-gold/30">
                <Lock className="size-3" /> غير مكتشف
              </span>
              <DialogTitle className="font-display mt-2 text-2xl font-extrabold text-foreground/85">
                {item.title?.trim() ? item.title : "مقتنى غامض"}
              </DialogTitle>
              <p className="mt-1 text-xs text-gold/80">{item.subtitle}</p>
            </div>
            <div className="space-y-3 px-5 pb-5 text-center text-[12.5px] leading-7 text-foreground/85">
              <p className="font-bold">هذا المقتنى لم يُفتح بعد</p>
              <p className="text-muted-foreground">أكمل الحملة أو الفصل المرتبط لاكتشافه.</p>
              {item.lockedHint && (
                <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] text-gold">
                  <Sparkles className="size-3.5" />
                  {item.lockedHint}
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-xl border border-white/10 py-2.5 text-sm font-bold text-muted-foreground"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
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
                مكتشف في أرشيفك
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
                className="w-full rounded-xl border border-white/10 py-2.5 text-sm font-bold text-muted-foreground"
              >
                إغلاق
              </button>
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}

