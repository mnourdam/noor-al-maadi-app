// ============================================================
// Locked item preview
// ------------------------------------------------------------
// Shared "this collectible is still locked" UI used by:
//   - /encyclopedia/entity/$id (direct URL safety)
// The museum cards & reveal dialog have their own inline locked
// states for visual consistency with the museum grid.
// ============================================================

import { Link } from "@tanstack/react-router";
import { Lock, ChevronRight, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export interface LockedItemViewProps {
  /** Localised type label, e.g. "أثر" / "معركة". */
  typeLabel?: string;
  /** Public-safe title. Falls back to "مقتنى غامض". */
  title?: string | null;
  /** Pre-built Arabic unlock hint from `useEntityUnlockState`. */
  unlockHint: string;
  /** Optional emoji glyph for the placeholder. */
  glyph?: string;
}

export function LockedItemView({ typeLabel, title, unlockHint, glyph = "❓" }: LockedItemViewProps) {
  const safeTitle = title?.trim() ? title : "مقتنى غامض";
  return (
    <AppShell>
      <div className="px-5 pt-8">
        <Link to="/encyclopedia" className="inline-flex items-center gap-1 text-[11px] text-gold/80 hover:text-gold">
          <ChevronRight className="size-3.5" /> الموسوعة
        </Link>

        <div className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-surface">
          {/* Blurred / dimmed preview */}
          <div className="relative grid h-40 place-items-center overflow-hidden bg-black/40">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
            <span className="select-none text-7xl opacity-25 blur-md grayscale" aria-hidden>
              {glyph}
            </span>
            <div className="absolute grid size-14 place-items-center rounded-2xl border border-gold/40 bg-black/60 shadow-gold">
              <Lock className="size-7 text-gold" />
            </div>
          </div>

          <div className="p-5 text-center">
            {typeLabel && (
              <p className="text-[11px] tracking-[0.3em] text-gold/80">{typeLabel}</p>
            )}
            <h1 className="font-display mt-1 text-2xl font-bold text-foreground/85">{safeTitle}</h1>
            <p className="mt-3 text-[13px] leading-7 text-foreground/80">
              هذا المقتنى لم يُفتح بعد
            </p>
            <p className="mt-1 text-[12px] leading-7 text-muted-foreground">
              أكمل الحملة أو الفصل المرتبط لاكتشافه.
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] text-gold">
              <Sparkles className="size-3.5" />
              {unlockHint}
            </div>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link
            to="/campaigns"
            className="inline-flex items-center justify-center rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-bold text-gold"
          >
            تابع رحلتك في الحملات
          </Link>
        </div>

        <div className="h-10" />
      </div>
    </AppShell>
  );
}
