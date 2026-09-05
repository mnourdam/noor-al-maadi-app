/**
 * Recoverable state for the Encyclopedia hub and category pages.
 *
 * Shown when the shared index query settled with an error, or when it has
 * stayed pending far longer than any healthy load should take. It replaces the
 * endless spinner with a controlled message plus a real Retry, while the
 * surrounding AppShell (and its bottom navigation) stays usable.
 */
export function EncyclopediaUnavailable({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      data-testid="encyclopedia-unavailable"
      className="mt-8 rounded-2xl border border-white/10 bg-surface/70 p-6 text-center"
    >
      <p className="text-xs text-muted-foreground">
        تعذّر فتح المكتبة الآن. تحقّق من الاتصال ثم أعد المحاولة.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 rounded-full border border-gold/40 bg-gold/10 px-5 py-2 text-[11px] font-bold text-gold disabled:opacity-60"
      >
        {retrying ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}
      </button>
    </div>
  );
}
