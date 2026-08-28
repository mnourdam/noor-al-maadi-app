import { Sparkles, RefreshCcw, Loader2, X } from "lucide-react";
import { useContentUpdate } from "@/lib/offline-content-update";

/**
 * Global "content update available" banner.
 *
 * Canonical content is never replaced silently: the app only DETECTS that
 * newer content exists and lets the player apply it. Applying is staged
 * (download → validate → persist → activate) and rolls back on failure,
 * so a mid-update interruption can never leave a half-updated app.
 */
export function ContentUpdateBanner() {
  const { available, applying, error, apply, dismiss } = useContentUpdate();

  if (!available) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[60] flex justify-center px-3"
    >
      <div className="animate-fade-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-l from-gold/12 via-background/85 to-background/80 px-4 py-3 shadow-[0_10px_30px_-18px_oklch(0.82_0.14_82/0.55)] backdrop-blur-md">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30">
          <Sparkles className="size-4.5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[13px] font-bold text-foreground">
            يتوفر تحديث للمحتوى
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {error
              ? `تعذّر التحديث: ${error}`
              : "محتوى جديد أصبح متاحًا. سيبقى المحتوى الحالي كما هو حتى تختار التحديث."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void apply(); }}
          disabled={applying}
          aria-busy={applying}
          className="motion-tap inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 text-[11px] font-bold text-gold transition hover:bg-gold/25 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {applying ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={1.8} />
          ) : (
            <RefreshCcw className="size-3.5" strokeWidth={1.8} />
          )}
          {applying ? "جارٍ التحديث…" : "تحديث الآن"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={applying}
          aria-label="إغلاق"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground disabled:opacity-40"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
