import { Sparkles, RefreshCcw, X } from "lucide-react";
import { useEncyclopediaUpdateAvailable } from "@/lib/encyclopedia-update-check";

/**
 * Elegant in-app "new encyclopedia content is available" banner.
 *
 * Only renders when a background check detects that the remote content
 * has been updated after the user opened the app. Tapping "تحديث الآن"
 * runs an incremental sync and hot-refreshes the current page.
 */
export function EncyclopediaUpdateBanner() {
  const { available, refreshing, runRefresh, dismiss } = useEncyclopediaUpdateAvailable();
  if (!available) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in mb-4 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-l from-gold/12 via-background/70 to-background/60 px-4 py-3 shadow-[0_10px_30px_-18px_oklch(0.82_0.14_82/0.55)] backdrop-blur-md"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold/15 ring-1 ring-gold/30 text-gold">
        <Sparkles className="size-4.5" strokeWidth={1.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[13px] font-bold text-foreground">
          يوجد تحديث جديد للموسوعة
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          محتوى جديد أصبح متاحًا. حدّث الآن لعرضه دون إعادة التشغيل.
        </p>
      </div>
      <button
        type="button"
        onClick={() => { void runRefresh(); }}
        disabled={refreshing}
        className="motion-tap inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1.5 text-[11px] font-bold text-gold transition hover:bg-gold/25 disabled:opacity-60"
      >
        <RefreshCcw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
        {refreshing ? "جارٍ التحديث…" : "تحديث الآن"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إغلاق"
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
