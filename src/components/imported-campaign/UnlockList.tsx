// Renders an unlock (type:slug) as an Arabic chip with a type badge.
// Resolves IDs through the encyclopedia. Never shows raw English IDs to
// normal users — falls back to a friendly placeholder.

import { useResolvedUnlocks, typeLabel } from "@/lib/campaignUnlocks";

interface Props {
  ids: string[];
  /** Compact one-line pills (default) vs. card list. */
  variant?: "pill" | "card";
  /** Show raw IDs / "missing from encyclopedia" warning. Admin/dev only. */
  debug?: boolean;
}

function friendlyTitle(slug: string | null): string {
  if (!slug) return "مكافأة جديدة";
  // Slug → spaced words as a last-resort label so we never show kebab-case.
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UnlockList({ ids, variant = "pill", debug = false }: Props) {
  const { resolved, isLoading } = useResolvedUnlocks(ids);
  if (!ids.length) return null;

  if (variant === "card") {
    return (
      <ul className="space-y-2">
        {resolved.map((r) => {
          const label = r.found
            ? r.title!
            : isLoading
              ? "…"
              : debug
                ? "عنصر غير موجود بالموسوعة"
                : friendlyTitle(r.slug);
          return (
            <li
              key={r.raw}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${
                r.found
                  ? "border-gold/30 bg-gold/10 text-gold"
                  : "border-gold/20 bg-gold/5 text-gold/80"
              }`}
            >
              <span className="text-base leading-none">🔓</span>
              <span className="flex-1 font-bold">{label}</span>
              <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] text-foreground/80">
                {typeLabel(r.type)}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      {resolved.map((r) => {
        const label = r.found
          ? r.title!
          : isLoading
            ? "…"
            : debug
              ? "عنصر غير موجود بالموسوعة"
              : friendlyTitle(r.slug);
        return (
          <span
            key={r.raw}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
              r.found
                ? "border-gold/30 bg-gold/10 text-gold"
                : "border-gold/20 bg-gold/5 text-gold/80"
            }`}
          >
            🔓 {label}
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] text-foreground/70">
              {typeLabel(r.type)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

