// Renders an unlock (type:slug) as an Arabic chip with a type badge.
// Falls back to "عنصر غير موجود بالموسوعة" if the slug is missing.

import { useResolvedUnlocks, typeLabel } from "@/lib/campaignUnlocks";

interface Props {
  ids: string[];
  /** Compact one-line pills (default) vs. card list. */
  variant?: "pill" | "card";
}

export function UnlockList({ ids, variant = "pill" }: Props) {
  const { resolved, isLoading } = useResolvedUnlocks(ids);
  if (!ids.length) return null;

  if (variant === "card") {
    return (
      <ul className="space-y-2">
        {resolved.map((r) => (
          <li
            key={r.raw}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${
              r.found
                ? "border-gold/30 bg-gold/10 text-gold"
                : "border-amber-400/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            <span className="text-base leading-none">🔓</span>
            <span className="flex-1 font-bold">
              {r.found ? r.title : (isLoading ? "…" : "عنصر غير موجود بالموسوعة")}
            </span>
            <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] text-foreground/80">
              {typeLabel(r.type)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {resolved.map((r) => (
        <span
          key={r.raw}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
            r.found
              ? "border-gold/30 bg-gold/10 text-gold"
              : "border-amber-400/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          🔓 {r.found ? r.title : (isLoading ? "…" : "عنصر غير موجود بالموسوعة")}
          <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] text-foreground/70">
            {typeLabel(r.type)}
          </span>
        </span>
      ))}
    </div>
  );
}
