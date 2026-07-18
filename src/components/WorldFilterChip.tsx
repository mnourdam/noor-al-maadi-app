import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Active-filter chip shown at the top of /campaigns and /investigations
 * when a `?world=<slug>` query is present. Arabic RTL. Clicking the
 * remove icon invokes `onClear`. The chip is a plain button so screen
 * readers announce the action.
 */
export function WorldFilterChip({
  worldTitle,
  onClear,
  icon,
}: {
  worldTitle: string;
  onClear: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2" dir="rtl">
      <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12px] font-bold text-gold">
        {icon}
        <span>العالم: {worldTitle}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="إزالة الفلتر"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-muted-foreground transition hover:border-gold/40 hover:text-gold"
      >
        <X className="size-3.5" />
        <span>إزالة الفلتر</span>
      </button>
    </div>
  );
}
